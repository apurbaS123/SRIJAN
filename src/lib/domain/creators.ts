import { SERVICES, findZone } from "./config";
import type { Creator, CreatorService, DB, ServiceKey, User } from "./types";
import { assert, newId } from "./util";

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
  phone: string;
  cityId: string;
  zoneId: string;
  bio?: string;
  services: { key: ServiceKey; price?: number | null }[];
  gear?: string[];
  languages?: string[];
  instagram?: string;
  followers?: number;
  onDemand?: boolean;
  maxTravelKm?: number;
  upiId?: string;
  aadhaarDone?: boolean;
  panDone?: boolean;
}

export function signUpCreator(db: DB, input: SignupInput, now: number) {
  assert(input.name?.trim().length >= 2, "Enter your name");
  const phoneDigits = (input.phone ?? "").replace(/\D/g, "");
  assert(phoneDigits.length >= 10, "Enter a 10-digit mobile number");
  assert(!db.users.some((u) => (u.phone ?? "").replace(/\D/g, "").endsWith(phoneDigits.slice(-10))), "This number is already registered");
  const place = findZone(input.cityId, input.zoneId);
  assert(place, "Pick your city and area");
  const keys = Array.from(new Set((input.services ?? []).map((s) => s.key))).filter((k) => SERVICES.some((s) => s.key === k));
  assert(keys.length > 0, "Pick at least one service you offer");
  const services: CreatorService[] = keys.map((key) => {
    const given = input.services.find((s) => s.key === key);
    const price = key === "videography" || key === "influencer" ? null : given?.price ? Math.round(Number(given.price)) : null;
    return { key, ...DEFAULT_SERVICE[key], price: key === "videography" ? 2500 : price };
  });
  if (input.upiId) assert(/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(input.upiId.trim()), "UPI ID looks wrong, e.g. name@okaxis");

  const creatorId = newId("cr");
  const user: User = { id: newId("u"), role: "creator", name: input.name.trim(), phone: input.phone.trim(), creatorId, createdAt: now };
  const creator: Creator = {
    id: creatorId,
    userId: user.id,
    name: user.name,
    bio: input.bio?.trim() || "",
    cityId: place.city.id,
    zoneId: place.zone.id,
    lat: place.zone.lat,
    lng: place.zone.lng,
    languages: input.languages?.length ? input.languages : ["Assamese", "Hindi", "English"],
    services,
    gear: input.gear ?? [],
    instagram: input.instagram?.trim() || undefined,
    followers: input.followers ? Math.round(Number(input.followers)) : undefined,
    onDemand: !!input.onDemand && keys.includes("videography"),
    available: false,
    maxTravelKm: [5, 10, 15, 20, 25].includes(Number(input.maxTravelKm)) ? Number(input.maxTravelKm) : 10,
    verification: "pending",
    kyc: { aadhaar: !!input.aadhaarDone, pan: !!input.panDone },
    upiId: input.upiId?.trim() || undefined,
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
    assert(/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(patch.upiId.trim()), "UPI ID looks wrong, e.g. name@okaxis");
    c.upiId = patch.upiId.trim();
  }
  if (typeof patch.lat === "number" && typeof patch.lng === "number") {
    c.lat = patch.lat;
    c.lng = patch.lng;
  }
  return c;
}

export function setVerification(db: DB, creatorId: string, decision: "verified" | "rejected") {
  const c = db.creators.find((x) => x.id === creatorId);
  assert(c, "Creator not found", 404);
  assert(c.verification === "pending", "Already reviewed");
  if (decision === "verified") assert(c.kyc.aadhaar && c.kyc.pan, "Aadhaar and PAN checks must be complete before approval");
  c.verification = decision;
  return c;
}
