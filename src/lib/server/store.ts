// Storage. Every request loads the whole marketplace, applies time-based rules, runs the
// change and saves, one request at a time so two creators can't both win the same job.
//
// - With DATABASE_URL or POSTGRES_URL (set by the Vercel ↔ Supabase integration): Postgres, one
//   table per kind of record (see ./pg.ts), locked for the length of each request, so it is safe
//   across many server copies.
// - Otherwise: a JSON file (local development, tests). Needs one server with a persistent disk.
//
// The domain code in src/lib/domain doesn't care which one is used.
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { ensureSchema as pgEnsureSchema, load as pgLoad, save as pgSave } from "./pg";
import type { DB } from "@/lib/domain/types";
import { tickAll } from "@/lib/domain/views";
import { DomainError } from "@/lib/domain/util";
import { sendOpsAlerts } from "./alerts";
import { after } from "next/server";
import { deadEndpoints, dropDeadSubs, sendPushes, takePushes, type Push } from "./push";

/** First run: an empty marketplace. */
function initialDb(): DB {
  return { version: 1, seq: 1000, users: [], creators: [], bookings: [], offers: [], ledger: [], campaigns: [], otps: [], notifications: [] };
}

interface Side {
  /** Ops alerts raised by the tick. */
  alerts: string[][];
  /** Phone notifications waiting to go out. */
  pushes: Push[];
}

type Outcome<T> = ({ ok: true; result: T; now: number } | { ok: false; error: unknown }) & Side;

/** Ticks, runs `fn` and saves. A failed change is dropped, but the tick's changes are kept. */
async function runAndSave<T>(db: DB, save: (db: DB) => Promise<void> | void, fn: (db: DB, now: number) => T | Promise<T>): Promise<Outcome<T>> {
  const now = Date.now();
  // Ops alerts that fell due while ticking. They're sent after the database is unlocked, never during.
  const alerts = tickAll(db, now);
  const ticked = JSON.stringify(db);
  try {
    const result = await fn(db, now);
    dropDeadSubs(db, deadEndpoints());
    // Taken from the data about to be saved, so each message is pushed exactly once.
    const pushes = takePushes(db, now);
    await save(db);
    return { ok: true, result, now, alerts, pushes };
  } catch (error) {
    // Some errors (like a wrong sign-in code) must still record what happened.
    const keep = error instanceof DomainError && error.keepChanges ? db : (JSON.parse(ticked) as DB);
    const pushes = takePushes(keep, now);
    await save(keep);
    return { ok: false, error, alerts, pushes };
  }
}

// ── Postgres ──────────────────────────────────────────────────────────────────

// The Vercel ↔ Supabase integration can add a prefix to its variables; this project uses STORAGE_.
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.STORAGE_POSTGRES_URL;
let sql: postgres.Sql | undefined;
let ready: Promise<void> | undefined;

function client() {
  if (!sql) {
    // Build the connection from the URL's parts: providers add query options (like Supabase's
    // `supa=`) that the server would reject as unknown startup parameters.
    const u = new URL(DATABASE_URL!);
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    sql = postgres({
      host: u.hostname,
      port: Number(u.port || 5432),
      database: decodeURIComponent(u.pathname.slice(1)) || "postgres",
      username: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      ssl: local ? false : "require",
      // Supabase's pooler runs in transaction mode, which has no named prepared statements.
      prepare: false,
      // Serverless: few connections per copy, let idle ones go.
      max: 3,
      idle_timeout: 20,
      onnotice: false,
    });
  }
  return sql;
}

/**
 * The Postgres connection, or null when this server is running on the JSON file instead. Only the
 * document store (./uploads.ts) uses it: everything else goes through `withDb`, which also locks.
 */
export function storeSql() {
  return DATABASE_URL ? client() : null;
}

function ensureSchema() {
  ready ??= pgEnsureSchema(client(), initialDb).catch((e) => {
    ready = undefined;
    throw e;
  });
  return ready;
}

async function withPostgres<T>(fn: (db: DB, now: number) => T | Promise<T>): Promise<Outcome<T>> {
  await ensureSchema();
  return client().begin(async (tx) => {
    // Postgres waits for a lock forever by default, so one stuck transaction could hold a page
    // open until the function itself timed out minutes later. Better to fail and say so than to
    // leave somebody looking at a blank tab — nothing here waits 20 seconds honestly.
    //
    // Set here rather than on the connection: a startup parameter has to get past the provider's
    // pooler, which is the same trap `client()` above already works around.
    await tx`set local lock_timeout = 20000`;
    // Locks srijan.meta: every other request waits until this one commits.
    const { db, snapshot, meta } = await pgLoad(tx);
    return runAndSave(db, (next) => pgSave(tx, snapshot, next, meta), fn);
  }) as Promise<Outcome<T>>;
}

/**
 * A read, without the lock every other request waits for.
 *
 * `withPostgres` locks `srijan.meta` for the length of the transaction, which is right for a
 * change and ruinous for a read: the public directory, a profile, an avatar and the screens that
 * poll every few seconds were all queueing behind one another and behind every booking, each one
 * also rewriting whatever the tick had touched. One slow transaction and the queue behind it is
 * everyone's page load.
 *
 * So: load without the lock, tick in memory, run `fn`. In the ordinary case nothing changed and
 * there is nothing to write, so the read never blocks and never blocks anybody else. If the tick
 * did fall due — an offer that has just expired, a booking that has timed out — the whole thing is
 * run again through `withPostgres`, which takes the lock and saves properly. That keeps the tick
 * running on reads, which this project depends on for want of a cron job, without making every
 * read pay for the possibility.
 *
 * `fn` must therefore be safe to run twice and must not change `db`. A GET handler that does
 * change something is still correct — the change is simply made by the second, locked run.
 */
async function readPostgres<T>(fn: (db: DB, now: number) => T | Promise<T>): Promise<Outcome<T>> {
  await ensureSchema();
  // `read only` is enforced by Postgres, so a stray write in here fails rather than quietly
  // escaping the lock. The cast is the driver's: `begin` widens whatever the callback returns.
  const { db } = (await client().begin("read only", (tx) => pgLoad(tx, false))) as unknown as { db: DB };
  const now = Date.now();
  const before = JSON.stringify(db);
  const alerts = tickAll(db, now);
  const result = await fn(db, now);
  if (!alerts.length && JSON.stringify(db) === before) return { ok: true, result, now, alerts: [], pushes: [] };
  return withPostgres(fn);
}

// ── JSON file ─────────────────────────────────────────────────────────────────

const DATA_FILE = process.env.SRIJAN_DATA_FILE || path.join(process.cwd(), ".data", "db.json");

function loadFile(): DB {
  let raw: string;
  try {
    raw = fs.readFileSync(/*turbopackIgnore: true*/ DATA_FILE, "utf8");
  } catch (e) {
    // Only a missing file means "first run". Any other error must not wipe existing data.
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    const db = initialDb();
    saveFile(db);
    return db;
  }
  return JSON.parse(raw) as DB;
}

function saveFile(db: DB) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DATA_FILE);
}

let queue: Promise<unknown> = Promise.resolve();

function withFile<T>(fn: (db: DB, now: number) => T | Promise<T>): Promise<Outcome<T>> {
  const run = queue.then(() => runAndSave(loadFile(), saveFile, fn));
  queue = run.catch(() => undefined);
  return run;
}

// ──────────────────────────────────────────────────────────────────────────────

/** Phones are buzzed after the reply, so a slow push service never delays anyone. */
function sendInBackground(pushes: Push[]) {
  if (!pushes.length) return;
  try {
    after(() => sendPushes(pushes));
  } catch {
    void sendPushes(pushes).catch((e) => console.error("Push failed", e));
  }
}

/**
 * Reads without queueing: for a page render or a GET that only looks at data. See `readPostgres`.
 *
 * The JSON-file path is unchanged — it is one process on one disk, where a read costs nothing and
 * there is no lock to avoid.
 */
export async function readDb<T>(fn: (db: DB, now: number) => T | Promise<T>): Promise<{ result: T; now: number }> {
  const out = await (DATABASE_URL ? readPostgres(fn) : withFile(fn));
  sendOpsAlerts(out.alerts);
  sendInBackground(out.pushes);
  if (!out.ok) throw out.error;
  return { result: out.result, now: out.now };
}

export async function withDb<T>(fn: (db: DB, now: number) => T | Promise<T>): Promise<{ result: T; now: number }> {
  const out = await (DATABASE_URL ? withPostgres(fn) : withFile(fn));
  // Sent even when `fn` failed: the tick that raised them was saved either way, and each one is
  // marked as sent in the database, so a dropped alert is never raised again.
  sendOpsAlerts(out.alerts);
  sendInBackground(out.pushes);
  if (!out.ok) throw out.error;
  return { result: out.result, now: out.now };
}
