import { SERVICES, SOCIAL_PLATFORMS, findZone } from "./config";
import type { Creator, CreatorService, DB, ServiceKey, User } from "./types";
import { assert, cleanText, newId } from "./util";

const DEFAULT_SERVICE: Record<ServiceKey, { title: string; description: string }> = {
  videography: { title: "1-day shoot", description: "On-location shoot and edit, delivered within 24 hours at Srijan’s fixed package price." },
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
  services: { key: ServiceKey; price?: number | null }[];
  gear?: string[];
  languages?: string[];
  instagram?: string;
  social?: { platform?: string; url?: string };
  followers?: number;
  onDemand?: boolean;
  maxTravelKm?: number;
  upiId?: string;
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

const UPI_RE = /^[\w.\-]{2,64}@[a-zA-Z]{2,32}$/;

function cleanList(v: unknown, maxItems: number, maxLen: number, label: string) {
  const list = Array.isArray(v) ? v : [];
  assert(list.length <= maxItems, `Pick at most ${maxItems} ${label}`);
  return list.map((x) => cleanText(x, maxLen, label)).filter(Boolean);
}

/**
 * `email` must already be verified by the caller (sign-in code) and lower-cased; `phone` is a
 * 10-digit contact number for shoot day.
 */
export function signUpCreator(db: DB, input: SignupInput, contact: { email: string; phone: string }, now: number) {
  const { email, phone } = contact;
  const name = cleanText(input.name, 80, "your name");
  assert(name.length >= 2, "Enter your name");
  assert(!db.users.some((u) => u.email?.toLowerCase() === email), "This email is already registered — sign in instead");
  const place = findZone(input.cityId, input.zoneId);
  assert(place, "Pick your city and area");
  const given = Array.isArray(input.services) ? input.services : [];
  const keys = Array.from(new Set(given.map((s) => s?.key))).filter((k): k is ServiceKey => SERVICES.some((s) => s.key === k));
  assert(keys.length > 0, "Pick at least one service you offer");
  const services: CreatorService[] = keys.map((key) => {
    const raw = Number(given.find((s) => s?.key === key)?.price);
    const price = key === "videography" || key === "influencer" || !(raw > 0) ? null : Math.round(raw);
    if (price !== null) assert(price <= 1_000_000, "Service prices must be under ₹10,00,000");
    return { key, ...DEFAULT_SERVICE[key], price: key === "videography" ? 2500 : price };
  });
  const upiId = cleanText(input.upiId, 100, "your UPI ID", true);
  if (upiId) assert(UPI_RE.test(upiId), "UPI ID looks wrong, e.g. name@okaxis");
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
  const gear = cleanList(input.gear, 20, 60, "gear items");
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
    social,
    followers: followers || undefined,
    onDemand: !!input.onDemand && keys.includes("videography"),
    available: false,
    maxTravelKm: [5, 10, 15, 20, 25].includes(Number(input.maxTravelKm)) ? Number(input.maxTravelKm) : 10,
    verification: "pending",
    // Set by the Srijan team after they check the documents — never self-declared.
    kyc: { aadhaar: false, pan: false },
    upiId: upiId || undefined,
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
  onDemand?: boolean;
  maxTravelKm?: number;
  upiId?: string;
  /** Live location from the phone (optional). */
  lat?: number;
  lng?: number;
}

export function updateOwnCreator(db: DB, creatorId: string, patch: CreatorPatch) {
  const c = db.creators.find((x) => x.id === creatorId);
  assert(c, "Creator not found", 404);
  if (patch.available !== undefined) {
    if (patch.available) assert(c.verification === "verified", "You can go online once your profile is verified");
    c.available = !!patch.available;
  }
  if (patch.onDemand !== undefined) {
    if (patch.onDemand) assert(c.services.some((s) => s.key === "videography"), "Add the videography service to take same-day shoots");
    c.onDemand = !!patch.onDemand;
  }
  if (patch.maxTravelKm !== undefined) {
    assert([5, 10, 15, 20, 25].includes(Number(patch.maxTravelKm)), "Travel distance must be 5, 10, 15, 20 or 25 km");
    c.maxTravelKm = Number(patch.maxTravelKm);
  }
  if (patch.upiId !== undefined) {
    const upi = cleanText(patch.upiId, 100, "your UPI ID");
    assert(UPI_RE.test(upi), "UPI ID looks wrong, e.g. name@okaxis");
    c.upiId = upi;
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

/** Ops approves (after checking Aadhaar and PAN themselves) or rejects a new creator. */
export function setVerification(db: DB, creatorId: string, decision: "verified" | "rejected", kycChecked = false) {
  const c = db.creators.find((x) => x.id === creatorId);
  assert(c, "Creator not found", 404);
  assert(c.verification === "pending", "Already reviewed");
  assert(decision === "verified" || decision === "rejected", "Unknown decision");
  if (decision === "verified") {
    assert(kycChecked, "Confirm you have checked their Aadhaar and PAN before approving");
    c.kyc = { aadhaar: true, pan: true };
  }
  c.verification = decision;
  return c;
}
