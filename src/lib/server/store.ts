// Prototype storage: one JSON file. Every request loads it, applies time-based rules,
// runs the change, and saves. Replace `loadDb`/`saveDb` with a real database later —
// the domain code in src/lib/domain doesn't care where the data lives.
import fs from "node:fs";
import path from "node:path";
import { seedDb } from "@/lib/domain/seed";
import type { DB } from "@/lib/domain/types";
import { tickAll } from "@/lib/domain/views";

const DATA_FILE = process.env.SRIJAN_DATA_FILE || path.join(process.cwd(), ".data", "db.json");

function loadDb(): DB {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw) as DB;
  } catch {
    const db = seedDb(Date.now());
    saveDb(db);
    return db;
  }
}

function saveDb(db: DB) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DATA_FILE);
}

/** Current time, including any demo time-travel set by ops. */
export function clock(db: DB) {
  return Date.now() + (db.clockOffsetMs || 0);
}

// Run one request at a time so two creators can't both win the same job.
let queue: Promise<unknown> = Promise.resolve();

export function withDb<T>(fn: (db: DB, now: number) => T | Promise<T>): Promise<{ result: T; now: number }> {
  const run = queue.then(async () => {
    const db = loadDb();
    const now = clock(db);
    tickAll(db, now);
    try {
      const result = await fn(db, now);
      saveDb(db);
      return { result, now };
    } catch (e) {
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

export function resetDb() {
  const db = seedDb(Date.now());
  saveDb(db);
  return db;
}
