// End-to-end check of the main flows against a real production server.
// Usage: npm run smoke   (builds, then runs this script)
//        node scripts/smoke.mjs   (uses the existing build in .next)
//
// The script starts its own `next start` on a free port with a throwaway data file, a test
// session secret, and email and WhatsApp switched off, so it never touches your real data or
// sends messages. It signs everyone in through the real email-code flow. Two things it does from outside, by
// editing the throwaway data file between requests (the server reads it on every request):
//   - puts a known sign-in code in place of the email
//   - moves every stored time back to fast-forward the 5-minute dispatch timers

import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SECRET = "smoke-test-session-secret-0123456789abcdef";
const OPS_EMAIL = "team@srijan.test";
const IST = 5.5 * 3600_000;
const MIN = 60_000;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "srijan-smoke-"));
const DATA_FILE = path.join(tmpDir, "db.json");
let server;
let serverLog = "";
let BASE = "";
let passed = 0;

function ok(cond, msg) {
  if (!cond) throw new Error(msg);
  passed++;
  console.log(`✓ ${msg}`);
}

// ── Server ────────────────────────────────────────────────────────────────────

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

async function startServer() {
  if (!fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))) {
    throw new Error("No production build found. Run `npm run smoke` (or `npm run build` first).");
  }
  const port = await freePort();
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: ROOT,
    env: {
      ...process.env,
      SESSION_SECRET: SECRET,
      SRIJAN_DATA_FILE: DATA_FILE,
      // Never use a real database, even if one is configured.
      DATABASE_URL: "",
      POSTGRES_URL: "",
      SRIJAN_OPS_EMAILS: OPS_EMAIL,
      // Empty values win over .env.local, so no email or WhatsApp message is ever sent.
      BREVO_API_KEY: "",
      EMAIL_FROM: "",
      WHATSAPP_TOKEN: "",
      WHATSAPP_PHONE_NUMBER_ID: "",
      WHATSAPP_NOTIFY_TO: "",
      WHATSAPP_TEMPLATE: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (d) => (serverLog += d));
  server.stderr.on("data", (d) => (serverLog += d));
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error("The server stopped while starting");
    try {
      if ((await fetch(`${BASE}/api/session`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("The server didn't start within 60 seconds");
}

// ── Throwaway data file ───────────────────────────────────────────────────────

const readDb = () => JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
function writeDb(db) {
  const tmp = `${DATA_FILE}.smoke.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DATA_FILE);
}

// Latest code per email: the name step re-sends the code the first step checked but didn't use up.
const codes = new Map();

/** Stores a sign-in code for `email` exactly as the server would after emailing it. */
function issueCode(email, code = String(100000 + Math.floor(Math.random() * 900000))) {
  const db = readDb();
  const now = Date.now();
  const codeHash = createHmac("sha256", SECRET).update(`otp:${email}:${code}`).digest("hex");
  db.otps = [...(db.otps ?? []).filter((o) => o.email !== email), { email, codeHash, sentAt: now, expiresAt: now + 10 * MIN, attempts: 0 }];
  writeDb(db);
  codes.set(email, code);
  return code;
}

/** Fast-forwards the marketplace by moving every stored timestamp into the past. */
function advance(minutes) {
  const shift = (v) => {
    if (typeof v === "number" && v > 1e12 && v < 1e13) return v - minutes * MIN;
    if (Array.isArray(v)) return v.map(shift);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shift(x)]));
    return v;
  };
  writeDb(shift(readDb()));
}

// ── People ────────────────────────────────────────────────────────────────────

let ipSeq = 1;
class Agent {
  constructor(name, email, phone) {
    this.name = name;
    this.email = email;
    this.phone = phone;
    this.cookie = "";
    // Own address per person, like real users, so the per-IP rate limits don't trip.
    this.ip = `10.0.0.${ipSeq++}`;
  }
  async req(p, body, method) {
    const res = await fetch(BASE + p, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        Origin: BASE,
        "X-Forwarded-For": this.ip,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    const json = await res.json().catch(() => ({}));
    return { status: res.status, ...json };
  }
  /** Signs in at /login with an email code; new addresses give their name and phone. Returns the role. */
  async signIn() {
    let r = await this.req("/api/session", { email: this.email, code: issueCode(this.email) });
    this.newRole = r.data?.newRole;
    if (r.data?.needsName) r = await this.req("/api/session", { email: this.email, code: codes.get(this.email), name: this.name, phone: this.phone });
    ok(r.ok, `${this.name} signs in with an email code`);
    return r.data.role;
  }
  /** Signs up at /join with an email code. Returns the new creator's id. */
  async joinAsCreator(cityId, zoneId) {
    const r = await this.req("/api/creators", {
      code: issueCode(this.email),
      email: this.email,
      name: this.name,
      phone: this.phone,
      cityId,
      zoneId,
      services: [{ key: "videography" }],
      onDemand: true,
      maxTravelKm: 10,
      upiId: `${this.name.split(" ")[0].toLowerCase()}@ybl`,
    });
    ok(r.ok, `${this.name} joins as a creator in ${zoneId}`);
    return r.data.creatorId;
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

// ── The run ───────────────────────────────────────────────────────────────────

async function run() {
  await startServer();
  console.log(`Server running at ${BASE} with a throwaway data file\n`);

  // --- Sign-in and roles --------------------------------------------------------
  const ops = new Agent("Srijan Ops", OPS_EMAIL, "9000000001");
  const priya = new Agent("Priya Sharma", "priya@cafebrahma.test", "9854012345");
  const ankita = new Agent("Ankita Baruah", "ankita@creators.test", "9864011111");
  const rituraj = new Agent("Rituraj Das", "rituraj@creators.test", "9864022222");
  const dhruba = new Agent("Dhruba Kalita", "dhruba@creators.test", "9864033333");
  const nilakshi = new Agent("Nilakshi Gogoi", "nilakshi@creators.test", "9864044444");

  let r = await ops.req("/api/session/otp", { email: OPS_EMAIL });
  ok(r.status === 503, "with email off, the production server refuses to send codes");
  r = await priya.req("/api/session", { userId: "u_ops" });
  ok(!r.ok, "the old one-click demo sign-in is gone");
  issueCode(priya.email, "111111");
  r = await priya.req("/api/session", { email: priya.email, code: "222222" });
  ok(r.status === 400 && /wrong/.test(r.error), "a wrong email code is refused");
  r = await priya.req("/api/session", { phone: priya.phone, code: "111111" });
  ok(!r.ok, "signing in with a phone number no longer works");

  ok((await ops.signIn()) === "ops", "an address in SRIJAN_OPS_EMAILS gets ops access");
  ok(ops.newRole === "ops", "a new team email is told it’s setting up a team account");
  ok((await priya.signIn()) === "client", "a new email gets a client account");
  ok(priya.newRole === "client", "a new client email is told it’s setting up a client account");
  r = await priya.req("/api/admin");
  ok(r.status === 403, "a client can’t open the ops dashboard");

  const cr = {};
  cr.ankita = await ankita.joinAsCreator("guwahati", "zoo-road");
  cr.rituraj = await rituraj.joinAsCreator("guwahati", "chandmari");
  cr.dhruba = await dhruba.joinAsCreator("guwahati", "ganeshguri");
  cr.nilakshi = await nilakshi.joinAsCreator("jorhat", "jorhat-town");
  r = await ankita.req("/api/me/creator", { available: true }, "PATCH");
  ok(r.status === 400, "a creator can’t go online before verification");
  r = await ops.req("/api/admin");
  ok(r.data.pendingCreators.length === 4, "ops sees the 4 new creators waiting for review");
  r = await ops.req("/api/admin", { action: "verify", creatorId: cr.ankita, decision: "verified" });
  ok(r.status === 400, "ops must confirm the KYC check before approving");
  for (const [who, id] of Object.entries(cr)) {
    r = await ops.req("/api/admin", { action: "verify", creatorId: id, decision: "verified", kycChecked: true });
    ok(r.ok, `ops approves ${who}`);
  }
  for (const c of [ankita, rituraj, dhruba, nilakshi]) {
    r = await c.req("/api/me/creator", { available: true }, "PATCH");
    ok(r.ok && r.data.available, `${c.name} goes online`);
  }
  ankita.cookie = "";
  ok((await ankita.signIn()) === "creator", "a creator signing in at /login keeps the creator role");
  r = await ankita.req("/api/bookings", { packageId: "quick_reel" });
  ok(r.status === 403, "a creator can’t book shoots");

  // --- Auto-assign shoot in Guwahati ------------------------------------------
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
  ok(b1.dispatch.notified === 3 && b1.dispatch.radiusKm === 10, "the 3 Guwahati creators are alerted within 10 km");
  ok(b1.total === 2950, "total is ₹2,950 incl. GST");

  r = await rituraj.req("/api/offers");
  const ritOffer = r.data.find((o) => o.bookingId === b1.id);
  ok(ritOffer && ritOffer.payout === 2000 && ritOffer.expiresAt - ritOffer.sentAt === 5 * MIN, "Rituraj sees the alert: ₹2,000 payout, 5 min to accept");
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
  ok(r.data.available === 2000, "Ankita’s wallet gets her 80%: ₹2,000");

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
  advance(6);
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
    requestedCreatorId: cr.nilakshi,
  });
  const b3 = r.data;
  ok(b3.dispatch.phase === "direct" && b3.dispatch.notified === 1, "chosen creator gets it first");
  r = await nilakshi.req("/api/offers");
  r = await nilakshi.req(`/api/offers/${r.data[0].id}`, { action: "decline" });
  r = await priya.req(`/api/bookings/${b3.id}`);
  ok(r.data.dispatch.phase === "broadcast", "after decline everyone nearby is alerted");
  advance(6);
  r = await ops.req(`/api/bookings/${b3.id}`, { action: "assign", creatorId: cr.nilakshi });
  ok(r.data.status === "assigned", "ops assigns by hand after the window");

  // --- Campaign from a brand that isn't signed in --------------------------------
  const brand = new Agent("Mitali (brand)", "mitali@kazorganics.test", "9876543210");
  const campaign = {
    brandName: "Kaziranga Organics",
    contactName: "Mitali",
    email: brand.email,
    phone: brand.phone,
    goal: "Product launch",
    regions: ["Assam"],
    budgetRange: "₹3 – 10 lakh",
    callAt: new Date(Date.now() + 30 * 86400_000 + IST).toISOString().slice(0, 11) + "14:30",
    callMode: "video",
  };
  r = await brand.req("/api/campaigns", campaign);
  ok(r.status === 400, "a brand can’t book a call without verifying their email");
  r = await brand.req("/api/campaigns", { ...campaign, code: issueCode(brand.email) });
  ok(r.ok, "brand books a strategy call with an email code");
  const cid = r.data.id;
  r = await brand.req("/api/session");
  ok(r.data.user?.role === "client", "the brand is signed in to a new client account");
  r = await brand.req("/api/campaigns");
  ok(r.data.some((c) => c.id === cid), "the brand can follow their request");

  r = await ops.req(`/api/campaigns/${cid}`, { action: "update", budget: 300000, commissionRate: 0.32 });
  ok(r.data.math.commission === 96000 && r.data.math.creatorPool === 204000, "32% of ₹3 L = ₹96,000 commission");
  r = await ops.req(`/api/campaigns/${cid}`, { action: "update", stage: "booking_creators" });
  ok(r.status === 400, "can’t start booking creators before the advance");
  await ops.req(`/api/campaigns/${cid}`, { action: "update", advancePaid: true });
  r = await ops.req(`/api/campaigns/${cid}`, { action: "update", stage: "booking_creators" });
  ok(r.data.stage === "booking_creators", "stage moves after advance");
  r = await ops.req(`/api/campaigns/${cid}`, { action: "invite", creatorId: cr.ankita, deliverables: "1 reel + 2 stories", fee: 20000 });
  ok(r.ok, "ops invites Ankita at ₹20,000");
  r = await ankita.req(`/api/campaigns/${cid}`, { action: "respond", accept: true });
  ok(r.ok, "Ankita accepts the invite");
  await ops.req(`/api/campaigns/${cid}`, { action: "update", stage: "report_settle", balancePaid: true });
  r = await ops.req(`/api/campaigns/${cid}`, { action: "settle" });
  ok(r.data.stage === "closed", "campaign settled and closed");
  r = await ankita.req("/api/wallet");
  ok(r.data.available === 22000, "Ankita’s campaign fee is in her wallet");

  // --- Payouts -----------------------------------------------------------------
  r = await ankita.req("/api/wallet", { amount: 5000, instant: false });
  ok(r.ok && r.data.status === "processing", "Ankita requests a Friday payout");
  r = await ops.req("/api/admin", { action: "payout_run" });
  ok(r.data.count === 1 && r.data.total === 5000, "ops runs the payout");

  // --- Pages render ------------------------------------------------------------
  for (const p of ["/", "/login", "/creators", `/creators/${cr.ankita}`, "/book", "/bookings", `/bookings/${b1.id}`, "/brands", "/join", "/creator", `/creator/jobs/${b1.id}`, "/creator/wallet", "/creator/campaigns", "/ops", "/ops/campaigns", "/ops/creators"]) {
    const res = await fetch(BASE + p);
    ok(res.status === 200, `page ${p} renders`);
  }
}

let failed = false;
try {
  await run();
  console.log(`\nAll ${passed} checks passed.`);
} catch (e) {
  failed = true;
  console.error(`\n✗ ${e.message}`);
  if (serverLog.trim()) console.error(`\nServer output:\n${serverLog.trim().split("\n").slice(-30).join("\n")}`);
} finally {
  server?.kill();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
