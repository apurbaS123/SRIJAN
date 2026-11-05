import { describe, expect, it } from "vitest";
import { seedDb } from "./fixtures/seed";
import { createBooking, recordPayment } from "@/lib/domain/bookings";
import { acceptOffer, declineOffer } from "@/lib/domain/dispatch";
import { tickAll } from "@/lib/domain/views";
import { MIN } from "@/lib/domain/config";
import type { DB } from "@/lib/domain/types";

// 26 Oct 2026, 10:00 IST
const T0 = Date.UTC(2026, 9, 26, 4, 30);

function book(db: DB, extra: Partial<Parameters<typeof createBooking>[2]> = {}, now = T0) {
  const b = createBooking(
    db,
    "u_priya",
    {
      packageId: "video_milestone",
      cityId: "guwahati",
      zoneId: "zoo-road",
      address: "Café Brahma, RG Baruah Road",
      scheduledAt: "2026-10-26T15:00",
      brief: "Opening-week reel for our café",
      ...extra,
    },
    now,
  );
  recordPayment(db, b, `pay_${b.id}`, now);
  return b;
}

const pendingFor = (db: DB, bookingId: string) =>
  db.offers.filter((o) => o.bookingId === bookingId && o.status === "pending").map((o) => o.creatorId).sort();

describe("auto-assign: alert everyone nearby, 5 minutes", () => {
  it("alerts every available verified creator within 10 km at once", () => {
    const db = seedDb(T0);
    const b = book(db);
    expect(b.status).toBe("searching");
    expect(pendingFor(db, b.id)).toEqual(["cr_ankita", "cr_dhruba", "cr_rituraj"]);
    expect(b.dispatch.roundEndsAt - T0).toBe(5 * MIN);
  });

  it("goes to ops after 5 minutes if nobody accepts", () => {
    const db = seedDb(T0);
    const b = book(db);
    tickAll(db, T0 + 4 * MIN + 59_000);
    expect(b.status).toBe("searching");
    tickAll(db, T0 + 5 * MIN);
    expect(b.status).toBe("needs_ops");
    expect(pendingFor(db, b.id)).toEqual([]);
  });

  it("widens to 25 km at minute 3 within the same window", () => {
    const db = seedDb(T0);
    const b = book(db, { zoneId: "jalukbari" });
    expect(pendingFor(db, b.id)).toEqual(["cr_dhruba"]);
    tickAll(db, T0 + 3 * MIN);
    expect(b.dispatch.widened).toBe(true);
    expect(pendingFor(db, b.id)).toEqual(["cr_dhruba", "cr_rituraj"]);
    const late = db.offers.find((o) => o.creatorId === "cr_rituraj")!;
    expect(late.expiresAt).toBe(T0 + 5 * MIN);
  });

  it("alerts creators who come online during the window", () => {
    const db = seedDb(T0);
    db.creators.find((c) => c.id === "cr_rituraj")!.available = false;
    const b = book(db);
    expect(pendingFor(db, b.id)).not.toContain("cr_rituraj");
    db.creators.find((c) => c.id === "cr_rituraj")!.available = true;
    tickAll(db, T0 + 1 * MIN);
    expect(pendingFor(db, b.id)).toContain("cr_rituraj");
  });

  it("first to accept wins; the others lose the offer", () => {
    const db = seedDb(T0);
    const b = book(db);
    const offers = db.offers.filter((o) => o.bookingId === b.id);
    const dhruba = offers.find((o) => o.creatorId === "cr_dhruba")!;
    const ankita = offers.find((o) => o.creatorId === "cr_ankita")!;
    acceptOffer(db, dhruba.id, "cr_dhruba", T0 + 2 * MIN);
    expect(b.status).toBe("assigned");
    expect(b.creatorId).toBe("cr_dhruba");
    expect(() => acceptOffer(db, ankita.id, "cr_ankita", T0 + 2 * MIN + 1000)).toThrow(/first/);
  });

  it("does not alert creators already booked at that time", () => {
    const db = seedDb(T0);
    const first = book(db);
    const o = db.offers.find((x) => x.bookingId === first.id && x.creatorId === "cr_ankita")!;
    acceptOffer(db, o.id, "cr_ankita", T0 + MIN);
    const second = book(db, { zoneId: "chandmari", scheduledAt: "2026-10-26T16:00" }, T0 + 2 * MIN);
    expect(pendingFor(db, second.id)).not.toContain("cr_ankita");
  });
});

describe("clients can't pick a creator", () => {
  it("alerts everyone even if a request names one creator", () => {
    const db = seedDb(T0);
    const b = book(db, { requestedCreatorId: "cr_rituraj" } as never);
    expect(b.requestedCreatorId).toBeUndefined();
    expect(b.dispatch.phase).toBe("broadcast");
    expect(pendingFor(db, b.id)).toEqual(["cr_ankita", "cr_dhruba", "cr_rituraj"]);
  });

  /** A booking made before the option was removed, still waiting on the creator it was sent to. */
  function sentToOne(db: DB) {
    const b = book(db);
    db.offers = db.offers.filter((o) => o.bookingId !== b.id || o.creatorId === "cr_rituraj");
    const o = db.offers.find((x) => x.bookingId === b.id)!;
    o.kind = "direct";
    b.dispatch.phase = "direct";
    return { b, o };
  }

  it("still moves an older booking on to everyone after 5 minutes", () => {
    const db = seedDb(T0);
    const { b } = sentToOne(db);
    tickAll(db, T0 + 5 * MIN);
    expect(b.dispatch.phase).toBe("broadcast");
    expect(pendingFor(db, b.id)).toEqual(["cr_ankita", "cr_dhruba", "cr_rituraj"]);
    tickAll(db, T0 + 10 * MIN);
    expect(b.status).toBe("needs_ops");
  });

  it("still moves an older booking on when that creator declines", () => {
    const db = seedDb(T0);
    const { b, o } = sentToOne(db);
    declineOffer(db, o.id, "cr_rituraj", T0 + MIN);
    expect(b.dispatch.phase).toBe("broadcast");
    expect(b.dispatch.roundEndsAt).toBe(T0 + 6 * MIN);
    expect(pendingFor(db, b.id)).toEqual(["cr_ankita", "cr_dhruba"]);
  });
});

describe("only the right field is alerted", () => {
  it("doesn't alert on-site jobs to creators in other fields", () => {
    const db = seedDb(T0);
    const b = book(db, { zoneId: "chandmari" });
    // Bhaswati (designer) and Ritika (writer) are based nearby but don't shoot.
    expect(pendingFor(db, b.id)).not.toContain("cr_bhaswati");
    expect(pendingFor(db, b.id)).not.toContain("cr_ritika");
  });

  it("alerts an online job to its field wherever they are, skipping everyone else", () => {
    const db = seedDb(T0);
    const b = book(db, { packageId: "edit_reel", cityId: undefined, zoneId: undefined, address: undefined, brief: "Edit my clips into one reel" });
    expect(b.online).toBe(true);
    expect(b.status).toBe("searching");
    // The editors, including Pallab in Dibrugarh and Wanphrang in Shillong. Nilakshi only shoots.
    expect(pendingFor(db, b.id)).toEqual(["cr_ankita", "cr_dhruba", "cr_pallab", "cr_rituraj", "cr_wanphrang"]);
    expect(db.offers.every((o) => o.bookingId !== b.id || o.distanceKm === 0)).toBe(true);
  });

  it("doesn't let an online job block a creator's on-site shoot", () => {
    const db = seedDb(T0);
    const online = book(db, { packageId: "edit_reel", cityId: undefined, zoneId: undefined, address: undefined, brief: "Edit my clips into one reel" });
    acceptOffer(db, db.offers.find((o) => o.bookingId === online.id && o.creatorId === "cr_ankita")!.id, "cr_ankita", T0 + MIN);
    const shoot = book(db, {}, T0 + 2 * MIN);
    expect(pendingFor(db, shoot.id)).toContain("cr_ankita");
  });

  it("skips creators who haven't linked a bank or UPI", () => {
    const db = seedDb(T0);
    db.creators.find((c) => c.id === "cr_ankita")!.upiId = undefined;
    expect(pendingFor(db, book(db).id)).not.toContain("cr_ankita");
  });
});

describe("demo notifications", () => {
  const unread = (db: DB, userId: string) => (db.notifications ?? []).filter((n) => n.userId === userId && !n.readAt);

  it("tells each alerted creator what, where, when and the brief", () => {
    const db = seedDb(T0);
    book(db);
    const [n] = unread(db, "u_ankita");
    expect(n!.lines.join(" ")).toMatch(/Milestone Capture.*Zoo Road, Guwahati.*26 Oct 2026.*Opening-week reel/);
    expect(unread(db, "u_nilakshi")).toEqual([]);
    expect(unread(db, "u_bhaswati")).toEqual([]);
  });

  it("clears the alert for everyone once the job is taken, and tells the client", () => {
    const db = seedDb(T0);
    const b = book(db);
    acceptOffer(db, db.offers.find((o) => o.bookingId === b.id && o.creatorId === "cr_ankita")!.id, "cr_ankita", T0 + MIN);
    expect(unread(db, "u_ankita")).toEqual([]);
    expect(unread(db, "u_rituraj")).toEqual([]);
    expect(unread(db, "u_priya").map((n) => n.title)).toEqual(["Ankita Baruah accepted your job"]);
  });
});

describe("booking rules", () => {
  it("needs 1 hour's notice on site, none online, and no time that has passed", () => {
    const db = seedDb(T0);
    expect(() => book(db, { scheduledAt: "2026-10-26T10:55" })).toThrow(/1 hour/);
    expect(book(db, { scheduledAt: "2026-10-26T11:00" }).status).toBe("searching");
    const job = { packageId: "edit_reel", cityId: undefined, zoneId: undefined, address: undefined, brief: "Edit my clips into one reel" };
    expect(book(db, { ...job, scheduledAt: "2026-10-26T10:00" }).status).toBe("searching");
    expect(() => book(db, { ...job, scheduledAt: "2026-10-26T09:55" })).toThrow(/has passed/);
  });
});
