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

/** First run: an empty marketplace. */
function initialDb(): DB {
  return { version: 1, seq: 1000, users: [], creators: [], bookings: [], offers: [], ledger: [], campaigns: [], otps: [] };
}

type Outcome<T> = { ok: true; result: T; now: number } | { ok: false; error: unknown };

/** Ticks, runs `fn` and saves. A failed change is dropped, but the tick's changes are kept. */
async function runAndSave<T>(db: DB, save: (db: DB) => Promise<void> | void, fn: (db: DB, now: number) => T | Promise<T>): Promise<Outcome<T>> {
  const now = Date.now();
  tickAll(db, now);
  const ticked = JSON.stringify(db);
  try {
    const result = await fn(db, now);
    await save(db);
    return { ok: true, result, now };
  } catch (error) {
    // Some errors (like a wrong sign-in code) must still record what happened.
    await save(error instanceof DomainError && error.keepChanges ? db : (JSON.parse(ticked) as DB));
    return { ok: false, error };
  }
}

// ── Postgres ──────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
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
    // Locks srijan.meta: every other request waits until this one commits.
    const { db, snapshot, meta } = await pgLoad(tx);
    return runAndSave(db, (next) => pgSave(tx, snapshot, next, meta), fn);
  }) as Promise<Outcome<T>>;
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

export async function withDb<T>(fn: (db: DB, now: number) => T | Promise<T>): Promise<{ result: T; now: number }> {
  const out = await (DATABASE_URL ? withPostgres(fn) : withFile(fn));
  if (!out.ok) throw out.error;
  return { result: out.result, now: out.now };
}
