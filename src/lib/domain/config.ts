// Business rules in one place. Change a number here and the whole app follows.
import type { ServiceKey, SocialPlatform } from "./types";

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

/** India Standard Time offset — all dates the user types are IST. */
export const IST_OFFSET_MS = 5.5 * HOUR;

export interface ShootPackage {
  id: string;
  name: string;
  price: number;
  /** Max hours on location. */
  hours: number;
  summary: string;
}

/** Suggested launch prices (₹, before GST). Edit freely. */
export const PACKAGES: ShootPackage[] = [
  { id: "quick_reel", name: "Quick Reel", price: 2500, hours: 2, summary: "1 reel up to 60 sec · up to 2 hr shoot · edit, captions, music" },
  { id: "product_showcase", name: "Product Showcase", price: 5500, hours: 3, summary: "3 short videos · up to 3 hr shoot · product close-ups" },
  { id: "event_highlights", name: "Event Highlights", price: 8500, hours: 4, summary: "60–90 sec highlight film + 2 reels · up to 4 hr coverage" },
  { id: "brand_story", name: "Brand Story", price: 12500, hours: 5, summary: "1 film up to 2 min · half-day shoot · script help" },
];

export const GST_RATE = 0.18;
/** On-demand shoots: creator keeps 80%, Srijan keeps 20%. */
export const CREATOR_SHARE = 0.8;
export const PLATFORM_SHARE = 0.2;

export const DISPATCH = {
  /** Client picked a creator: that creator alone gets this long. */
  directOfferMs: 5 * MIN,
  /** Then (or straight away) every available creator nearby gets this long. */
  broadcastWindowMs: 5 * MIN,
  /** If nobody has accepted by this point, the search area widens. */
  widenAfterMs: 3 * MIN,
  initialRadiusKm: 10,
  widenedRadiusKm: 25,
  /** Same-day bookings need this much notice. */
  minNoticeMs: 2 * HOUR,
  /** Gap kept around a shoot so one creator isn't double-booked. */
  slotBufferMs: 1 * HOUR,
  /** Shoot start hours allowed (IST, 24h clock). */
  firstStartHour: 8,
  lastStartHour: 18,
};

export const CHECKIN_RADIUS_KM = 0.2;
export const DELIVERY_SLA_MS = 24 * HOUR; // after the scheduled start
export const AUTO_APPROVE_MS = 48 * HOUR; // after delivery
export const FREE_REVISIONS = 1;
export const LATE_PENALTY = { stepMs: 6 * HOUR, pctPerStep: 10, capPct: 50 };

export const CAMPAIGN_COMMISSION = { min: 0.3, max: 0.35, default: 0.3 };

export const PAYOUT = { minWithdrawal: 100, instantFee: 10 };

export const SERVICES: { key: ServiceKey; label: string }[] = [
  { key: "influencer", label: "Influencers" },
  { key: "videography", label: "Videographers" },
  { key: "video_editing", label: "Video editors" },
  { key: "photography", label: "Photographers" },
  { key: "graphic_design", label: "Graphic designers" },
  { key: "content_writing", label: "Content writers" },
  { key: "voice_over", label: "Voice-over artists" },
  { key: "social_media", label: "Social media managers" },
];

export interface Zone {
  id: string;
  name: string;
  lat: number;
  lng: number;
}
export interface City {
  id: string;
  name: string;
  state: string;
  zones: Zone[];
}

/** Launch cities. Coordinates are approximate — swap for a geocoding API later. */
export const CITIES: City[] = [
  {
    id: "guwahati",
    name: "Guwahati",
    state: "Assam",
    zones: [
      { id: "zoo-road", name: "Zoo Road", lat: 26.172, lng: 91.778 },
      { id: "ganeshguri", name: "Ganeshguri", lat: 26.15, lng: 91.786 },
      { id: "dispur", name: "Dispur", lat: 26.143, lng: 91.79 },
      { id: "beltola", name: "Beltola", lat: 26.122, lng: 91.799 },
      { id: "six-mile", name: "Six Mile", lat: 26.133, lng: 91.806 },
      { id: "khanapara", name: "Khanapara", lat: 26.121, lng: 91.818 },
      { id: "paltan-bazaar", name: "Paltan Bazaar", lat: 26.181, lng: 91.75 },
      { id: "chandmari", name: "Chandmari", lat: 26.185, lng: 91.771 },
      { id: "maligaon", name: "Maligaon", lat: 26.16, lng: 91.69 },
      { id: "jalukbari", name: "Jalukbari", lat: 26.153, lng: 91.663 },
      { id: "basistha", name: "Basistha", lat: 26.108, lng: 91.792 },
    ],
  },
  {
    id: "shillong",
    name: "Shillong",
    state: "Meghalaya",
    zones: [
      { id: "police-bazar", name: "Police Bazar", lat: 25.576, lng: 91.882 },
      { id: "laitumkhrah", name: "Laitumkhrah", lat: 25.57, lng: 91.897 },
      { id: "mawlai", name: "Mawlai", lat: 25.594, lng: 91.878 },
    ],
  },
  {
    id: "jorhat",
    name: "Jorhat",
    state: "Assam",
    zones: [
      { id: "jorhat-town", name: "Jorhat Town", lat: 26.757, lng: 94.203 },
      { id: "garali", name: "Garali", lat: 26.748, lng: 94.211 },
    ],
  },
  {
    id: "dibrugarh",
    name: "Dibrugarh",
    state: "Assam",
    zones: [
      { id: "dibrugarh-town", name: "Dibrugarh Town", lat: 27.473, lng: 94.911 },
      { id: "chowkidinghee", name: "Chowkidinghee", lat: 27.48, lng: 94.908 },
    ],
  },
  {
    id: "silchar",
    name: "Silchar",
    state: "Assam",
    zones: [{ id: "silchar-town", name: "Silchar Town", lat: 24.827, lng: 92.798 }],
  },
  {
    id: "tezpur",
    name: "Tezpur",
    state: "Assam",
    zones: [{ id: "tezpur-town", name: "Tezpur Town", lat: 26.634, lng: 92.793 }],
  },
];

export const CAMPAIGN_STAGES: { key: import("./types").CampaignStage; label: string }[] = [
  { key: "call_booked", label: "Call booked" },
  { key: "proposal_sent", label: "Proposal sent" },
  { key: "booking_creators", label: "Signed · booking creators" },
  { key: "content_review", label: "Content review" },
  { key: "live", label: "Live" },
  { key: "report_settle", label: "Report & settle" },
  { key: "closed", label: "Closed" },
];

/** Where a creator's main social media account can be. `hosts` limits links to that site; empty allows any. */
export const SOCIAL_PLATFORMS: { key: SocialPlatform; label: string; hosts: string[]; example: string }[] = [
  { key: "instagram", label: "Instagram", hosts: ["instagram.com"], example: "instagram.com/yourname" },
  { key: "youtube", label: "YouTube", hosts: ["youtube.com", "youtu.be"], example: "youtube.com/@yourchannel" },
  { key: "facebook", label: "Facebook", hosts: ["facebook.com", "fb.com"], example: "facebook.com/yourpage" },
  { key: "other", label: "Website / portfolio", hosts: [], example: "yourwebsite.com" },
];

export function findPackage(id: string) {
  return PACKAGES.find((p) => p.id === id);
}

export function findZone(cityId: string, zoneId: string) {
  const city = CITIES.find((c) => c.id === cityId);
  const zone = city?.zones.find((z) => z.id === zoneId);
  return city && zone ? { city, zone } : undefined;
}

export function serviceLabel(key: ServiceKey) {
  return SERVICES.find((s) => s.key === key)?.label ?? key;
}
