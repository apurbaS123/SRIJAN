// Postgres store, against a throwaway local database. Skipped unless TEST_DATABASE_URL is set:
//   TEST_DATABASE_URL=postgres://postgres:pw@localhost:5432/postgres npm test
// It wipes the `srijan` schema there, so it only accepts localhost / 127.0.0.1.
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { seedDb } from "./fixtures/seed";
import { ensureSchema, load, save } from "@/lib/server/pg";
import type { DB } from "@/lib/domain/types";

const URL_ = process.env.TEST_DATABASE_URL;
const local = !!URL_ && ["localhost", "127.0.0.1"].includes(new URL(URL_).hostname);
const T0 = Date.UTC(2026, 9, 26, 4, 30);
const empty = (): DB => ({ version: 1, seq: 1000, users: [], creators: [], bookings: [], offers: [], ledger: [], campaigns: [], otps: [] });

describe.skipIf(!local)("Postgres store", () => {
  const sql = postgres(URL_ ?? "postgres://localhost/none", { ssl: false, prepare: false, onnotice: false, max: 4 });
  const read = () => sql.begin((tx) => load(tx));

  beforeEach(async () => {
    await sql`drop schema if exists srijan cascade`;
  });
  afterAll(() => sql.end({ timeout: 5 }));

  it("copies data from the earlier single-row store once, keeping every field, null and order", async () => {
    const seed = seedDb(T0);
    seed.otps = [{ email: "a@example.com", codeHash: "h1", sentAt: T0, expiresAt: T0 + 600_000, attempts: 2 }];
    await sql`create schema srijan`;
    await sql`create table srijan.state (id int primary key, data jsonb not null)`;
    await sql`insert into srijan.state (id, data) values (1, ${JSON.stringify(seed)}::text::jsonb)`;

    await ensureSchema(sql, empty);
    const { db } = await read();
    expect(db).toEqual(JSON.parse(JSON.stringify(seed)));
    // A campaign without an agreed budget keeps `null` (not missing).
    expect(db.campaigns.some((c) => c.budget === null)).toBe(true);

    // Running setup again (another server copy starting) changes nothing.
    await ensureSchema(sql, empty);
    expect((await read()).db).toEqual(db);
    const [old] = await sql`select count(*)::int as n from srijan.state`;
    expect(old!.n).toBe(1);
  });

  it("saves only what changed: updates, additions and removals", async () => {
    await ensureSchema(sql, () => seedDb(T0));
    await sql.begin(async (tx) => {
      const { db, snapshot, meta } = await load(tx);
      db.bookings[0]!.status = "cancelled";
      db.users.push({ id: "u_new", role: "client", name: "New Client", email: "new@example.com", phone: "+91 9876500000", createdAt: T0 });
      db.campaigns = db.campaigns.slice(1);
      db.seq += 5;
      await save(tx, snapshot, db, meta);
    });
    const before = seedDb(T0);
    const { db } = await read();
    expect(db.bookings[0]!.status).toBe("cancelled");
    expect(db.users.at(-1)!.id).toBe("u_new");
    expect(db.users.map((u) => u.id)).toEqual([...before.users.map((u) => u.id), "u_new"]);
    expect(before.campaigns.length).toBeGreaterThan(1);
    expect(db.campaigns.map((c) => c.id)).toEqual(before.campaigns.slice(1).map((c) => c.id));
    expect(db.seq).toBe(before.seq + 5);
  });

  it("fills the readable columns from each record", async () => {
    await ensureSchema(sql, () => seedDb(T0));
    const [u] = await sql`select name, email, role, created_at from srijan.users where id = 'u_priya'`;
    expect(u).toMatchObject({ name: "Priya Sharma", email: "priya@cafebrahma.in", role: "client" });
    expect((u!.created_at as Date).getTime()).toBe(T0);
    const [c] = await sql`select verification, available from srijan.creators where id = 'cr_ankita'`;
    expect(c).toMatchObject({ verification: "verified" });
    expect(typeof c!.available).toBe("boolean");
  });

  it("runs requests one at a time, so concurrent changes are never lost", async () => {
    await ensureSchema(sql, empty);
    const bump = () =>
      sql.begin(async (tx) => {
        const { db, snapshot, meta } = await load(tx);
        await new Promise((r) => setTimeout(r, 20));
        db.seq += 1;
        await save(tx, snapshot, db, meta);
      });
    await Promise.all(Array.from({ length: 4 }, bump));
    expect((await read()).db.seq).toBe(1004);
  });
});
