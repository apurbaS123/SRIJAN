// What each kind of user is allowed to see. API responses are built from these.
import { AUTO_APPROVE_MS, CAMPAIGN_STAGES, CREATOR_SHARE, findPackage, findZone, lowestPrice } from "./config";
import { campaignMath } from "./campaigns";
import { clientRating, tickBooking } from "./bookings";
import { pruneNotifications } from "./notifications";
import type { Booking, Campaign, Creator, DB, Offer, Role } from "./types";
import { istDay, istMonth, rupees } from "./util";

export interface Viewer {
  userId?: string;
  role?: Role;
  creatorId?: string;
}

/** Run every time-based rule up to `now`. */
export function tickAll(db: DB, now: number) {
  for (const b of db.bookings) tickBooking(db, b, now);
  // Profiles saved before the rename keep their own copy of this title.
  for (const c of db.creators) for (const s of c.services) if (s.title === "1-day shoot") s.title = "1-day service";
  pruneNotifications(db, now);
}

export function creatorPublic(c: Creator) {
  return {
    id: c.id,
    name: c.name,
    bio: c.bio,
    cityId: c.cityId,
    zoneId: c.zoneId,
    area: placeName(c.cityId, c.zoneId),
    languages: c.languages,
    services: c.services.map((s) => ({ ...s, price: lowestPrice(s.key) })),
    gear: c.gear,
    instagram: c.instagram,
    social: c.social,
    followers: c.followers,
    engagementRate: c.engagementRate,
    available: c.available,
    maxTravelKm: c.maxTravelKm,
    verified: c.verification === "verified",
    verification: c.verification,
    rating: c.ratingCount ? Math.round((c.ratingSum / c.ratingCount) * 10) / 10 : null,
    ratingCount: c.ratingCount,
    jobsDone: c.jobsDone,
  };
}
export type CreatorPublic = ReturnType<typeof creatorPublic>;

export function placeName(cityId: string, zoneId: string) {
  const p = findZone(cityId, zoneId);
  return p ? `${p.zone.name}, ${p.city.name}` : "";
}

export const STATUS_LABEL: Record<Booking["status"], string> = {
  awaiting_payment: "Waiting for payment",
  searching: "Finding your creator",
  needs_ops: "Our team is assigning a creator",
  assigned: "Creator working on it",
  delivered: "Waiting for approval",
  disputed: "Problem reported",
  completed: "Completed",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

export function bookingView(db: DB, b: Booking, viewer: Viewer) {
  const pkg = findPackage(b.packageId)!;
  const creator = b.creatorId ? db.creators.find((c) => c.id === b.creatorId) : undefined;
  const client = db.users.find((u) => u.id === b.clientId);
  const isOps = viewer.role === "ops";
  const isClient = viewer.userId === b.clientId;
  const isJobCreator = !!viewer.creatorId && viewer.creatorId === b.creatorId;
  const creatorUser = creator ? db.users.find((u) => u.id === creator.userId) : undefined;
  const earning = db.ledger.find((l) => l.type === "creator_earning" && l.bookingId === b.id);
  const pendingOffers = db.offers.filter((o) => o.bookingId === b.id && o.status === "pending").length;
  return {
    id: b.id,
    code: b.code,
    status: b.status,
    statusLabel: STATUS_LABEL[b.status],
    packageId: b.packageId,
    packageName: pkg.name,
    packageSummary: pkg.summary,
    packageHours: pkg.hours,
    price: b.price,
    total: b.total,
    creatorPayout: rupees(b.price * CREATOR_SHARE),
    online: !!b.online,
    address: b.address,
    area: b.online ? "Online" : placeName(b.cityId, b.zoneId),
    cityId: b.cityId,
    lat: b.lat,
    lng: b.lng,
    scheduledAt: b.scheduledAt,
    brief: b.brief,
    aspect: b.aspect,
    referenceUrl: b.referenceUrl,
    clientName: client?.name ?? "Client",
    /** Shared with the creator once they've accepted the job. */
    clientPhone: isOps || isClient || isJobCreator ? client?.phone : undefined,
    creatorPhone: isOps || isClient ? creatorUser?.phone : undefined,
    /** Where the creator uploads proof of work. */
    proofUploadUrl: isJobCreator && b.status === "assigned" ? process.env.SRIJAN_PROOF_DRIVE_URL || null : undefined,
    /** Has Srijan sent the creator their share yet? */
    payoutStatus: (isOps || isJobCreator) && earning ? (earning.status === "processing" ? ("owed" as const) : ("paid" as const)) : undefined,
    refund: isOps || isClient ? (b.refund ? { amount: b.refund.amount, status: b.refund.status } : null) : undefined,
    report: b.report ?? null,
    requestedCreatorId: b.requestedCreatorId,
    creator: creator ? creatorPublic(creator) : null,
    dispatch: {
      phase: b.dispatch.phase,
      roundEndsAt: b.dispatch.roundEndsAt,
      widened: b.dispatch.widened,
      radiusKm: b.dispatch.radiusKm,
      notified: b.dispatch.notifiedCreatorIds.length,
      pendingOffers,
    },
    assignedAt: b.assignedAt,
    deliveredAt: b.deliveredAt,
    autoApproveAt: b.status === "delivered" && b.deliveredAt ? b.deliveredAt + AUTO_APPROVE_MS : null,
    approvedAt: b.approvedAt,
    autoApproved: b.autoApproved,
    rating: b.rating,
    review: b.review,
    reviewedAt: b.reviewedAt,
    reviewOfClient: b.reviewOfClient ?? null,
    /** The client's average from creators' reviews, shown to the creator and ops. */
    clientRating: isOps || isJobCreator ? clientRating(db, b.clientId) : undefined,
    createdAt: b.createdAt,
    events: [...b.events].sort((x, y) => x.at - y.at),
  };
}
export type BookingView = ReturnType<typeof bookingView>;

/** What a creator sees in a job alert — no exact address or client code until they accept. */
export function offerView(db: DB, o: Offer) {
  const b = db.bookings.find((x) => x.id === o.bookingId)!;
  const pkg = findPackage(b.packageId)!;
  return {
    id: o.id,
    kind: o.kind,
    status: o.status,
    sentAt: o.sentAt,
    expiresAt: o.expiresAt,
    distanceKm: o.distanceKm,
    bookingId: b.id,
    code: b.code,
    packageName: pkg.name,
    packageSummary: pkg.summary,
    price: b.price,
    payout: rupees(b.price * CREATOR_SHARE),
    online: !!b.online,
    area: b.online ? "Online" : placeName(b.cityId, b.zoneId),
    scheduledAt: b.scheduledAt,
    brief: b.brief,
    aspect: b.aspect,
    alerted: b.dispatch.notifiedCreatorIds.length,
  };
}
export type OfferView = ReturnType<typeof offerView>;

export function campaignView(db: DB, c: Campaign, viewer: Viewer) {
  const m = campaignMath(c);
  const isOps = viewer.role === "ops";
  // The brand that booked it: their agreed budget and who worked on it, but not fees or commission.
  const isOwner = !!viewer.userId && viewer.userId === c.userId;
  return {
    id: c.id,
    code: c.code,
    brandName: c.brandName,
    contactName: isOps ? c.contactName : undefined,
    email: isOps ? c.email : undefined,
    phone: isOps ? c.phone : undefined,
    goal: c.goal,
    regions: c.regions,
    budgetRange: c.budgetRange,
    callAt: c.callAt,
    callMode: c.callMode,
    stage: c.stage,
    stageLabel: CAMPAIGN_STAGES.find((s) => s.key === c.stage)?.label ?? c.stage,
    budget: isOps || isOwner ? c.budget : undefined,
    commissionRate: isOps ? c.commissionRate : undefined,
    math: isOps ? m : undefined,
    advancePaid: c.advancePaid,
    balancePaid: c.balancePaid,
    notes: isOps ? c.notes : undefined,
    creators: c.creators
      .filter((x) => isOps || x.creatorId === viewer.creatorId || (isOwner && (x.status === "accepted" || x.status === "paid")))
      .map((x) => ({
        ...x,
        fee: isOwner && !isOps ? undefined : x.fee,
        name: db.creators.find((cr) => cr.id === x.creatorId)?.name ?? "Creator",
      })),
    createdAt: c.createdAt,
    settledAt: c.settledAt,
  };
}
export type CampaignView = ReturnType<typeof campaignView>;

export function opsOverview(db: DB, now: number) {
  const today = istDay(now);
  const month = istMonth(now);
  const inMonth = (at: number) => istMonth(at) === month;
  const sum = (type: string) => db.ledger.filter((l) => l.type === type && inMonth(l.at)).reduce((s, l) => s + l.amount, 0);
  const shootGmv = db.ledger
    .filter((l) => l.type === "platform_fee" && inMonth(l.at))
    .reduce((s, l) => {
      const b = db.bookings.find((x) => x.id === l.bookingId);
      return s + (b?.price ?? 0);
    }, 0);
  const platformFee = sum("platform_fee");
  const campaignBilled = sum("campaign_payment");
  const campaignCommission = sum("campaign_commission");
  const openCampaigns = db.campaigns.filter((c) => c.stage !== "closed");
  return {
    kpis: {
      shootsToday: db.bookings.filter((b) => istDay(b.scheduledAt) === today && !["awaiting_payment", "refunded", "cancelled"].includes(b.status)).length,
      liveNow: db.bookings.filter((b) => b.status === "assigned").length,
      searching: db.bookings.filter((b) => b.status === "searching").length,
      needsOps: db.bookings.filter((b) => b.status === "needs_ops").length,
      pipelineValue: openCampaigns.reduce((s, c) => s + (c.budget ?? 0), 0),
      revenueMonth: platformFee + campaignCommission,
      pendingVerification: db.creators.filter((c) => c.verification === "pending").length,
    },
    money: {
      month,
      shootGmv,
      platformFee,
      campaignBilled,
      campaignCommission,
      refunds: sum("client_refund"),
    },
  };
}
