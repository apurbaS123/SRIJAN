import { DISPATCH, SERVICES, SOCIAL_PLATFORMS, findZone } from "./config";
import type { VerificationMode } from "./kyc";
import { aadhaarUploadIds } from "./kyc";
import type { BankDetails, Creator, CreatorService, DB, ServiceKey, UploadRef, User } from "./types";
import { notifyCreatorVerification } from "./notifications";
import { assert, cleanText, newId } from "./util";

const DEFAULT_SERVICE: Record<ServiceKey, { title: string; description: string }> = {
  videography: { title: "1-day service", description: "On-location shoot and edit at Srijan’s fixed package price." },
  video_editing: { title: "Edit my footage", description: "Send your clips, get an edited video with captions and music." },
  influencer: { title: "Brand collaboration", description: "Sponsored posts to my audience, handled by the Srijan campaign team." },
  photography: { title: "Photo shoot", description: "On-location photography with edited photos." },
  graphic_design: { title: "Design work", description: "Social media creatives, posters and menus." },
  content_writing: { title: "Writing", description: "Captions, scripts and blog posts." },
  voice_over: { title: "Voice-over", description: "Voice recording for ads and reels." },
  social_media: { title: "Social media management", description: "Monthly page management." },
};

export interface SignupInput {
  name: string;
  email?: string;
  phone: string;
  cityId: string;
  zoneId: string;
  bio?: string;
  services: { key: ServiceKey }[];
  gear?: string[];
  languages?: string[];
  instagram?: string;
  portfolio?: string;
  social?: { platform?: string; url?: string };
  followers?: number;
  maxTravelKm?: number;
}

/** The optional portfolio link, as https. Any site is fine. */
function cleanPortfolio(value: unknown) {
  const raw = cleanText(value, 300, "your portfolio link", true);
  if (!raw) return undefined;
  let u: URL | undefined;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {}
  assert(u && (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes("."), "Paste a full link to your portfolio");
  u.protocol = "https:";
  u.username = u.password = "";
  return u.toString();
}

/** A profile link on the chosen site (https only), or undefined when left empty. */
function cleanSocial(input: SignupInput["social"]): Creator["social"] {
  const raw = cleanText(input?.url, 300, "your social media link", true);
  if (!raw) return undefined;
  const p = SOCIAL_PLATFORMS.find((x) => x.key === input?.platform);
  assert(p, "Pick which site your social media link is for");
  let u: URL | undefined;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {}
  assert(u && (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes("."), `Paste your ${p.label} profile link, e.g. ${p.example}`);
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, "");
  if (p.hosts.length) {
    assert(p.hosts.some((h) => host === h || host.endsWith(`.${h}`)), `That link isn’t on ${p.label}. Paste your profile link, e.g. ${p.example}`);
    assert(u.pathname.length > 1, `Paste the link to your own ${p.label} profile, e.g. ${p.example}`);
  }
  u.protocol = "https:";
  u.username = u.password = "";
  return { platform: p.key, url: u.toString() };
}

const UPI_RE = /^[\w.\-]{2,64}@[a-zA-Z0-9]{2,32}$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_RE = /^\d{9,18}$/;

/** Has the creator told us where to send their money? */
export function hasPayoutDetails(c: Creator) {
  return c.payoutMethod === "bank" ? !!c.bank : !!c.upiId;
}

/** Safe to show back to the creator: the account number is cut to its last 4 digits. */
export function payoutSummary(c: Creator) {
  if (c.payoutMethod === "bank" && c.bank) {
    return { method: "bank" as const, accountName: c.bank.accountName, accountLast4: c.bank.accountNumber.slice(-4), ifsc: c.bank.ifsc };
  }
  return c.upiId ? { method: "upi" as const, upiId: c.upiId } : null;
}

export type PayoutInput = { method?: "upi" | "bank"; upiId?: string } & Partial<BankDetails>;

function setPayoutDetails(c: Creator, input: PayoutInput) {
  if (input?.method === "upi") {
    const upi = cleanText(input.upiId, 100, "your UPI ID");
    assert(UPI_RE.test(upi), "UPI ID looks wrong, e.g. name@okaxis");
    c.payoutMethod = "upi";
    c.upiId = upi;
    c.bank = undefined;
    return;
  }
  assert(input?.method === "bank", "Choose bank account or UPI");
  const accountName = cleanText(input.accountName, 100, "the account holder’s name");
  assert(accountName.length >= 2, "Enter the account holder’s name");
  const accountNumber = String(input.accountNumber ?? "").replace(/\s/g, "");
  assert(ACCOUNT_RE.test(accountNumber), "Account number should be 9 to 18 digits");
  const ifsc = String(input.ifsc ?? "").trim().toUpperCase();
  assert(IFSC_RE.test(ifsc), "IFSC looks wrong, e.g. SBIN0001234");
  c.payoutMethod = "bank";
  c.bank = { accountName, accountNumber, ifsc };
  c.upiId = undefined;
}

function cleanList(v: unknown, maxItems: number, maxLen: number, label: string) {
  const list = Array.isArray(v) ? v : [];
  assert(list.length <= maxItems, `Pick at most ${maxItems} ${label}`);
  return list.map((x) => cleanText(x, maxLen, label)).filter(Boolean);
}

/**
 * `email` must already be verified by the caller (sign-in code) and lower-cased; `phone` is a
 * 10-digit contact number for shoot day.
 *
 * `mode` is how creators get verified right now (see `kyc.ts`), and it changes nothing about who
 * starts out verified: in both modes a new creator is "pending" and cannot go online or accept a
 * job until their Aadhaar has been checked — by the Srijan team on "manual", by DigiLocker itself
 * on "digilocker". It is taken only so that a change to either mode has one obvious place to go.
 */
export function signUpCreator(db: DB, input: SignupInput, contact: { email: string; phone: string }, now: number, mode: VerificationMode = "manual") {
  const { email, phone } = contact;
  const name = cleanText(input.name, 80, "your name");
  assert(name.length >= 2, "Enter your name");
  assert(!db.users.some((u) => u.email?.toLowerCase() === email), "This email is already registered — sign in instead");
  const place = findZone(input.cityId, input.zoneId);
  assert(place, "Pick your city and area");
  const given = Array.isArray(input.services) ? input.services : [];
  const keys = Array.from(new Set(given.map((s) => s?.key))).filter((k): k is ServiceKey => SERVICES.some((s) => s.key === k));
  assert(keys.length > 0, "Pick at least one service you offer");
  const services: CreatorService[] = keys.map((key) => ({ key, ...DEFAULT_SERVICE[key], price: null }));
  const portfolio = cleanPortfolio(input.portfolio);
  const social = cleanSocial(input.social);
  let instagram = cleanText(input.instagram, 60, "your Instagram handle", true);
  if (instagram) assert(/^@?[\w.]{1,30}$/.test(instagram), "Enter just your Instagram handle, e.g. @yourname");
  if (!instagram && social?.platform === "instagram") {
    const handle = new URL(social.url).pathname.split("/")[1] ?? "";
    if (/^[\w.]{1,30}$/.test(handle)) instagram = `@${handle}`;
  }
  const followers = Math.round(Number(input.followers) || 0);
  assert(followers >= 0 && followers <= 1_000_000_000, "Follower count looks wrong");
  const bio = cleanText(input.bio, 1000, "your bio", true);
  const gear = cleanList(input.gear, 50, 60, "gear items");
  const languages = cleanList(input.languages, 10, 30, "languages");

  const creatorId = newId("cr");
  const user: User = { id: newId("u"), role: "creator", name, email, phone: `+91 ${phone}`, creatorId, createdAt: now };
  const creator: Creator = {
    id: creatorId,
    userId: user.id,
    name: user.name,
    bio,
    cityId: place.city.id,
    zoneId: place.zone.id,
    lat: place.zone.lat,
    lng: place.zone.lng,
    languages: languages.length ? languages : ["Assamese", "Hindi", "English"],
    services,
    gear,
    instagram: instagram || undefined,
    portfolio,
    social,
    followers: followers || undefined,
    onDemand: true,
    available: false,
    // Not asked at sign-up: as far as the widest search reaches, so new creators aren't left out of it.
    maxTravelKm: [5, 10, 15, 20, 25].includes(Number(input.maxTravelKm)) ? Number(input.maxTravelKm) : DISPATCH.widenedRadiusKm,
    // Nobody is verified by signing up. The Aadhaar comes next, either uploaded for the Srijan team
    // or shared through DigiLocker, and verification waits on that.
    verification: "pending",
    // Ticked off by DigiLocker's own reply, or by the Srijan team once they've seen the documents —
    // never by anything the creator sends us, and never by signing up.
    kyc: { aadhaar: false, pan: false },
    ratingSum: 0,
    ratingCount: 0,
    jobsDone: 0,
    createdAt: now,
  };
  db.users.push(user);
  db.creators.push(creator);
  return { user, creator };
}

export interface CreatorPatch {
  available?: boolean;
  maxTravelKm?: number;
  payout?: PayoutInput;
  /** Portfolio link; an empty string removes it. */
  portfolio?: string;
  /** Main social media account; an empty url removes it. */
  social?: { platform?: string; url?: string };
  /** Follower count; null or 0 removes it. */
  followers?: number | null;
  /** Live location from the phone (optional). */
  lat?: number;
  lng?: number;
}

export function updateOwnCreator(db: DB, creatorId: string, patch: CreatorPatch) {
  const c = db.creators.find((x) => x.id === creatorId);
  assert(c, "Creator not found", 404);
  if (patch.available !== undefined) {
    // Verification is the only gate. A payment receive method can be added whenever the creator
    // likes: it holds up the money, not the work. See `wallet.ts`.
    if (patch.available) assert(c.verification === "verified", "You can go online once your profile is verified");
    c.available = !!patch.available;
  }
  if (patch.maxTravelKm !== undefined) {
    assert([5, 10, 15, 20, 25].includes(Number(patch.maxTravelKm)), "Travel distance must be 5, 10, 15, 20 or 25 km");
    c.maxTravelKm = Number(patch.maxTravelKm);
  }
  if (patch.payout !== undefined) setPayoutDetails(c, patch.payout);
  if (patch.portfolio !== undefined) c.portfolio = cleanPortfolio(patch.portfolio);
  if (patch.followers !== undefined) {
    const n = patch.followers === null ? 0 : Number(patch.followers);
    assert(Number.isInteger(n) && n >= 0 && n <= 1_000_000_000, "Follower count looks wrong");
    c.followers = n || undefined;
  }
  if (patch.social !== undefined) {
    c.social = cleanSocial(patch.social);
    // Keep the Instagram handle in step with a new Instagram link.
    if (c.social?.platform === "instagram") {
      const handle = new URL(c.social.url).pathname.split("/")[1] ?? "";
      if (/^[\w.]{1,30}$/.test(handle)) c.instagram = `@${handle}`;
    }
  }
  if (patch.lat !== undefined || patch.lng !== undefined) {
    const lat = Number(patch.lat);
    const lng = Number(patch.lng);
    assert(Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180, "Location looks wrong");
    c.lat = lat;
    c.lng = lng;
  }
  return c;
}

/**
 * The Srijan team's decision on a creator waiting to be verified, made from the ops dashboard after
 * someone has opened the uploaded Aadhaar and read it.
 *
 * Approving is what lets the creator go online and accept jobs, so it takes `kycChecked` — the
 * dashboard sets it only once the person pressing the button has said they looked at the documents.
 * Rejecting takes a note, which the creator reads; they can then upload clearer photos, which puts
 * them back in the queue (see `submitAadhaar`).
 */
export function setVerification(db: DB, creatorId: string, decision: "verified" | "rejected", kycChecked = false, note?: string, by?: string, now = Date.now()) {
  const c = db.creators.find((x) => x.id === creatorId);
  assert(c, "Creator not found", 404);
  assert(c.verification === "pending", "Already reviewed");
  assert(decision === "verified" || decision === "rejected", "Unknown decision");
  const doc = c.kyc.aadhaarDoc;
  if (decision === "verified") {
    assert(kycChecked, "Confirm you have read their Aadhaar before approving");
    // Only what somebody actually looked at is ticked off. PAN isn't collected here, so an approval
    // can't claim it; DigiLocker is the only thing that sets it today.
    c.kyc.aadhaar = true;
  }
  if (doc) {
    doc.checkedAt = now;
    doc.checkedBy = by;
    doc.rejectedNote = decision === "rejected" ? cleanText(note, 300, "a reason", true) || undefined : undefined;
  }
  c.verification = decision;
  // A rejected creator is off the job board at once, whatever they had switched on.
  if (decision === "rejected") c.available = false;
  notifyCreatorVerification(db, c, decision, now, doc?.rejectedNote);
  return c;
}

/**
 * Everything the Srijan team may change on somebody else's profile.
 *
 * This is deliberately smaller than what the creator can change about themselves. Nothing here
 * touches money (bank account, UPI), identity (the Aadhaar and its hash) or verification: a
 * payout must go where the creator said, and a profile must not become verified because somebody
 * edited a text box. Those have their own routes, with their own checks.
 */
export interface OpsCreatorPatch {
  name?: string;
  bio?: string;
  cityId?: string;
  zoneId?: string;
  languages?: string[];
  gear?: string[];
  maxTravelKm?: number;
  /** Portfolio link; an empty string removes it. */
  portfolio?: string;
  /** Main social account; an empty url removes it. */
  social?: { platform?: string; url?: string };
  followers?: number | null;
  /** Ops can take a creator offline, but never put one online on their behalf. */
  available?: false;
  /** Throw away the profile photo, e.g. one that shouldn't be on the public directory. */
  removePhoto?: boolean;
}

/**
 * The Srijan team editing a creator's profile — to fix a name typed in the wrong case, cut a
 * placeholder bio, or move somebody to the right area.
 *
 * Returns the ids of any documents the edit orphaned, for the caller to delete from the document
 * store once the database is unlocked.
 */
export function updateCreatorByOps(db: DB, creatorId: string, patch: OpsCreatorPatch) {
  const c = db.creators.find((x) => x.id === creatorId);
  assert(c, "Creator not found", 404);
  const orphaned: string[] = [];

  if (patch.name !== undefined) {
    const name = cleanText(patch.name, 80, "their name");
    assert(name.length >= 2, "Enter their name");
    c.name = name;
    // The account and the profile carry the same name, and the ops team reads both.
    const u = db.users.find((x) => x.id === c.userId);
    if (u) u.name = name;
  }
  if (patch.bio !== undefined) c.bio = cleanText(patch.bio, 1000, "their bio", true);
  if (patch.cityId !== undefined || patch.zoneId !== undefined) {
    const place = findZone(patch.cityId ?? c.cityId, patch.zoneId ?? c.zoneId);
    assert(place, "Pick a city and area");
    // Moving someone moves where jobs are matched from, so the live position follows the new zone.
    c.cityId = place.city.id;
    c.zoneId = place.zone.id;
    c.lat = place.zone.lat;
    c.lng = place.zone.lng;
  }
  if (patch.languages !== undefined) {
    const list = cleanList(patch.languages, 10, 30, "languages");
    assert(list.length > 0, "Leave at least one language");
    c.languages = list;
  }
  if (patch.gear !== undefined) c.gear = cleanList(patch.gear, 50, 60, "gear items");
  if (patch.maxTravelKm !== undefined) {
    assert([5, 10, 15, 20, 25].includes(Number(patch.maxTravelKm)), "Travel distance must be 5, 10, 15, 20 or 25 km");
    c.maxTravelKm = Number(patch.maxTravelKm);
  }
  if (patch.portfolio !== undefined) c.portfolio = cleanPortfolio(patch.portfolio);
  if (patch.social !== undefined) {
    c.social = cleanSocial(patch.social);
    if (c.social?.platform === "instagram") {
      const handle = new URL(c.social.url).pathname.split("/")[1] ?? "";
      if (/^[\w.]{1,30}$/.test(handle)) c.instagram = `@${handle}`;
    }
  }
  if (patch.followers !== undefined) {
    const n = patch.followers === null ? 0 : Number(patch.followers);
    assert(Number.isInteger(n) && n >= 0 && n <= 1_000_000_000, "Follower count looks wrong");
    c.followers = n || undefined;
  }
  if (patch.available === false) c.available = false;
  if (patch.removePhoto && c.photo) {
    orphaned.push(c.photo.id);
    c.photo = undefined;
  }
  return { creator: c, orphaned };
}

/** Jobs that are still going: a creator in the middle of one cannot be deleted. */
const LIVE_BOOKING = ["searching", "needs_ops", "awaiting_payment", "assigned", "delivered", "disputed"];

/**
 * Why this creator can't be deleted yet, or null when they can.
 *
 * Deleting is for the profiles that should never have been here — duplicates and test accounts —
 * so it refuses the moment there is real work or real money attached. A creator in the middle of a
 * job would leave a client waiting on somebody who no longer exists, and an unpaid earning would
 * erase the record of what Srijan owes before it is sent.
 */
export function deleteBlocker(db: DB, creatorId: string) {
  const live = db.bookings.filter((b) => (b.creatorId === creatorId || b.requestedCreatorId === creatorId) && LIVE_BOOKING.includes(b.status)).length;
  if (live) return `They are on ${live} job${live === 1 ? "" : "s"} that ${live === 1 ? "is" : "are"} still going. Finish, cancel or reassign ${live === 1 ? "it" : "them"} first.`;
  const owed = db.ledger.filter((l) => l.type === "creator_earning" && l.creatorId === creatorId && l.status === "processing");
  if (owed.length) {
    const total = owed.reduce((n, l) => n + l.amount, 0);
    return `Srijan still owes them ₹${total.toLocaleString("en-IN")}. Mark the payout sent first — deleting them would erase the record of it.`;
  }
  const campaign = db.campaigns.find((c) => c.creators.some((x) => x.creatorId === creatorId && (x.status === "invited" || x.status === "accepted")));
  if (campaign) return `They are booked on the ${campaign.brandName} campaign. Take them off it first.`;
  return null;
}

/**
 * Removes a creator and the account that signs in to them, for good.
 *
 * Finished jobs, reviews and ledger entries are deliberately left alone: they are Srijan's record
 * of what happened and of money that moved, and every screen that reads them already copes with a
 * creator who is no longer there. What goes is the profile, the login, anything still addressed to
 * them, and the files they uploaded.
 *
 * Returns the document ids to delete from the document store once the database is unlocked.
 */
export function deleteCreator(db: DB, creatorId: string) {
  const c = db.creators.find((x) => x.id === creatorId);
  assert(c, "Creator not found", 404);
  const blocker = deleteBlocker(db, creatorId);
  assert(!blocker, blocker ?? "", 409);

  const documents = [...aadhaarUploadIds(c), ...(c.photo ? [c.photo.id] : [])];
  const removed = { id: c.id, name: c.name, userId: c.userId };

  db.creators = db.creators.filter((x) => x.id !== creatorId);
  db.users = db.users.filter((u) => u.id !== c.userId);
  // Offers are an open question put to this creator; there is nobody left to answer.
  db.offers = db.offers.filter((o) => o.creatorId !== creatorId);
  if (db.notifications) db.notifications = db.notifications.filter((n) => n.userId !== c.userId);

  return { removed, documents };
}

/**
 * The creator's own profile photo. Replacing one leaves the old file pointed at by nothing, so the
 * id comes back for the caller to delete from the document store.
 */
export function setCreatorPhoto(db: DB, creatorId: string, photo: UploadRef) {
  const c = db.creators.find((x) => x.id === creatorId);
  assert(c, "Creator not found", 404);
  const orphaned = c.photo ? [c.photo.id] : [];
  c.photo = photo;
  return { creator: c, orphaned };
}

export function clearCreatorPhoto(db: DB, creatorId: string) {
  const c = db.creators.find((x) => x.id === creatorId);
  assert(c, "Creator not found", 404);
  const orphaned = c.photo ? [c.photo.id] : [];
  c.photo = undefined;
  return { creator: c, orphaned };
}
