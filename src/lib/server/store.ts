// Prototype storage: one JSON file. Every request loads it, applies time-based rules,
// runs the change, and saves. Replace `loadDb`/`saveDb` with a real database later —
// the domain code in src/lib/domain doesn't care where the data lives.
import fs from "node:fs";
import path from "node:path";
import type { DB } from "@/lib/domain/types";
import { tickAll } from "@/lib/domain/views";
import { DomainError } from "@/lib/domain/util";

const DATA_FILE = process.env.SRIJAN_DATA_FILE || path.join(process.cwd(), ".data", "db.json");

/** First run: an empty marketplace. */
function initialDb(): DB {
  return { version: 1, seq: 1000, users: [], creators: [], bookings: [], offers: [], ledger: [], campaigns: [], otps: [] };
}

function loadDb(): DB {
  let raw: string;
  try {
    raw = fs.readFileSync(/*turbopackIgnore: true*/ DATA_FILE, "utf8");
  } catch (e) {
    // Only a missing file means "first run". Any other error must not wipe existing data.
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    const db = initialDb();
    saveDb(db);
    return db;
  }
  return JSON.parse(raw) as DB;
}

function saveDb(db: DB) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DATA_FILE);
}


// Run one request at a time so two creators can't both win the same job.
let queue: Promise<unknown> = Promise.resolve();

export function withDb<T>(fn: (db: DB, now: number) => T | Promise<T>): Promise<{ result: T; now: number }> {
  const run = queue.then(async () => {
    const db = loadDb();
    const now = Date.now();
    tickAll(db, now);
    try {
      const result = await fn(db, now);
      saveDb(db);
      return { result, now };
    } catch (e) {
      if (e instanceof DomainError && e.keepChanges) {
        saveDb(db);
        throw e;
      }
      // Persist the time-based changes from the tick, discard the failed change.
      const fresh = loadDb();
      tickAll(fresh, now);
      saveDb(fresh);
      throw e;
    }
  });
  queue = run.catch(() => undefined);
  return run;
}

