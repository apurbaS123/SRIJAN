import { describe, expect, it } from "vitest";
import { seedDb } from "./fixtures/seed";
import { createBooking } from "@/lib/domain/bookings";
import { acceptOffer, declineOffer } from "@/lib/domain/dispatch";
import { tickAll } from "@/lib/domain/views";
import { MIN } from "@/lib/domain/config";
import type { DB } from "@/lib/domain/types";

// 26 Oct 2026, 10:00 IST
const T0 = Date.UTC(2026, 9, 26, 4, 30);

function book(db: DB, extra: Partial<Parameters<typeof createBooking>[2]> = {}, now = T0) {
  return createBooking(
    db,
    "u_priya",
    {
      packageId: "quick_reel",
      cityId: "guwahati",
      zoneId: "zoo-road",
      address: "Café Brahma, RG Baruah Road",
      scheduledAt: "2026-10-26T15:00",
      brief: "Opening-week reel for our café",
      ...extra,
    },
    now,
  );
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

describe("client picked a creator", () => {
  it("gives that creator 5 minutes alone, then alerts everyone", () => {
    const db = seedDb(T0);
    const b = book(db, { requestedCreatorId: "cr_rituraj" });
    expect(pendingFor(db, b.id)).toEqual(["cr_rituraj"]);
    tickAll(db, T0 + 5 * MIN);
    expect(b.dispatch.phase).toBe("broadcast");
    expect(pendingFor(db, b.id)).toEqual(["cr_ankita", "cr_dhruba", "cr_rituraj"]);
    tickAll(db, T0 + 10 * MIN);
    expect(b.status).toBe("needs_ops");
  });

  it("moves to everyone immediately when the chosen creator declines", () => {
    const db = seedDb(T0);
    const b = book(db, { requestedCreatorId: "cr_rituraj" });
    const o = db.offers.find((x) => x.bookingId === b.id)!;
    declineOffer(db, o.id, "cr_rituraj", T0 + MIN);
    expect(b.dispatch.phase).toBe("broadcast");
    expect(b.dispatch.roundEndsAt).toBe(T0 + 6 * MIN);
    expect(pendingFor(db, b.id)).toEqual(["cr_ankita", "cr_dhruba"]);
  });
});

describe("booking rules", () => {
  it("needs 2 hours' notice", () => {
    const db = seedDb(T0);
    expect(() => book(db, { scheduledAt: "2026-10-26T11:00" })).toThrow(/2 hours/);
  });
});
