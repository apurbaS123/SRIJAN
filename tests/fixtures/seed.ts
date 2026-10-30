// Test fixture: a small fictional marketplace for the unit tests. Not used by the app.
import { CREATOR_SHARE, DAY, GST_RATE, HOUR, findZone } from "@/lib/domain/config";
import type { Campaign, Creator, CreatorService, DB, User } from "@/lib/domain/types";
import { rupees } from "@/lib/domain/util";

const svc = {
  shoot: (price = 2500): CreatorService => ({ key: "videography", title: "1-day shoot", description: "On-location shoot and edit, delivered within 24 hours at Srijan’s fixed package price.", price }),
  edit: (price = 800): CreatorService => ({ key: "video_editing", title: "Edit my footage", description: "Send your clips, get 1 edited reel with captions and music.", price }),
  collab: (): CreatorService => ({ key: "influencer", title: "Brand collaboration", description: "Sponsored reels and stories, handled by the Srijan campaign team.", price: null }),
  photo: (price = 3000): CreatorService => ({ key: "photography", title: "Photo shoot", description: "Up to 2 hours, 25 edited photos.", price }),
  design: (price = 1500): CreatorService => ({ key: "graphic_design", title: "Social media creatives", description: "5 post designs in your brand style.", price }),
  write: (price = 1200): CreatorService => ({ key: "content_writing", title: "Captions & scripts", description: "10 captions or 2 reel scripts, English or Assamese.", price }),
  voice: (price = 1000): CreatorService => ({ key: "voice_over", title: "Voice-over", description: "Up to 60 sec, Assamese, Hindi or English.", price }),
  social: (price = 9000): CreatorService => ({ key: "social_media", title: "Monthly page management", description: "12 posts a month, scheduling and replies.", price }),
};

interface CreatorSeed {
  id: string;
  name: string;
  bio: string;
  cityId: string;
  zoneId: string;
  services: CreatorService[];
  gear: string[];
  languages?: string[];
  instagram?: string;
  followers?: number;
  engagementRate?: number;
  onDemand?: boolean;
  available?: boolean;
  maxTravelKm?: number;
  verification?: Creator["verification"];
  rating?: [number, number];
  jobsDone?: number;
  phone: string;
  upiId?: string;
}

const CREATORS: CreatorSeed[] = [
  { id: "cr_ankita", name: "Ankita Baruah", bio: "Videographer, editor and lifestyle creator. Cafés, product launches and small events.", cityId: "guwahati", zoneId: "zoo-road", services: [svc.shoot(), svc.edit(), svc.collab()], gear: ["Mirrorless camera", "Gimbal", "Wireless mic"], instagram: "@ankita.frames", followers: 42000, engagementRate: 6.1, rating: [624, 128], jobsDone: 210, maxTravelKm: 10, phone: "+91 98640 11111", upiId: "ankita@okaxis" },
  { id: "cr_rituraj", name: "Rituraj Das", bio: "Shooter and editor. Weddings, reels and real estate walkthroughs.", cityId: "guwahati", zoneId: "beltola", services: [svc.shoot(), svc.edit(700)], gear: ["Mirrorless camera", "Gimbal", "Lights"], rating: [307, 64], jobsDone: 88, maxTravelKm: 15, phone: "+91 98640 22222", upiId: "rituraj@ybl" },
  { id: "cr_dhruba", name: "Dhruba Kalita", bio: "Phone-first reel maker. Fast turnarounds for shops and restaurants.", cityId: "guwahati", zoneId: "maligaon", services: [svc.shoot(), svc.edit(600)], gear: ["4K phone", "Gimbal", "Wireless mic"], rating: [190, 41], jobsDone: 45, maxTravelKm: 20, phone: "+91 98640 33333", upiId: "dhruba@paytm" },
  { id: "cr_nilakshi", name: "Nilakshi Bora", bio: "Tea-garden stories, events and brand films around Jorhat.", cityId: "jorhat", zoneId: "garali", services: [svc.shoot(), svc.photo()], gear: ["Mirrorless camera", "Drone", "Wireless mic"], rating: [139, 29], jobsDone: 31, maxTravelKm: 25, phone: "+91 98640 44444", upiId: "nilakshi@okicici" },
  { id: "cr_pallab", name: "Pallab Gogoi", bio: "Brand stories and documentary-style films in upper Assam.", cityId: "dibrugarh", zoneId: "chowkidinghee", services: [svc.shoot(), svc.edit(900)], gear: ["Cinema camera", "Lights", "Wireless mic"], rating: [96, 20], jobsDone: 22, maxTravelKm: 20, phone: "+91 98640 55555", upiId: "pallab@okaxis" },
  { id: "cr_wanphrang", name: "Wanphrang Lyngdoh", bio: "Music videos, events and café content in Shillong.", cityId: "shillong", zoneId: "police-bazar", services: [svc.shoot(), svc.edit()], gear: ["Mirrorless camera", "Gimbal"], languages: ["Khasi", "English", "Hindi"], rating: [173, 36], jobsDone: 40, maxTravelKm: 15, phone: "+91 98640 66666", upiId: "wan@ybl" },
  { id: "cr_lalrem", name: "Lalremruati", bio: "Fashion and lifestyle creator from the hills.", cityId: "shillong", zoneId: "laitumkhrah", services: [svc.collab()], gear: [], languages: ["Mizo", "English"], instagram: "@lalrem.style", followers: 18000, engagementRate: 4.2, onDemand: false, rating: [44, 9], jobsDone: 9, phone: "+91 98640 77777", upiId: "lalrem@okhdfc" },
  { id: "cr_bhaswati", name: "Bhaswati Nath", bio: "Brand designer: social creatives, menus and posters.", cityId: "guwahati", zoneId: "chandmari", services: [svc.design(), svc.social()], gear: [], onDemand: false, rating: [92, 19], jobsDone: 27, phone: "+91 98640 88888", upiId: "bhaswati@okaxis" },
  { id: "cr_ritika", name: "Ritika Saikia", bio: "Copywriter and voice-over artist, Assamese and English.", cityId: "guwahati", zoneId: "ganeshguri", services: [svc.write(), svc.voice()], gear: [], onDemand: false, rating: [68, 14], jobsDone: 18, phone: "+91 98640 99999", upiId: "ritika@ybl" },
  { id: "cr_mridul", name: "Mridul Kalita", bio: "Drone and real-estate videographer. New to Srijan.", cityId: "guwahati", zoneId: "jalukbari", services: [svc.shoot()], gear: ["Mirrorless camera", "Drone"], verification: "pending", available: false, rating: [0, 0], jobsDone: 0, maxTravelKm: 20, phone: "+91 98640 10101" },
];

export function seedDb(now: number): DB {
  const db: DB = { version: 1, seq: 2040, users: [], creators: [], bookings: [], offers: [], ledger: [], campaigns: [] };

  const users: User[] = [
    { id: "u_priya", role: "client", name: "Priya Sharma", phone: "+91 98540 12345", email: "priya@cafebrahma.in", createdAt: now },
    { id: "u_rohan", role: "client", name: "Rohan Hazarika", phone: "+91 98540 67890", email: "rohan@brahmaputratea.in", createdAt: now },
    { id: "u_ops", role: "ops", name: "Srijan Ops", email: "ops@srijan.app", createdAt: now },
  ];
  db.users.push(...users);

  for (const s of CREATORS) {
    const place = findZone(s.cityId, s.zoneId)!;
    const userId = `u_${s.id.slice(3)}`;
    db.users.push({ id: userId, role: "creator", name: s.name, phone: s.phone, creatorId: s.id, createdAt: now });
    db.creators.push({
      id: s.id,
      userId,
      name: s.name,
      bio: s.bio,
      cityId: s.cityId,
      zoneId: s.zoneId,
      lat: place.zone.lat,
      lng: place.zone.lng,
      languages: s.languages ?? ["Assamese", "Hindi", "English"],
      services: s.services,
      gear: s.gear,
      instagram: s.instagram,
      followers: s.followers,
      engagementRate: s.engagementRate,
      onDemand: s.onDemand ?? true,
      available: s.available ?? true,
      maxTravelKm: s.maxTravelKm ?? 15,
      verification: s.verification ?? "verified",
      kyc: { aadhaar: true, pan: s.verification !== "pending" },
      upiId: s.upiId,
      ratingSum: s.rating?.[0] ?? 0,
      ratingCount: s.rating?.[1] ?? 0,
      jobsDone: s.jobsDone ?? 0,
      createdAt: now - 60 * DAY,
    });
  }

  // One finished shoot so wallets and the money table aren't empty.
  const done = now - 4 * DAY;
  const price = 5500;
  const gst = rupees(price * GST_RATE);
  const z = findZone("guwahati", "ganeshguri")!.zone;
  db.bookings.push({
    id: "bkg_seed_1",
    code: "SR-2031",
    clientId: "u_priya",
    packageId: "product_showcase",
    price,
    gst,
    total: price + gst,
    address: "Shop 4, GS Road, Ganeshguri, Guwahati",
    cityId: "guwahati",
    zoneId: "ganeshguri",
    lat: z.lat,
    lng: z.lng,
    scheduledAt: done - 6 * HOUR,
    brief: "Three short videos of our new winter menu for Instagram.",
    aspect: "9:16",
    creatorId: "cr_ankita",
    status: "completed",
    otp: "1234",
    createdAt: done - 9 * HOUR,
    paidAt: done - 9 * HOUR,
    dispatch: { phase: "done", roundStartedAt: done - 9 * HOUR, roundEndsAt: done - 9 * HOUR + 5 * 60_000, widened: false, radiusKm: 10, notifiedCreatorIds: ["cr_ankita", "cr_rituraj", "cr_dhruba"] },
    assignedAt: done - 9 * HOUR + 120_000,
    checkInAt: done - 6 * HOUR,
    shootEndAt: done - 3.5 * HOUR,
    deliveryDueAt: done - 6 * HOUR + 24 * HOUR,
    deliveredAt: done - 1 * HOUR,
    firstDeliveredAt: done - 1 * HOUR,
    videoUrl: "https://example.com/videos/sr-2031",
    revisionsUsed: 0,
    approvedAt: done,
    rating: 5,
    review: "Quick, friendly and the videos look great.",
    latePenaltyPct: 0,
    events: [
      { at: done - 9 * HOUR, text: "Paid ₹6,490 · held safely by Srijan" },
      { at: done - 9 * HOUR, text: "3 creators within 10 km alerted · 5 min to accept" },
      { at: done - 9 * HOUR + 120_000, text: "Ankita Baruah accepted · 3 alerted · matched in 2 min 0 sec" },
      { at: done - 6 * HOUR, text: "Creator checked in · shoot started" },
      { at: done - 3.5 * HOUR, text: "Shoot finished · editing" },
      { at: done - 1 * HOUR, text: "Video delivered on time" },
      { at: done, text: "Approved · ₹4,400 released to the creator" },
    ],
  });
  db.ledger.push(
    { id: "led_s1", at: done - 9 * HOUR, type: "client_payment", amount: price + gst, bookingId: "bkg_seed_1", note: "SR-2031 · held until approval" },
    { id: "led_s2", at: done, type: "creator_earning", amount: rupees(price * CREATOR_SHARE), bookingId: "bkg_seed_1", creatorId: "cr_ankita", note: "SR-2031" },
    { id: "led_s3", at: done, type: "platform_fee", amount: price - rupees(price * CREATOR_SHARE), bookingId: "bkg_seed_1", note: "SR-2031 · 20%" },
    { id: "led_s4", at: done, type: "gst_collected", amount: gst, bookingId: "bkg_seed_1", note: "SR-2031" },
  );

  const campaign = (c: Partial<Campaign> & Pick<Campaign, "id" | "code" | "brandName" | "stage">): Campaign => ({
    contactName: "Brand contact",
    email: "marketing@example.com",
    phone: "+91 90000 00000",
    goal: "Brand awareness",
    regions: ["Assam"],
    budgetRange: "₹3 – 10 lakh",
    callAt: now + DAY,
    callMode: "video",
    budget: null,
    commissionRate: 0.3,
    advancePaid: false,
    balancePaid: false,
    creators: [],
    notes: "",
    createdAt: now - 10 * DAY,
    ...c,
  });
  db.campaigns.push(
    campaign({ id: "cmp_hills", code: "CMP-101", brandName: "Hills Homestays", contactName: "Daphi Kharkongor", stage: "call_booked", goal: "Bookings for winter season", regions: ["Meghalaya", "Assam"], budgetRange: "₹1 – 3 lakh", callAt: now + DAY + 2 * HOUR }),
    campaign({ id: "cmp_edtech", code: "CMP-102", brandName: "Northeast Edtech", stage: "proposal_sent", budget: 400000, commissionRate: 0.32, goal: "App installs", regions: ["All 8 NE states"] }),
    campaign({ id: "cmp_tea", code: "CMP-103", userId: "u_rohan", brandName: "Brahmaputra Tea Co.", contactName: "Rohan Hazarika", email: "rohan@brahmaputratea.in", stage: "booking_creators", budget: 600000, commissionRate: 0.3, advancePaid: true, goal: "Product launch", regions: ["Assam", "Meghalaya"], creators: [{ creatorId: "cr_ankita", deliverables: "1 reel + 3 stories, post on 10 Nov", fee: 15000, status: "invited", invitedAt: now - DAY }] }),
    campaign({ id: "cmp_cafe", code: "CMP-104", brandName: "Shillong Café Chain", stage: "content_review", budget: 300000, commissionRate: 0.3, advancePaid: true, regions: ["Meghalaya"], creators: [{ creatorId: "cr_wanphrang", deliverables: "2 reels", fee: 18000, status: "accepted", invitedAt: now - 6 * DAY }] }),
    campaign({ id: "cmp_fashion", code: "CMP-105", brandName: "NE Fashion Hub", stage: "report_settle", budget: 250000, commissionRate: 0.35, advancePaid: true, balancePaid: true, goal: "Online sales", regions: ["All 8 NE states"], creators: [{ creatorId: "cr_lalrem", deliverables: "2 reels + 4 stories", fee: 20000, status: "accepted", invitedAt: now - 20 * DAY }, { creatorId: "cr_rituraj", deliverables: "Lookbook video", fee: 12000, status: "accepted", invitedAt: now - 20 * DAY }] }),
  );
  db.seq = 2047;
  return db;
}
