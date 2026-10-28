// End-to-end check of the main flows against a running server.
// Usage: npm run build && npm start   (in one terminal)
//        node scripts/smoke.mjs       (in another; BASE=http://localhost:3000 by default)
// WARNING: resets the demo data.

const BASE = process.env.BASE ?? "http://localhost:3000";
const IST = 5.5 * 3600_000;
let passed = 0;

function ok(cond, msg) {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
  passed++;
  console.log(`✓ ${msg}`);
}

class Agent {
  constructor(name) {
    this.name = name;
    this.cookie = "";
  }
  async req(path, body, method) {
    const res = await fetch(BASE + path, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    const json = await res.json().catch(() => ({}));
    return { status: res.status, ...json };
  }
  async signIn(userId) {
    const r = await this.req("/api/session", { userId });
    ok(r.ok, `${this.name} signs in`);
    return this;
  }
}

function slotFrom(serverNow) {
  const t = new Date(serverNow + 3 * 3600_000 + IST);
  let day = t.toISOString().slice(0, 10);
  let h = t.getUTCHours() + 1;
  if (h > 18) {
    day = new Date(serverNow + 27 * 3600_000 + IST).toISOString().slice(0, 10);
    h = 11;
  }
  if (h < 8) h = 11;
  return `${day}T${String(h).padStart(2, "0")}:00`;
}

const ops = await new Agent("Ops").signIn("u_ops");
let r = await ops.req("/api/admin", { action: "reset_demo" });
ok(r.ok, "demo data reset");

const priya = await new Agent("Priya (client)").signIn("u_priya");
const ankita = await new Agent("Ankita (creator)").signIn("u_ankita");
const rituraj = await new Agent("Rituraj (creator)").signIn("u_rituraj");
const nilakshi = await new Agent("Nilakshi (creator)").signIn("u_nilakshi");
const wan = await new Agent("Wanphrang (creator)").signIn("u_wanphrang");

// --- Auto-assign shoot in Guwahati -------------------------------------------
r = await priya.req("/api/session");
const scheduledAt = slotFrom(r.serverNow);
r = await priya.req("/api/bookings", {
  packageId: "quick_reel",
  cityId: "guwahati",
  zoneId: "zoo-road",
  address: "Café Brahma, RG Baruah Road",
  scheduledAt,
  brief: "Opening-week reel for our café, warm look",
});
ok(r.ok && r.data.status === "searching", `booking created for ${scheduledAt} IST and searching`);
const b1 = r.data;
ok(b1.dispatch.notified === 3 && b1.dispatch.radiusKm === 10, "3 creators alerted within 10 km");
ok(b1.total === 2950, "total is ₹2,950 incl. GST");

r = await rituraj.req("/api/offers");
const ritOffer = r.data.find((o) => o.bookingId === b1.id);
ok(ritOffer && ritOffer.payout === 2000 && ritOffer.expiresAt - ritOffer.sentAt === 5 * 60_000, "Rituraj sees the alert: ₹2,000 payout, 5 min to accept");
ok(!("address" in ritOffer), "alert hides the exact address");

r = await ankita.req("/api/offers");
const ankOffer = r.data.find((o) => o.bookingId === b1.id);
r = await ankita.req(`/api/offers/${ankOffer.id}`, { action: "accept" });
ok(r.ok, "Ankita accepts first");
r = await rituraj.req(`/api/offers/${ritOffer.id}`, { action: "accept" });
ok(r.status === 409, "Rituraj’s late accept is rejected (409)");

r = await priya.req(`/api/bookings/${b1.id}`);
ok(r.data.status === "assigned" && r.data.otp?.length === 4, "client sees creator assigned and a start code");
const otp = r.data.otp;
r = await ankita.req(`/api/bookings/${b1.id}`);
ok(r.data.otp === undefined && r.data.address.includes("Café Brahma"), "creator sees address but not the code");

r = await ankita.req(`/api/bookings/${b1.id}`, { action: "checkin", otp: "0000", lat: b1.lat, lng: b1.lng });
ok(r.status === 400, "wrong start code is refused");
r = await ankita.req(`/api/bookings/${b1.id}`, { action: "checkin", otp, lat: b1.lat + 0.02, lng: b1.lng });
ok(r.status === 400 && /from the address/.test(r.error), "check-in 2 km away is refused");
r = await ankita.req(`/api/bookings/${b1.id}`, { action: "checkin", otp, lat: b1.lat, lng: b1.lng });
ok(r.ok && r.data.status === "shooting", "check-in at the address starts the shoot");
r = await ankita.req(`/api/bookings/${b1.id}`, { action: "finish" });
ok(r.data.status === "editing", "shoot finished");
r = await ankita.req(`/api/bookings/${b1.id}`, { action: "deliver", videoUrl: "https://drive.example.com/v1" });
ok(r.data.status === "delivered" && r.data.latePenaltyPct === 0, "delivered on time");
r = await priya.req(`/api/bookings/${b1.id}`, { action: "revision", note: "Brighter colour grade please" });
ok(r.data.status === "revision_requested" && r.data.revisionsLeft === 0, "client uses the free revision");
r = await ankita.req(`/api/bookings/${b1.id}`, { action: "deliver", videoUrl: "https://drive.example.com/v2" });
ok(r.data.status === "delivered", "revision delivered");
r = await priya.req(`/api/bookings/${b1.id}`, { action: "approve", rating: 5, review: "Great" });
ok(r.data.status === "completed", "client approves");
r = await ankita.req("/api/wallet");
ok(r.data.available === 6400, "Ankita’s wallet: ₹4,400 earlier + ₹2,000 now");

// --- No taker → ops ----------------------------------------------------------
r = await priya.req("/api/session");
r = await priya.req("/api/bookings", {
  packageId: "event_highlights",
  cityId: "silchar",
  zoneId: "silchar-town",
  address: "Hotel Kanishka, Silchar",
  scheduledAt: slotFrom(r.serverNow),
  brief: "Highlights of our store launch event",
});
const b2 = r.data;
ok(b2.dispatch.notified === 0 && b2.dispatch.widened, "Silchar: nobody nearby, search widened straight away");
r = await ops.req("/api/admin", { action: "advance_clock", minutes: 6 });
r = await priya.req(`/api/bookings/${b2.id}`);
ok(r.data.status === "needs_ops", "after 5 minutes the booking goes to ops");
r = await ops.req("/api/admin");
const row = r.data.dispatch.find((x) => x.id === b2.id);
ok(row && row.candidates.length > 0, "ops sees candidates to assign by hand");
r = await ops.req(`/api/bookings/${b2.id}`, { action: "refund", reason: "no creator in Silchar yet" });
ok(r.data.status === "refunded", "ops refunds the client");

// --- Client picks a creator who declines -------------------------------------
r = await priya.req("/api/session");
r = await priya.req("/api/bookings", {
  packageId: "quick_reel",
  cityId: "jorhat",
  zoneId: "jorhat-town",
  address: "Gar-Ali, Jorhat",
  scheduledAt: slotFrom(r.serverNow),
  brief: "Reel for our new bakery in Jorhat",
  requestedCreatorId: "cr_nilakshi",
});
const b3 = r.data;
ok(b3.dispatch.phase === "direct" && b3.dispatch.notified === 1, "chosen creator gets it first");
r = await nilakshi.req("/api/offers");
r = await nilakshi.req(`/api/offers/${r.data[0].id}`, { action: "decline" });
r = await priya.req(`/api/bookings/${b3.id}`);
ok(r.data.dispatch.phase === "broadcast", "after decline everyone nearby is alerted");
r = await ops.req("/api/admin", { action: "advance_clock", minutes: 6 });
r = await ops.req(`/api/bookings/${b3.id}`, { action: "assign", creatorId: "cr_nilakshi" });
ok(r.data.status === "assigned", "ops assigns by hand after the window");

// --- Campaign ----------------------------------------------------------------
const brand = new Agent("Brand (guest)");
r = await brand.req("/api/campaigns", {
  brandName: "Kaziranga Organics",
  contactName: "Mitali",
  email: "mitali@kazorganics.in",
  phone: "9876543210",
  goal: "Product launch",
  regions: ["Assam"],
  budgetRange: "₹3 – 10 lakh",
  callAt: "2030-01-10T14:30",
  callMode: "video",
});
ok(r.ok, "brand books a strategy call without signing in");
const cid = r.data.id;
r = await ops.req(`/api/campaigns/${cid}`, { action: "update", budget: 300000, commissionRate: 0.32 });
ok(r.data.math.commission === 96000 && r.data.math.creatorPool === 204000, "32% of ₹3 L = ₹96,000 commission");
r = await ops.req(`/api/campaigns/${cid}`, { action: "update", stage: "booking_creators" });
ok(r.status === 400, "can’t start booking creators before the advance");
await ops.req(`/api/campaigns/${cid}`, { action: "update", advancePaid: true });
r = await ops.req(`/api/campaigns/${cid}`, { action: "update", stage: "booking_creators" });
ok(r.data.stage === "booking_creators", "stage moves after advance");
r = await ops.req(`/api/campaigns/${cid}`, { action: "invite", creatorId: "cr_ankita", deliverables: "1 reel + 2 stories", fee: 20000 });
ok(r.ok, "ops invites Ankita at ₹20,000");
r = await ankita.req(`/api/campaigns/${cid}`, { action: "respond", accept: true });
ok(r.ok, "Ankita accepts the invite");
await ops.req(`/api/campaigns/${cid}`, { action: "update", stage: "report_settle", balancePaid: true });
r = await ops.req(`/api/campaigns/${cid}`, { action: "settle" });
ok(r.data.stage === "closed", "campaign settled and closed");
r = await ankita.req("/api/wallet");
ok(r.data.available === 26400, "Ankita’s campaign fee is in her wallet");

// --- Payouts -----------------------------------------------------------------
r = await ankita.req("/api/wallet", { amount: 5000, instant: false });
ok(r.ok && r.data.status === "processing", "Ankita requests a Friday payout");
r = await ops.req("/api/admin", { action: "payout_run" });
ok(r.data.count === 1 && r.data.total === 5000, "ops runs the payout");

// --- New creator -------------------------------------------------------------
const neo = new Agent("New creator");
r = await neo.req("/api/creators", {
  name: "Jintu Deka",
  phone: "+91 91234 56789",
  cityId: "guwahati",
  zoneId: "six-mile",
  services: [{ key: "videography" }, { key: "video_editing", price: 900 }],
  onDemand: true,
  maxTravelKm: 15,
  upiId: "jintu@ybl",
  aadhaarDone: true,
  panDone: true,
});
ok(r.ok, "new creator signs up");
r = await neo.req("/api/me/creator", { available: true }, "PATCH");
ok(r.status === 400, "can’t go online before verification");
await ops.req("/api/admin", { action: "verify", creatorId: r.data?.id ?? (await neo.req("/api/session")).data.creator.id, decision: "verified" });
r = await neo.req("/api/me/creator", { available: true }, "PATCH");
ok(r.ok && r.data.available, "after approval the creator goes online");

// --- Pages render ------------------------------------------------------------
for (const p of ["/", "/login", "/creators", "/creators/cr_ankita", "/book", "/bookings", `/bookings/${b1.id}`, "/brands", "/join", "/creator", `/creator/jobs/${b1.id}`, "/creator/wallet", "/creator/campaigns", "/ops", "/ops/campaigns", "/ops/creators"]) {
  const res = await fetch(BASE + p);
  ok(res.status === 200, `page ${p} renders`);
}

await ops.req("/api/admin", { action: "reset_demo" });
console.log(`\nAll ${passed} checks passed. Demo data reset.`);
