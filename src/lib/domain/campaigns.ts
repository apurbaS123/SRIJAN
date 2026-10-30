// Managed influencer campaigns: brand books a call → ops runs the deal → creators paid → Srijan keeps 30–35%.
import { CAMPAIGN_COMMISSION, CAMPAIGN_STAGES } from "./config";
import type { Campaign, CampaignStage, DB } from "./types";
import { assert, cleanText, newId, nextCode, parseIstLocal, rupees } from "./util";

const CALL_MODES: Campaign["callMode"][] = ["video", "phone", "office"];

export interface NewCampaignInput {
  brandName: string;
  contactName: string;
  email: string;
  phone: string;
  goal: string;
  regions: string[];
  budgetRange: string;
  callAt: string; // IST local
  callMode: Campaign["callMode"];
}

export function createCampaign(db: DB, input: NewCampaignInput, userId: string | undefined, now: number) {
  const brandName = cleanText(input.brandName, 100, "your brand or company name");
  const contactName = cleanText(input.contactName, 80, "your name");
  const email = cleanText(input.email, 200, "a valid work email");
  assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), "Enter a valid work email");
  const phone = cleanText(input.phone, 20, "a 10-digit phone number");
  assert(/^[+\d\s()-]+$/.test(phone) && phone.replace(/\D/g, "").length >= 10, "Enter a 10-digit phone number");
  const callAt = parseIstLocal(String(input.callAt ?? ""));
  assert(!Number.isNaN(callAt) && callAt > now, "Pick a call time in the future");
  assert(callAt <= now + 90 * 24 * 60 * 60_000, "Pick a call time within the next 90 days");
  const callMode = input.callMode ?? "video";
  assert(CALL_MODES.includes(callMode), "Pick how you'd like to meet");
  const regionList = Array.isArray(input.regions) ? input.regions : [];
  assert(regionList.length <= 10, "Pick at most 10 regions");
  const regions = regionList.map((r) => cleanText(r, 40, "a region")).filter(Boolean);
  const c: Campaign = {
    id: newId("cmp"),
    code: nextCode(db, "CMP"),
    userId,
    brandName,
    contactName,
    email,
    phone,
    goal: cleanText(input.goal, 100, "the goal", true) || "Brand awareness",
    regions: regions.length ? regions : ["Assam"],
    budgetRange: cleanText(input.budgetRange, 60, "the budget", true) || "Not sure yet",
    callAt,
    callMode,
    stage: "call_booked",
    budget: null,
    commissionRate: CAMPAIGN_COMMISSION.default,
    advancePaid: false,
    balancePaid: false,
    creators: [],
    notes: "",
    createdAt: now,
  };
  db.campaigns.push(c);
  return c;
}

export function campaignMath(c: Campaign) {
  const budget = c.budget ?? 0;
  const commission = rupees(budget * c.commissionRate);
  const creatorPool = budget - commission;
  const committed = c.creators.filter((x) => x.status !== "declined").reduce((s, x) => s + x.fee, 0);
  return { budget, commission, creatorPool, committed, remaining: creatorPool - committed };
}

function get(db: DB, id: string) {
  const c = db.campaigns.find((x) => x.id === id);
  assert(c, "Campaign not found", 404);
  return c;
}

export interface CampaignUpdate {
  budget?: number | null;
  commissionRate?: number;
  stage?: CampaignStage;
  notes?: string;
  advancePaid?: boolean;
  balancePaid?: boolean;
}

export function updateCampaign(db: DB, id: string, patch: CampaignUpdate) {
  const c = get(db, id);
  assert(c.stage !== "closed", "This campaign is closed");
  if (patch.budget !== undefined) {
    assert(patch.budget === null || (Number(patch.budget) >= 10000 && Number(patch.budget) <= 1_000_000_000), "Budget must be between ₹10,000 and ₹100 crore");
    c.budget = patch.budget === null ? null : rupees(Number(patch.budget));
  }
  if (patch.commissionRate !== undefined) {
    const r = Number(patch.commissionRate);
    assert(
      r >= CAMPAIGN_COMMISSION.min - 1e-9 && r <= CAMPAIGN_COMMISSION.max + 1e-9,
      `Commission must be between ${CAMPAIGN_COMMISSION.min * 100}% and ${CAMPAIGN_COMMISSION.max * 100}%`,
    );
    c.commissionRate = Math.round(r * 1000) / 1000;
  }
  if (patch.notes !== undefined) c.notes = cleanText(patch.notes, 5000, "notes", true);
  if (patch.advancePaid !== undefined) c.advancePaid = !!patch.advancePaid;
  if (patch.balancePaid !== undefined) c.balancePaid = !!patch.balancePaid;
  if (patch.stage !== undefined) {
    assert(CAMPAIGN_STAGES.some((s) => s.key === patch.stage) && patch.stage !== "closed", "Use “Settle & close” to close a campaign");
    if (["booking_creators", "content_review", "live", "report_settle"].includes(patch.stage)) {
      assert(c.budget, "Set the agreed budget first");
      assert(c.advancePaid, "Mark the 50% advance as received first");
    }
    c.stage = patch.stage;
  }
  const m = campaignMath(c);
  assert(m.remaining >= 0, "Creator fees would exceed the creator pool for this budget and commission");
  return c;
}

export function inviteCreator(db: DB, id: string, creatorId: string, deliverables: string, fee: number, now: number) {
  const c = get(db, id);
  assert(c.budget, "Set the agreed budget first");
  const creator = db.creators.find((x) => x.id === creatorId);
  assert(creator && creator.verification === "verified", "Pick a verified creator");
  assert(!c.creators.some((x) => x.creatorId === creatorId && x.status !== "declined"), `${creator.name} is already on this campaign`);
  const what = cleanText(deliverables, 500, "the deliverables, e.g. 1 reel + 3 stories");
  const f = rupees(Number(fee));
  assert(f >= 500, "Fee must be at least ₹500");
  const m = campaignMath(c);
  assert(f <= m.remaining, `Only ₹${m.remaining.toLocaleString("en-IN")} left in the creator pool`);
  c.creators.push({ creatorId, deliverables: what, fee: f, status: "invited", invitedAt: now });
  return c;
}

export function respondToInvite(db: DB, id: string, creatorId: string, accept: boolean) {
  const c = get(db, id);
  const slot = c.creators.find((x) => x.creatorId === creatorId && x.status === "invited");
  assert(slot, "No open invite for you on this campaign", 404);
  slot.status = accept ? "accepted" : "declined";
  return c;
}

/** Pays every accepted creator and books Srijan's commission. */
export function settleCampaign(db: DB, id: string, now: number) {
  const c = get(db, id);
  assert(c.stage === "report_settle", "Move the campaign to “Report & settle” first");
  assert(c.budget, "Set the agreed budget first");
  assert(c.advancePaid && c.balancePaid, "Mark both brand payments as received first");
  const toPay = c.creators.filter((x) => x.status === "accepted");
  let paid = 0;
  for (const slot of toPay) {
    slot.status = "paid";
    paid += slot.fee;
    db.ledger.push({ id: newId("led"), at: now, type: "creator_earning", amount: slot.fee, creatorId: slot.creatorId, campaignId: c.id, note: `Campaign · ${c.brandName}` });
  }
  for (const slot of c.creators) if (slot.status === "invited") slot.status = "declined";
  db.ledger.push({ id: newId("led"), at: now, type: "campaign_payment", amount: c.budget, campaignId: c.id, note: c.brandName });
  db.ledger.push({ id: newId("led"), at: now, type: "campaign_commission", amount: c.budget - paid, campaignId: c.id, note: `${c.brandName} · ${Math.round(((c.budget - paid) / c.budget) * 100)}% kept` });
  c.stage = "closed";
  c.settledAt = now;
  return { paidCreators: toPay.length, paid, srijanKeeps: c.budget - paid };
}
