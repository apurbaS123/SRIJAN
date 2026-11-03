// End-to-end check of the main flows against a real production server.
// Usage: npm run smoke   (builds, then runs this script)
//        node scripts/smoke.mjs   (uses the existing build in .next)
//
// The script starts its own `next start` on a free port with a throwaway data file, a test
// session secret, and email and WhatsApp switched off, so it never touches your real data or
// sends messages. Razorpay is a small fake server started by this script, so no real money moves.
// It signs everyone in through the real email-code flow. Two things it does from
// outside, by editing the throwaway store between requests (the server reads it on every request):
//   - puts a known sign-in code in place of the email
//   - moves every stored time back to fast-forward the 5-minute dispatch timers
//
// To test the Postgres store instead of the JSON file, point it at a throwaway local database:
//   SMOKE_DATABASE_URL=postgres://postgres:pw@localhost:5432/postgres npm run smoke
// It wipes the `srijan` schema there first, so it only accepts localhost / 127.0.0.1.

import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import postgres from "postgres";

const ROOT = path.resolve(import.meta.dirname, "..");
const SECRET = "smoke-test-session-secret-0123456789abcdef";
const OPS_EMAIL = "team@srijan.test";
const IST = 5.5 * 3600_000;
const MIN = 60_000;
const RZP_SECRET = "smoke-razorpay-key-secret";
const RZP_WEBHOOK_SECRET = "smoke-razorpay-webhook-secret";
const DRIVE_URL = "https://drive.google.com/drive/folders/smoke";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "srijan-smoke-"));
const DATA_FILE = path.join(tmpDir, "db.json");
const SMOKE_DB = process.env.SMOKE_DATABASE_URL || "";
let sql;
let server;
let serverLog = "";
let BASE = "";
let passed = 0;

function ok(cond, msg) {
  if (!cond) throw new Error(msg);
  passed++;
  console.log(`✓ ${msg}`);
}

// ── Fake Razorpay ─────────────────────────────────────────────────────────────

const rzp = { orders: new Map(), payments: new Map(), seq: 0, server: null, base: "" };

function startFakeRazorpay() {
  return new Promise((resolve) => {
    rzp.server = http.createServer(async (req, res) => {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const body = raw ? JSON.parse(raw) : {};
      const reply = (status, data) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      };
      const fail = (status, description) => reply(status, { error: { description } });
      if (req.headers.authorization !== `Basic ${Buffer.from(`rzp_test_smoke:${RZP_SECRET}`).toString("base64")}`) return fail(401, "Bad key");
      if (rzp.down) return fail(502, "Razorpay is having trouble");
      const path = req.url.replace(/^\/v1/, "");
      if (req.method === "POST" && path === "/orders") {
        const order = { id: `order_${++rzp.seq}`, amount: body.amount, currency: body.currency, receipt: body.receipt };
        rzp.orders.set(order.id, order);
        return reply(200, order);
      }
      const m = path.match(/^\/payments\/([^/]+)(?:\/(capture))?$/);
      const p = m && rzp.payments.get(m[1]);
      if (!p) return fail(404, "Not found");
      if (req.method === "GET" && !m[2]) return reply(200, p);
      if (req.method === "POST" && m[2] === "capture") {
        if (p.status !== "authorized") return fail(400, "This payment has already been captured");
        p.status = "captured";
        return reply(200, p);
      }
      fail(404, "Not found");
    });
    rzp.server.listen(0, "127.0.0.1", () => {
      rzp.base = `http://127.0.0.1:${rzp.server.address().port}`;
      resolve();
    });
  });
}

/** What the customer does on Razorpay's form: the money is authorized against the order. */
function customerPays(orderId) {
  const order = rzp.orders.get(orderId);
  const id = `pay_${++rzp.seq}`;
  rzp.payments.set(id, { id, order_id: orderId, amount: order.amount, amount_refunded: 0, status: "authorized" });
  return { id, signature: createHmac("sha256", RZP_SECRET).update(`${orderId}|${id}`).digest("hex") };
}

async function sendWebhook(event, payload, secret = RZP_WEBHOOK_SECRET) {
  const raw = JSON.stringify({ event, payload });
  const res = await fetch(`${BASE}/api/payments/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Razorpay-Signature": createHmac("sha256", secret).update(raw).digest("hex") },
    body: raw,
  });
  return res.status;
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
      // Never use a real database, even if one is configured: only the throwaway one, if given.
      DATABASE_URL: SMOKE_DB,
      POSTGRES_URL: "",
      SRIJAN_OPS_EMAILS: OPS_EMAIL,
      // Empty values win over .env.local, so no email or WhatsApp message is ever sent.
      BREVO_API_KEY: "",
      EMAIL_FROM: "",
      WHATSAPP_TOKEN: "",
      WHATSAPP_PHONE_NUMBER_ID: "",
      WHATSAPP_NOTIFY_TO: "",
      WHATSAPP_TEMPLATE: "",
      RAZORPAY_KEY_ID: "rzp_test_smoke",
      RAZORPAY_KEY_SECRET: RZP_SECRET,
      RAZORPAY_WEBHOOK_SECRET: RZP_WEBHOOK_SECRET,
      RAZORPAY_API_BASE: rzp.base,
      SRIJAN_PROOF_DRIVE_URL: DRIVE_URL,
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

// ── Throwaway store (JSON file, or the local test database) ─────────────────

const PG_TABLES = ["users", "creators", "bookings", "offers", "ledger", "campaigns", "sign_in_codes", "notifications"];

async function connectTestDb() {
  if (!SMOKE_DB) return;
  const u = new URL(SMOKE_DB);
  if (!["localhost", "127.0.0.1"].includes(u.hostname)) {
    throw new Error("SMOKE_DATABASE_URL must be a local throwaway database (localhost): the smoke test wipes it");
  }
  sql = postgres(SMOKE_DB, { ssl: false, onnotice: false, max: 1 });
  await sql`drop schema if exists srijan cascade`;
}

const readDb = () => JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
function writeDb(db) {
  const tmp = `${DATA_FILE}.smoke.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DATA_FILE);
}

// Latest code per email: the name step re-sends the code the first step checked but didn't use up.
const codes = new Map();

/** Stores a sign-in code for `email` exactly as the server would after emailing it. */
async function issueCode(email, code = String(100000 + Math.floor(Math.random() * 900000))) {
  const now = Date.now();
  const codeHash = createHmac("sha256", SECRET).update(`otp:${email}:${code}`).digest("hex");
  const otp = { email, codeHash, sentAt: now, expiresAt: now + 10 * MIN, attempts: 0 };
  if (sql) {
    await sql`delete from srijan.sign_in_codes where email = ${email}`;
    await sql`insert into srijan.sign_in_codes (id, data) values (${codeHash}, ${JSON.stringify(otp)}::text::jsonb)`;
  } else {
    const db = readDb();
    db.otps = [...(db.otps ?? []).filter((o) => o.email !== email), otp];
    writeDb(db);
  }
  codes.set(email, code);
  return code;
}

/** Fast-forwards the marketplace by moving every stored timestamp into the past. */
async function advance(minutes) {
  const shift = (v) => {
    if (typeof v === "number" && v > 1e12 && v < 1e13) return v - minutes * MIN;
    if (Array.isArray(v)) return v.map(shift);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shift(x)]));
    return v;
  };
  if (!sql) return writeDb(shift(readDb()));
  for (const t of PG_TABLES) {
    for (const row of await sql.unsafe(`select id, data from srijan.${t}`)) {
      const data = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
      await sql.unsafe(`update srijan.${t} set data = $1::text::jsonb where id = $2`, [JSON.stringify(shift(data)), row.id]);
    }
  }
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
    let r = await this.req("/api/session", { email: this.email, code: await issueCode(this.email) });
    this.newRole = r.data?.newRole;
    if (r.data?.needsName) r = await this.req("/api/session", { email: this.email, code: codes.get(this.email), name: this.name, phone: this.phone });
    ok(r.ok, `${this.name} signs in with an email code`);
    return r.data.role;
  }
  /** Signs up at /join with an email code. Returns the new creator's id. */
  async joinAsCreator(cityId, zoneId, services = [{ key: "videography" }]) {
    const r = await this.req("/api/creators", {
      code: await issueCode(this.email),
      email: this.email,
      name: this.name,
      phone: this.phone,
      cityId,
      zoneId,
      services,
      onDemand: true,
      maxTravelKm: 10,
    });
    ok(r.ok, `${this.name} joins as a creator in ${zoneId}`);
    return r.data.creatorId;
  }
  /** Creates the booking and pays for it the way the /book page does. Returns the paid booking. */
  async bookAndPay(input) {
    const made = await this.req("/api/bookings", input);
    if (!made.ok) return made;
    const { id, signature } = customerPays(made.data.checkout.orderId);
    const r = await this.req("/api/payments/verify", { bookingId: made.data.booking.id, razorpay_payment_id: id, razorpay_signature: signature });
    if (!r.ok) return r;
    return this.req(`/api/bookings/${made.data.booking.id}`);
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
  await connectTestDb();
  await startFakeRazorpay();
  await startServer();
  console.log(`Server running at ${BASE} with ${sql ? "the local test database (Postgres)" : "a throwaway data file"}\n`);

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
  await issueCode(priya.email, "111111");
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
  cr.rituraj = await rituraj.joinAsCreator("guwahati", "chandmari", [{ key: "videography" }, { key: "video_editing" }]);
  cr.dhruba = await dhruba.joinAsCreator("guwahati", "ganeshguri");
  cr.nilakshi = await nilakshi.joinAsCreator("jorhat", "jorhat-town", [{ key: "videography" }, { key: "video_editing" }]);
  r = await ankita.req("/api/me/creator", { available: true }, "PATCH");
  ok(r.status === 400, "a creator can’t go online before verification");
  r = await ankita.req("/api/session");
  ok(r.data.creator.payout === null, "a new creator has no bank or UPI linked yet");
  r = await ankita.req("/api/me/creator", { payout: { method: "upi", upiId: "not-a-upi" } }, "PATCH");
  ok(r.status === 400, "a badly formed UPI ID is refused");
  r = await ankita.req("/api/me/creator", { payout: { method: "upi", upiId: "ankita@ybl" } }, "PATCH");
  ok(r.ok && r.data.payout.upiId === "ankita@ybl", "Ankita links her UPI ID on the page after sign-up");
  r = await dhruba.req("/api/me/creator", { payout: { method: "bank", accountName: "Dhruba Kalita", accountNumber: "123456789012", ifsc: "SBIN0001234" } }, "PATCH");
  ok(r.ok && r.data.payout.accountLast4 === "9012" && !JSON.stringify(r.data).includes("123456789012"), "Dhruba links a bank account and only sees its last 4 digits back");
  r = await nilakshi.req("/api/me/creator", { payout: { method: "upi", upiId: "nilakshi@ybl" } }, "PATCH");
  ok(r.ok, "Nilakshi links her UPI ID");
  r = await ops.req("/api/admin");
  ok(r.data.pendingCreators.length === 4, "ops sees the 4 new creators waiting for review");
  r = await ops.req("/api/admin", { action: "verify", creatorId: cr.ankita, decision: "verified" });
  ok(r.status === 400, "ops must confirm the KYC check before approving");
  for (const [who, id] of Object.entries(cr)) {
    r = await ops.req("/api/admin", { action: "verify", creatorId: id, decision: "verified", kycChecked: true });
    ok(r.ok, `ops approves ${who}`);
  }
  r = await rituraj.req("/api/me/creator", { available: true }, "PATCH");
  ok(r.status === 400 && /bank account or UPI/.test(r.error), "a verified creator can’t go online until they link a bank or UPI");
  r = await rituraj.req("/api/me/creator", { payout: { method: "upi", upiId: "rituraj@ybl" } }, "PATCH");
  ok(r.ok, "Rituraj links his UPI ID");
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
  const shootInput = {
    packageId: "quick_reel",
    cityId: "guwahati",
    zoneId: "zoo-road",
    address: "Café Brahma, RG Baruah Road",
    scheduledAt,
    brief: "Opening-week reel for our café, warm look",
  };
  r = await priya.req("/api/bookings", shootInput);
  ok(r.ok && r.data.booking.status === "awaiting_payment" && r.data.checkout.amount === 250000, "booking waits for a ₹2,500 payment, with no GST added");
  const unpaid = r.data;
  ok(unpaid.booking.dispatch.notified === 0, "nobody is alerted before the client pays");
  r = await priya.req("/api/bookings");
  ok(!r.data.some((b) => b.id === unpaid.booking.id), "an unpaid booking stays out of the client’s list");
  let fakePay = customerPays(unpaid.checkout.orderId);
  r = await priya.req("/api/payments/verify", { bookingId: unpaid.booking.id, razorpay_payment_id: fakePay.id, razorpay_signature: "forged" });
  ok(r.status === 400, "a forged payment signature is refused");
  r = await priya.req(`/api/bookings/${unpaid.booking.id}`);
  ok(r.data.status === "awaiting_payment", "a forged payment doesn’t start the job");
  r = await rituraj.req("/api/payments/verify", { bookingId: unpaid.booking.id, razorpay_payment_id: fakePay.id, razorpay_signature: fakePay.signature });
  ok(r.status === 403, "nobody else can confirm someone’s payment");
  r = await priya.req("/api/payments/verify", { bookingId: unpaid.booking.id, razorpay_payment_id: fakePay.id, razorpay_signature: fakePay.signature });
  ok(r.ok && r.data.outcome === "paid", "a real payment is verified");
  ok(rzp.payments.get(fakePay.id).status === "captured", "the authorized payment is captured");
  r = await priya.req("/api/payments/verify", { bookingId: unpaid.booking.id, razorpay_payment_id: fakePay.id, razorpay_signature: fakePay.signature });
  ok(r.ok && r.data.outcome === "already", "confirming the same payment twice changes nothing");
  r = await priya.req(`/api/bookings/${unpaid.booking.id}`);
  ok(r.ok && r.data.status === "searching", `booking paid for ${scheduledAt} IST and searching`);
  const b1 = r.data;
  ok(b1.dispatch.notified === 3 && b1.dispatch.radiusKm === 10, "the 3 Guwahati creators are alerted within 10 km");
  ok(b1.total === 2500, "the client paid exactly ₹2,500");

  r = await rituraj.req("/api/notifications");
  const alertNote = r.data.find((n) => n.lines.join(" ").includes("Opening-week reel"));
  ok(alertNote && /Quick Reel/.test(alertNote.lines[0]) && /Zoo Road/.test(alertNote.lines[1]) && !alertNote.lines.join(" ").includes("RG Baruah"), "the demo notification gives the job, area, time and brief, not the address");
  r = await nilakshi.req("/api/notifications");
  ok(r.data.length === 0, "a creator far away gets no notification");

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

  r = await rituraj.req("/api/notifications");
  ok(!r.data.some((n) => n.id === alertNote.id), "the alert disappears for creators who lost the job");

  r = await priya.req(`/api/bookings/${b1.id}`);
  ok(r.data.status === "assigned" && r.data.creatorPhone === "+91 9864011111", "client sees the creator’s phone number");
  r = await ankita.req(`/api/bookings/${b1.id}`);
  ok(r.data.address.includes("Café Brahma") && r.data.clientPhone === "+91 9854012345", "creator sees the address and the client’s number");
  ok(r.data.proofUploadUrl === DRIVE_URL, "creator gets the Drive link for proof of work");
  r = await rituraj.req(`/api/bookings/${b1.id}`);
  ok(r.status === 404, "another creator can’t open the job");

  r = await ankita.req(`/api/bookings/${b1.id}`, { action: "finish" });
  ok(r.status === 400 && /start time/.test(r.error), "an on-site job can’t be marked finished before it starts");
  r = await priya.req(`/api/bookings/${b1.id}`, { action: "approve" });
  ok(r.status === 400, "the client can’t approve before the creator finishes");
  await advance(28 * 60);
  r = await ankita.req(`/api/bookings/${b1.id}`, { action: "finish" });
  ok(r.ok && r.data.status === "delivered", "Ankita presses Mark As Finished");
  r = await priya.req("/api/notifications");
  ok(r.data.some((n) => n.title === "Your job is finished"), "the client is notified to approve");
  r = await ops.req("/api/admin");
  ok(r.data.payoutsDue.length === 0, "nothing is owed before the client approves");
  r = await priya.req(`/api/bookings/${b1.id}`, { action: "approve" });
  ok(r.data.status === "completed" && !r.data.rating, "client presses Mark As Approved without having to review");
  r = await priya.req(`/api/bookings/${b1.id}`, { action: "review", rating: 6 });
  ok(r.status === 400, "a 6-star review is refused");
  r = await ankita.req(`/api/bookings/${b1.id}`, { action: "review", rating: 5 });
  ok(r.ok && r.data.reviewOfClient?.rating === 5 && !r.data.reviewOfClient.text, "creator rates the client 5 ★ with no text");
  r = await priya.req(`/api/bookings/${b1.id}`, { action: "review", rating: 4, text: "Lovely reel, a little late" });
  ok(r.ok && r.data.rating === 4 && r.data.review === "Lovely reel, a little late", "client rates the creator 4 ★ with text");
  r = await priya.req(`/api/bookings/${b1.id}`, { action: "review", rating: 1 });
  ok(r.status === 400, "a second review of the same booking is refused");
  r = await ankita.req(`/api/bookings/${b1.id}`);
  ok(r.data.clientRating?.rating === 5 && r.data.clientRating.count === 1, "creator sees the client’s rating");
  r = await priya.req(`/api/bookings/${b1.id}`);
  ok(r.data.clientRating === undefined, "client doesn’t get their own rating summary");
  r = await ops.req("/api/admin");
  ok(r.data.payoutsDue.length === 1 && r.data.payoutsDue[0].amount === 2000 && r.data.payoutsDue[0].upiId === "ankita@ybl", "ops is told to pay Ankita her 80%: ₹2,000, with her UPI ID");
  const shootPayout = r.data.payoutsDue[0].id;
  r = await ankita.req(`/api/bookings/${b1.id}`);
  ok(r.data.payoutStatus === "owed", "Ankita sees that payment is on its way");
  r = await ankita.req("/api/admin", { action: "mark_paid", payoutId: shootPayout });
  ok(r.status === 403, "a creator can’t mark their own payout as paid");
  r = await ops.req("/api/admin", { action: "mark_paid", payoutId: shootPayout, reference: "UTR-1" });
  ok(r.ok && r.data.status === "paid", "ops pays by hand and marks it paid");
  r = await ops.req("/api/admin", { action: "mark_paid", payoutId: shootPayout });
  ok(r.status === 409, "the same payout can’t be marked paid twice");
  r = await ankita.req(`/api/bookings/${b1.id}`);
  ok(r.data.payoutStatus === "paid", "Ankita sees the payment was sent");

  // --- Webhook: the client closes the page right after paying -------------------
  r = await priya.req("/api/session");
  r = await priya.req("/api/bookings", { ...shootInput, scheduledAt: slotFrom(r.serverNow), brief: "Reel paid for and confirmed by webhook" });
  const viaHook = r.data;
  fakePay = customerPays(viaHook.checkout.orderId);
  const hookPayload = { payment: { entity: { id: fakePay.id, order_id: viaHook.checkout.orderId } } };
  ok((await sendWebhook("payment.authorized", hookPayload, "wrong-secret")) === 400, "a webhook with a bad signature is refused");
  r = await priya.req(`/api/bookings/${viaHook.booking.id}`);
  ok(r.data.status === "awaiting_payment", "a forged webhook doesn’t start the job");
  ok((await sendWebhook("payment.authorized", hookPayload)) === 200, "Razorpay’s webhook is accepted");
  ok((await sendWebhook("payment.captured", hookPayload)) === 200 && (await sendWebhook("order.paid", hookPayload)) === 200, "repeat webhook events are accepted");
  r = await priya.req(`/api/bookings/${viaHook.booking.id}`);
  ok(r.data.status === "searching" && r.data.events.filter((e) => e.text.startsWith("Paid")).length === 1, "the webhook alone confirms the booking, once");
  r = await priya.req(`/api/bookings/${viaHook.booking.id}`, { action: "cancel" });
  ok(r.data.status === "cancelled" && r.data.refund?.status === "pending" && r.data.refund.amount === 2500, "cancelling leaves the full ₹2,500 waiting to be refunded");
  const dueAfterCancel = (await ops.req("/api/admin")).data.refundsDue.find((x) => x.paymentId === fakePay.id);
  ok(dueAfterCancel?.amount === 2500, "ops is told to refund it, with the Razorpay payment ID");
  const markSent = () => ops.req("/api/admin", { action: "mark_refund_sent", bookingId: dueAfterCancel.id, reference: "rfnd_manual_1" });
  r = await markSent();
  ok(r.status === 409, "a refund can’t be marked as sent before it’s made in Razorpay");
  rzp.payments.get(fakePay.id).amount_refunded = 200000;
  r = await markSent();
  ok(r.status === 409 && r.error.includes("₹2,000 of ₹2,500"), "a partial refund is refused and says what’s missing");
  rzp.payments.get(fakePay.id).amount_refunded = 250000;
  rzp.down = true;
  r = await markSent();
  rzp.down = false;
  ok(r.status === 502, "if Razorpay can’t be reached, the refund isn’t marked as sent");
  r = await priya.req(`/api/bookings/${dueAfterCancel.id}`);
  ok(r.data.refund?.status === "pending", "the client still sees the refund as waiting");
  r = await markSent();
  ok(r.ok, "once Razorpay shows the full amount, ops can mark it as sent");
  r = await ops.req("/api/admin");
  ok(!r.data.refundsDue.some((x) => x.paymentId === fakePay.id), "a sent refund leaves the list");

  // --- Online job: video editing ------------------------------------------------
  r = await priya.req("/api/session");
  r = await priya.bookAndPay({ packageId: "video_edit", scheduledAt: slotFrom(r.serverNow), brief: "Edit my café clips into a 30 second reel" });
  ok(r.ok && r.data.online && r.data.area === "Online" && r.data.total === 1500, "an online job needs no address");
  const online = r.data;
  ok(online.dispatch.notified === 2, "only the 2 video editors are alerted, wherever they live");
  r = await ankita.req("/api/offers");
  ok(!r.data.some((o) => o.bookingId === online.id), "a creator in another field isn’t alerted");
  r = await nilakshi.req("/api/offers");
  const onlineOffer = r.data.find((o) => o.bookingId === online.id);
  ok(onlineOffer && onlineOffer.online, "an editor in Jorhat gets the online job");
  ok(onlineOffer.clientPhone === undefined, "the alert doesn’t show the client’s number");
  r = await nilakshi.req(`/api/offers/${onlineOffer.id}`, { action: "accept" });
  ok(r.ok, "Nilakshi accepts the online job");
  r = await nilakshi.req(`/api/bookings/${online.id}`);
  ok(r.data.clientPhone === "+91 9854012345", "after accepting, the editor sees the client’s number");
  r = await priya.req(`/api/bookings/${online.id}`);
  ok(r.data.clientPhone === "+91 9854012345" && r.data.creatorPhone === "+91 9864044444" && r.data.brief.includes("café clips"), "the client’s approval page shows both numbers and the job details");
  r = await nilakshi.req(`/api/bookings/${online.id}`, { action: "finish" });
  ok(r.ok && r.data.status === "delivered", "an online job can be marked finished at any time");
  r = await priya.req(`/api/bookings/${online.id}`, { action: "report", note: "The edit was never sent to me" });
  ok(r.ok && r.data.status === "disputed", "the client reports a problem");
  r = await priya.req(`/api/bookings/${online.id}`, { action: "approve" });
  ok(r.status === 400, "a reported job can’t be approved by accident");
  r = await ops.req("/api/admin");
  ok(r.data.payoutsDue.length === 0, "a reported job owes nothing yet");
  r = await priya.req(`/api/bookings/${online.id}`, { action: "release" });
  ok(r.status === 403, "only ops can release a reported job");
  r = await ops.req(`/api/bookings/${online.id}`, { action: "release" });
  ok(r.ok && r.data.status === "completed", "ops sides with the creator");
  r = await ops.req("/api/admin");
  ok(r.data.payoutsDue.length === 1 && r.data.payoutsDue[0].amount === 1200, "ops is told to pay the editor 80% of ₹1,500");
  r = await ops.req("/api/admin", { action: "mark_paid", payoutId: r.data.payoutsDue[0].id });
  ok(r.ok, "ops pays the editor");

  // --- No taker → ops ----------------------------------------------------------
  r = await priya.req("/api/session");
  r = await priya.bookAndPay({
    packageId: "event_highlights",
    cityId: "silchar",
    zoneId: "silchar-town",
    address: "Hotel Kanishka, Silchar",
    scheduledAt: slotFrom(r.serverNow),
    brief: "Highlights of our store launch event",
  });
  const b2 = r.data;
  ok(b2.dispatch.notified === 0 && b2.dispatch.widened, "Silchar: nobody nearby, search widened straight away");
  await advance(6);
  r = await priya.req(`/api/bookings/${b2.id}`);
  ok(r.data.status === "needs_ops", "after 5 minutes the booking goes to ops");
  r = await ops.req("/api/admin");
  const row = r.data.dispatch.find((x) => x.id === b2.id);
  ok(row && row.candidates.length > 0, "ops sees candidates to assign by hand");
  r = await ops.req(`/api/bookings/${b2.id}`, { action: "refund", reason: "no creator in Silchar yet" });
  ok(r.data.status === "refunded" && r.data.refund?.status === "pending", "ops refunding a booking leaves the money to be sent");
  r = await ops.req("/api/admin");
  const b2Due = r.data.refundsDue.find((x) => x.id === b2.id);
  ok(b2Due, "ops sees the refund to send");
  rzp.payments.get(b2Due.paymentId).amount_refunded = b2Due.amount * 100;
  r = await priya.req("/api/admin", { action: "mark_refund_sent", bookingId: b2.id });
  ok(r.status === 403, "only ops can mark a refund as sent");
  r = await ops.req("/api/admin", { action: "mark_refund_sent", bookingId: b2.id });
  ok(r.ok, "ops marks it as sent");
  r = await priya.req(`/api/bookings/${b2.id}`);
  ok(r.data.refund?.status === "sent", "the client sees the refund was sent");
  r = await ops.req("/api/admin", { action: "mark_refund_sent", bookingId: b2.id });
  ok(r.status === 409, "a sent refund can’t be marked twice");

  // --- Client picks a creator who declines -------------------------------------
  r = await priya.req("/api/session");
  r = await priya.bookAndPay({
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
  r = await nilakshi.req(`/api/offers/${r.data.find((o) => o.bookingId === b3.id).id}`, { action: "decline" });
  r = await priya.req(`/api/bookings/${b3.id}`);
  ok(r.data.dispatch.phase === "broadcast", "after decline everyone nearby is alerted");
  await advance(6);
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
  r = await brand.req("/api/campaigns", { ...campaign, code: await issueCode(brand.email) });
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
  r = await ops.req("/api/admin");
  ok(r.data.payoutsDue.length === 1 && r.data.payoutsDue[0].amount === 20000, "ops is told to pay Ankita her ₹20,000 campaign fee");
  r = await brand.req("/api/campaigns");
  const done = r.data.find((c) => c.id === cid);
  ok(done?.stage === "closed" && done.budget === 300000 && done.settledAt, "the brand sees the finished campaign and its budget");
  ok(done.creators.length === 1 && done.creators[0].name && done.creators[0].fee === undefined, "the brand sees who worked on it, but not their fee");
  ok(done.math === undefined && done.commissionRate === undefined, "the brand doesn’t see Srijan’s commission");

  r = await ankita.req("/api/wallet");
  ok(r.status === 404 || r.status === 405, "the wallet is gone");

  // --- Pages render ------------------------------------------------------------
  for (const p of ["/", "/login", "/creators", `/creators/${cr.ankita}`, "/book", "/bookings", `/bookings/${b1.id}`, "/campaigns", "/brands", "/join", "/creator", `/creator/jobs/${b1.id}`, "/creator/payout", "/creator/campaigns", "/ops", "/ops/campaigns", "/ops/creators"]) {
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
  rzp.server?.close();
  await sql?.end({ timeout: 5 });
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
