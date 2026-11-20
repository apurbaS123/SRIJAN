import { describe, expect, it } from "vitest";
import { at, seedDb } from "./fixtures/seed";
import { clearCreatorPhoto, deleteBlocker, deleteCreator, setCreatorPhoto, updateCreatorByOps } from "@/lib/domain/creators";
import { createBooking } from "@/lib/domain/bookings";
import { creatorPublic } from "@/lib/domain/views";
import type { DB, UploadRef } from "@/lib/domain/types";

const T0 = Date.UTC(2026, 9, 26, 4, 30); // 10:00 IST

const find = (db: DB, id: string) => db.creators.find((c) => c.id === id)!;

const photo = (id: string): UploadRef => ({ id, mime: "image/jpeg", size: 40_000, uploadedAt: T0 });

describe("the Srijan team editing a creator's profile", () => {
  it("renames the profile and the account that signs in to it", () => {
    const db = seedDb(T0);
    const c = find(db, "cr_ritika");
    updateCreatorByOps(db, c.id, { name: "  Ritika Saikia  " });
    expect(find(db, "cr_ritika").name).toBe("Ritika Saikia");
    expect(db.users.find((u) => u.id === c.userId)!.name).toBe("Ritika Saikia");
  });

  it("clears a placeholder bio when given an empty one", () => {
    const db = seedDb(T0);
    updateCreatorByOps(db, "cr_ritika", { bio: "" });
    expect(find(db, "cr_ritika").bio).toBe("");
  });

  it("moves a creator to another city, and stops trusting their old pin", () => {
    const db = seedDb(T0);
    expect(find(db, "cr_ritika").coarse).toBeFalsy();
    updateCreatorByOps(db, "cr_ritika", { stateId: "assam", city: "Jorhat" });
    const c = find(db, "cr_ritika");
    expect([c.stateId, c.city]).toEqual(["assam", "Jorhat"]);
    // Ops typed a name, not a point on a map. The honest coordinate is the middle of the state,
    // and `coarse` saying so is what makes dispatch widen instead of measuring from a stale pin.
    expect(c.coarse).toBe(true);
  });

  it("refuses a state that doesn't exist, and changes nothing", () => {
    const db = seedDb(T0);
    expect(() => updateCreatorByOps(db, "cr_ritika", { stateId: "atlantis", city: "Atlantis" })).toThrow(/state/);
    expect(find(db, "cr_ritika").city).toBe("Guwahati");
  });

  it("can take a creator offline, and cannot put one online", () => {
    const db = seedDb(T0);
    find(db, "cr_ankita").available = true;
    updateCreatorByOps(db, "cr_ankita", { available: false });
    expect(find(db, "cr_ankita").available).toBe(false);
    // `available: true` is not part of the patch at all, so even a hand-made request is ignored.
    updateCreatorByOps(db, "cr_ankita", { available: true } as never);
    expect(find(db, "cr_ankita").available).toBe(false);
  });

  it("never touches money, identity or verification, whatever is sent", () => {
    const db = seedDb(T0);
    const kycBefore = JSON.stringify(find(db, "cr_mridul").kyc);
    expect(find(db, "cr_mridul").verification).toBe("pending");
    updateCreatorByOps(db, "cr_mridul", {
      verification: "verified",
      upiId: "attacker@ybl",
      bank: { accountName: "Someone Else", accountNumber: "000111222333", ifsc: "SBIN0001234" },
      kyc: { aadhaar: true, pan: true },
      jobsDone: 9999,
      ratingSum: 5000,
    } as never);
    const after = find(db, "cr_mridul");
    expect(after.verification).toBe("pending");
    expect(after.upiId).toBeUndefined();
    expect(after.bank).toBeUndefined();
    expect(JSON.stringify(after.kyc)).toBe(kycBefore);
    expect(after.jobsDone).toBe(0);
    expect(after.ratingSum).toBe(0);
  });

  it("hands back the photo it threw away, so the file can be deleted too", () => {
    const db = seedDb(T0);
    find(db, "cr_ritika").photo = photo("doc_face1");
    const { orphaned } = updateCreatorByOps(db, "cr_ritika", { removePhoto: true });
    expect(orphaned).toEqual(["doc_face1"]);
    expect(find(db, "cr_ritika").photo).toBeUndefined();
  });

  it("is refused on a creator who isn't there", () => {
    const db = seedDb(T0);
    expect(() => updateCreatorByOps(db, "cr_nobody", { name: "Ghost" })).toThrow(/not found/);
  });
});

describe("the Srijan team deleting a creator", () => {
  it("removes the profile, the login, open offers and their notifications", () => {
    const db = seedDb(T0);
    const c = find(db, "cr_ritika");
    db.offers.push({ id: "of_x", bookingId: "bkg_seed_1", creatorId: c.id, kind: "broadcast", sentAt: T0, expiresAt: T0 + 300_000, distanceKm: 2, status: "pending" });
    db.notifications = [{ id: "n_x", userId: c.userId, at: T0, title: "New job near you", lines: [], href: "/creator" }];
    find(db, "cr_ritika").photo = photo("doc_face2");

    const { removed, documents } = deleteCreator(db, c.id);

    expect(removed.name).toBe("Ritika Saikia");
    expect(documents).toContain("doc_face2");
    expect(db.creators.some((x) => x.id === c.id)).toBe(false);
    expect(db.users.some((u) => u.id === c.userId)).toBe(false);
    expect(db.offers.some((o) => o.creatorId === c.id)).toBe(false);
    expect(db.notifications).toEqual([]);
  });

  it("keeps finished jobs and the ledger: they are the record of what happened", () => {
    const db = seedDb(T0);
    const bookings = db.bookings.length;
    const ledger = db.ledger.length;
    // cr_ankita's seeded earning is already paid, so nothing is owed and she can go.
    db.campaigns = [];
    deleteCreator(db, "cr_ankita");
    expect(db.bookings.length).toBe(bookings);
    expect(db.ledger.length).toBe(ledger);
    expect(db.bookings.find((b) => b.id === "bkg_seed_1")!.creatorId).toBe("cr_ankita");
  });

  it("refuses while they are in the middle of a job", () => {
    const db = seedDb(T0);
    createBooking(
      db,
      "u_priya",
      { packageId: "video_milestone", ...at("guwahati", "zoo-road"), address: "Café Brahma", scheduledAt: "2026-10-26T15:00", brief: "Opening-week reel for our cafe", requestedCreatorId: "cr_dhruba" },
      T0,
    );
    expect(deleteBlocker(db, "cr_dhruba")).toMatch(/still going/);
    expect(() => deleteCreator(db, "cr_dhruba")).toThrow(/still going/);
    expect(db.creators.some((c) => c.id === "cr_dhruba")).toBe(true);
  });

  it("refuses while Srijan still owes them money, and says how much", () => {
    const db = seedDb(T0);
    db.ledger.push({ id: "led_owed", at: T0, type: "creator_earning", amount: 2000, creatorId: "cr_ritika", status: "processing" });
    expect(deleteBlocker(db, "cr_ritika")).toMatch(/₹2,000/);
    expect(() => deleteCreator(db, "cr_ritika")).toThrow(/owes them/);
  });

  it("refuses while they are booked on a campaign", () => {
    const db = seedDb(T0);
    // Seeded as "invited" on the Brahmaputra Tea campaign.
    expect(deleteBlocker(db, "cr_ankita")).toMatch(/Brahmaputra Tea/);
    expect(() => deleteCreator(db, "cr_ankita")).toThrow(/campaign/);
  });

  it("lets a creator go once the payout is marked sent", () => {
    const db = seedDb(T0);
    db.ledger.push({ id: "led_owed", at: T0, type: "creator_earning", amount: 2000, creatorId: "cr_ritika", status: "processing" });
    expect(deleteBlocker(db, "cr_ritika")).not.toBeNull();
    db.ledger.find((l) => l.id === "led_owed")!.status = "paid";
    expect(deleteBlocker(db, "cr_ritika")).toBeNull();
  });
});

describe("a creator's profile photo", () => {
  it("is offered to everyone as a public URL, and is absent until they add one", () => {
    const db = seedDb(T0);
    expect(creatorPublic(find(db, "cr_ritika")).photoUrl).toBeNull();
    setCreatorPhoto(db, "cr_ritika", photo("doc_face3"));
    expect(creatorPublic(find(db, "cr_ritika")).photoUrl).toBe("/avatar/doc_face3");
  });

  it("hands back the photo it replaced, so one creator never keeps two files", () => {
    const db = seedDb(T0);
    setCreatorPhoto(db, "cr_ritika", photo("doc_old"));
    const { orphaned } = setCreatorPhoto(db, "cr_ritika", photo("doc_new"));
    expect(orphaned).toEqual(["doc_old"]);
    expect(find(db, "cr_ritika").photo!.id).toBe("doc_new");
  });

  it("is removed on request, and says which file to delete", () => {
    const db = seedDb(T0);
    setCreatorPhoto(db, "cr_ritika", photo("doc_face4"));
    const { orphaned } = clearCreatorPhoto(db, "cr_ritika");
    expect(orphaned).toEqual(["doc_face4"]);
    expect(find(db, "cr_ritika").photo).toBeUndefined();
    // Removing a photo that isn't there is not an error, and leaves nothing to delete.
    expect(clearCreatorPhoto(db, "cr_ritika").orphaned).toEqual([]);
  });
});
