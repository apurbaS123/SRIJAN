import { describe, expect, it } from "vitest";
import { seedDb } from "./fixtures/seed";
import { createBooking, recordPayment } from "@/lib/domain/bookings";
import { tickAll } from "@/lib/domain/views";
import { addPushSub, removePushSub, dropDeadSubs, takePushes } from "@/lib/server/push";
import { MIN } from "@/lib/domain/config";
import type { DB } from "@/lib/domain/types";

const T0 = Date.UTC(2026, 9, 26, 4, 30); // 10:00 IST
const SHOOT = Date.UTC(2026, 9, 26, 9, 30); // 15:00 IST
const JOB = {
  packageId: "video_milestone",
  cityId: "guwahati",
  zoneId: "zoo-road",
  address: "Café Brahma, RG Baruah Road",
  scheduledAt: "2026-10-26T15:00",
  brief: "Opening-week reel for our café",
};

const sub = (n: number) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/device-${n}`, keys: { p256dh: `p${n}`, auth: `a${n}` }, addedAt: T0 });
const ankita = (db: DB) => db.creators.find((c) => c.id === "cr_ankita")!.userId;

function paid(db: DB) {
  const b = createBooking(db, "u_priya", JOB, T0);
  recordPayment(db, b, "pay_push", T0);
  return b;
}

describe("push notifications", () => {
  it("turns a job offer into a push for every device the creator signed up", () => {
    const db = seedDb(T0);
    addPushSub(db, ankita(db), sub(1));
    addPushSub(db, ankita(db), sub(2));
    paid(db);

    const pushes = takePushes(db, T0);
    const mine = pushes.filter((p) => p.userId === ankita(db));
    expect(mine).toHaveLength(1);
    expect(mine[0]!.title).toBe("New job near you");
    expect(mine[0]!.body).toContain("Milestone Capture");
    expect(mine[0]!.href).toBe("/creator");
    expect(mine[0]!.subs.map((s) => s.endpoint)).toEqual([sub(1).endpoint, sub(2).endpoint]);
  });

  it("never buzzes the same phone twice for one message", () => {
    const db = seedDb(T0);
    addPushSub(db, ankita(db), sub(1));
    paid(db);
    expect(takePushes(db, T0).length).toBeGreaterThan(0);
    expect(takePushes(db, T0 + MIN)).toEqual([]);
  });

  it("sends nothing to someone who hasn't turned notifications on", () => {
    const db = seedDb(T0);
    paid(db);
    expect(takePushes(db, T0)).toEqual([]);
  });

  it("pushes the 20-minute ops reminder to the ops team's phone", () => {
    const db = seedDb(T0);
    addPushSub(db, "u_ops", sub(9));
    const b = paid(db);
    takePushes(db, T0); // clear the job alerts
    tickAll(db, SHOOT - 20 * MIN);
    const pushes = takePushes(db, SHOOT - 20 * MIN);
    expect(pushes).toHaveLength(1);
    expect(pushes[0]!.userId).toBe("u_ops");
    expect(pushes[0]!.title).toContain(`Job ${b.code} starts in 20 min`);
  });

  it("forgets a device that was turned off, and one the push service rejected", () => {
    const db = seedDb(T0);
    const uid = ankita(db);
    addPushSub(db, uid, sub(1));
    addPushSub(db, uid, sub(2));
    removePushSub(db, uid, sub(1).endpoint);
    expect(db.users.find((u) => u.id === uid)!.push!.map((s) => s.endpoint)).toEqual([sub(2).endpoint]);
    dropDeadSubs(db, [sub(2).endpoint]);
    expect(db.users.find((u) => u.id === uid)!.push).toEqual([]);
  });

  it("keeps at most 10 devices per person, and replaces one that signs up again", () => {
    const db = seedDb(T0);
    const uid = ankita(db);
    for (let i = 0; i < 12; i++) addPushSub(db, uid, sub(i));
    const subs = db.users.find((u) => u.id === uid)!.push!;
    expect(subs).toHaveLength(10);
    addPushSub(db, uid, { ...sub(11), addedAt: T0 + MIN });
    const again = db.users.find((u) => u.id === uid)!.push!;
    expect(again.filter((s) => s.endpoint === sub(11).endpoint)).toHaveLength(1);
  });
});
