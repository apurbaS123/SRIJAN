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
  /** Max hours on location; 0 for online jobs. */
  hours: number;
  summary: string;
  /** Only creators offering this service are alerted. */
  service: ServiceKey;
  /** Done remotely: no address, and creators are alerted wherever they are. */
  online?: boolean;
  /** No longer sold: hidden from the menu and can't be booked. */
  retired?: boolean;
}

/**
 * The menu on /book, in the order shown. Prices (₹) and wording come from Srijan's offline and
 * online pricing matrices. Clients pay exactly this. Sections follow the order of first appearance.
 */
export const PACKAGES: ShootPackage[] = [
  // Videographers
  { id: "video_tour", name: "Hyperlocal Tour", price: 1499, hours: 1.5, service: "videography", summary: "90 mins on-site. Gimbal walkthrough of venue/store. Transfers raw 4K footage instantly to client on-spot." },
  { id: "video_milestone", name: "Milestone Capture", price: 2499, hours: 2, service: "videography", summary: "2 hrs on-site. Shoot car delivery, proposal, or micro-event. Raw delivery on-spot + 1 edited reel in 24h." },
  { id: "video_full_day", name: "Full-Day Event Video", price: 6499, hours: 8, service: "videography", summary: "8 hrs on-site. Comprehensive event coverage (wedding, corporate event). All raw files transferred on-site." },
  { id: "video_direction", name: "Virtual Shoot Direction (1 Hr)", price: 999, hours: 0, service: "videography", online: true, summary: "Connects via video call to help a founder or business owner set up their own lights/camera and directs their solo shoot live." },
  // Photographers
  { id: "photo_click_drop", name: "Click & Drop", price: 1999, hours: 2, service: "photography", summary: "2 hrs on-site. Social function (party/farewell). Min. 100 raw images transferred to client immediately." },
  { id: "photo_catalog", name: "Product Catalog", price: 3499, hours: 3, service: "photography", summary: "3 hrs on-site. Tabletop shoot for cafe or boutique. Raw delivery + 15 color-graded masters." },
  { id: "photo_portraits", name: "Executive Portraits", price: 1499, hours: 1, service: "photography", summary: "1 hr on-site. Corporate headshots in natural setting or client office. 5 fully retouched print-ready images." },
  { id: "photo_full_day", name: "Full-Day Event Photos", price: 5999, hours: 8, service: "photography", summary: "8 hrs on-site. Complete event photography. Delivery of all RAWs on-site + 50 graded highlights in 48h." },
  { id: "photo_retouch", name: "Bulk Photo Retouching", price: 1499, hours: 0, service: "photography", online: true, summary: "Client uploads up to 50 raw event/product images. Photographer color grades and retouches them for standard web use." },
  // Influencers
  { id: "inf_store_visit", name: "Store Visit Hype", price: 2999, hours: 1, service: "influencer", summary: "1 hr on-site. Nano/Micro influencer experiences service, shoots, and posts 1 Reel tagging the business." },
  { id: "inf_review", name: "Local Review Session", price: 3999, hours: 2, service: "influencer", summary: "2 hrs on-site. Detailed dine-in or salon review. Produces 1 dedicated Reel + 3 Story highlights." },
  { id: "inf_testimonial", name: "Direct-to-Camera Testimonial", price: 1999, hours: 0, service: "influencer", online: true, summary: "30–45s authentic review/unboxing filmed vertically at home (client ships product). Handed over raw for ad usage." },
  { id: "inf_shoutout", name: "Digital Shoutout / Story Promo", price: 1499, hours: 0, service: "influencer", online: true, summary: "Nano/Micro influencer posts 2 consecutive Instagram Stories linking to the brand (no physical visit required)." },
  // Social media managers
  { id: "smm_live_host", name: "Live Event Host", price: 1499, hours: 3, service: "social_media", summary: "3 hrs on-site. Takes over brand's phone/account during a launch or party to post live stories & interact." },
  { id: "smm_setup_audit", name: "On-Site Setup Audit", price: 1499, hours: 2, service: "social_media", summary: "2 hrs on-site. Visits client office to set up Meta Business Suite, fix profile aesthetics, and train staff." },
  { id: "smm_profile_grid", name: "Profile Grid Setup", price: 1299, hours: 0, service: "social_media", online: true, summary: "Complete digital optimization: rewrites bio, designs 5 Highlight covers, and sets up Meta Business link tree." },
  { id: "smm_community", name: "7-Day Community Sprint", price: 2499, hours: 0, service: "social_media", online: true, summary: "Remote engagement slot: clears DM backlogs, replies to all comments, and actively engages with niche accounts daily for 1 week." },
  // Video editors
  { id: "edit_onsite", name: "On-Site Edit Sprint", price: 2999, hours: 4, service: "video_editing", summary: "4 hrs on-site. Sits at client event/office, ingesting live footage to cut and upload Reels instantly during the event." },
  { id: "edit_reel", name: "Reel/Short Flash Cut", price: 999, hours: 0, service: "video_editing", online: true, summary: "Up to 60s edit from supplied raw footage. Includes jump cuts, viral hooks, captions, and B-roll overlays." },
  { id: "edit_live", name: "Live Editing Sprint (2 Hrs)", price: 1499, hours: 0, service: "video_editing", online: true, summary: "Remote screen-share session. Connects live with client via Meet/AnyDesk to edit 2 Reels collaboratively on the spot." },
  { id: "edit_youtube", name: "YouTube Long-Form Cut", price: 3499, hours: 0, service: "video_editing", online: true, summary: "10-15 min video edit. Includes basic color grading, intro/outro placement, audio leveling, and standard transitions." },
  // Content writers
  { id: "write_live", name: "Live Event Coverage", price: 1499, hours: 3, service: "content_writing", summary: "3 hrs on-site. Attends a conference or launch to live-tweet, take interview notes, and draft PR summaries on the spot." },
  { id: "write_social", name: "Social Copy Bundle", price: 999, hours: 0, service: "content_writing", online: true, summary: "10 engaging captions tailored for Instagram/Facebook, complete with strategic hashtag sets and CTAs." },
  { id: "write_seo", name: "SEO Pulse Article", price: 1499, hours: 0, service: "content_writing", online: true, summary: "1,000-1,200 word search-optimized blog post or LinkedIn newsletter article. Includes meta tags." },
  // Graphic designers
  { id: "design_live", name: "Live Brand Sprint", price: 1499, hours: 2, service: "graphic_design", summary: "2 hrs on-site. Sits with the client physically to design and finalize menus, flyers, or logos without email back-and-forth." },
  { id: "design_ad_pack", name: "Social Ad Pack Duo", price: 1199, hours: 0, service: "graphic_design", online: true, summary: "2 static conversion graphics (e.g., 1:1 Instagram Post and 9:16 Story format) with layered source files." },
  { id: "design_thumbnail", name: "Click-Magnet Thumbnail", price: 799, hours: 0, service: "graphic_design", online: true, summary: "1 high-CTR YouTube thumbnail featuring subject cutout, expression pop, and bold typography." },
  { id: "design_invite", name: "Digital Event Invitation", price: 899, hours: 0, service: "graphic_design", online: true, summary: "1 customized, themed WhatsApp e-invite or static banner for weddings, baby showers, or shop openings." },
  // Voice-over artists
  { id: "voice_studio", name: "Local Studio Session", price: 1999, hours: 2, service: "voice_over", summary: "2 hrs on-site. Travels to the client's local radio station, studio, or event to record live prompts or announcements." },
  { id: "voice_ad", name: "Express Ad Prompt (60s)", price: 799, hours: 0, service: "voice_over", online: true, summary: "Up to 150 words (English/Hindi/Regional), delivered as a studio-cleared MP3/WAV file for reels or radio." },
  { id: "voice_corporate", name: "Corporate / IVR Setup", price: 2499, hours: 0, service: "voice_over", online: true, summary: "Up to 3 minutes of polished audio for explainer videos, company presentations, or multi-menu phone greetings." },

  // No longer sold. Kept so bookings made with them can still show their name and hours.
  { id: "quick_reel", name: "Quick Reel", price: 2500, hours: 2, service: "videography", retired: true, summary: "1 reel up to 60 sec · up to 2 hr shoot · edit, captions, music" },
  { id: "product_showcase", name: "Product Showcase", price: 5500, hours: 3, service: "videography", retired: true, summary: "3 short videos · up to 3 hr shoot · product close-ups" },
  { id: "event_highlights", name: "Event Highlights", price: 8500, hours: 4, service: "videography", retired: true, summary: "60–90 sec highlight film + 2 reels · up to 4 hr coverage" },
  { id: "brand_story", name: "Brand Story", price: 12500, hours: 5, service: "videography", retired: true, summary: "1 film up to 2 min · half-day shoot · script help" },
  { id: "video_edit", name: "Video Editing", price: 1500, hours: 0, service: "video_editing", online: true, retired: true, summary: "Online job · no visit · your editor calls you for the clips and sends the finished edit" },
];

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
  /** On-site jobs need this much notice, so a creator coming from far can arrive on time. Online jobs need none. */
  onSiteNoticeMs: 1 * HOUR,
  /** How far ahead a job can be booked. */
  maxDaysAhead: 90,
  /** Gap kept around a shoot so one creator isn't double-booked. */
  slotBufferMs: 1 * HOUR,
  /** Shoot start hours allowed (IST, 24h clock). */
  firstStartHour: 0,
  lastStartHour: 23,
};

/** How many services one order on /book can hold. */
export const MAX_SERVICES_PER_ORDER = 10;

export const AUTO_APPROVE_MS = 48 * HOUR; // after the creator marks the job finished
/** An unpaid booking is dropped after this long. Checkout closes itself sooner (see /book). */
export const PAYMENT_WINDOW_MS = 30 * MIN;

export const CAMPAIGN_COMMISSION = { min: 0.3, max: 0.35, default: 0.3 };

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
