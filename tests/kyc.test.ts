import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seedDb } from "./fixtures/seed";
import { signUpCreator, updateOwnCreator } from "@/lib/domain/creators";
import { cancelDigilocker, completeDigilocker, isAadhaarNumber, kycSummary, namesMatch, pendingDigilocker, startDigilocker, submitAadhaar } from "@/lib/domain/kyc";
import { setVerification } from "@/lib/domain/creators";
import { DAY, HOUR, KYC_HANDSHAKE_MS, MIN } from "@/lib/domain/config";
import { tickAll } from "@/lib/domain/views";
import { assertDigilockerConfigured, authorizeUrl, digilockerConfigured } from "@/lib/server/digilocker";
import type { DB } from "@/lib/domain/types";

// 26 Oct 2026, 10:00 IST
const T0 = Date.UTC(2026, 9, 26, 4, 30);

function joined(name = "Mitali Deka") {
  const db = seedDb(T0);
  const { creator } = signUpCreator(
    db,
    { name, phone: "9876511111", cityId: "guwahati", zoneId: "zoo-road", services: [{ key: "videography" }] },
    { email: "mitali@example.com", phone: "9876511111" },
    T0,
  );
  return { db, creator };
}

/** What DigiLocker hands back for this person. */
const identity = (over: Partial<Parameters<typeof completeDigilocker>[2]> = {}) => ({
  name: "Mitali Deka",
  dob: "1998-04-12",
  gender: "F",
  aadhaarLast4: "4321",
  digilockerId: "dl-mitali-1",
  pan: true,
  ...over,
});

const verify = (db: DB, creatorId: string, over = {}, now = T0 + MIN) => completeDigilocker(db, creatorId, identity(over), now);

/** Both sides of a card, as the upload route hands them to the rules. */
const upload = (over: Partial<Parameters<typeof submitAadhaar>[2]> = {}) => ({
  name: "Mitali Deka",
  last4: "4321",
  numberHash: "hash-of-mitali-aadhaar",
  front: { id: "doc_front1", mime: "image/jpeg", size: 1200, uploadedAt: T0 },
  back: { id: "doc_back1", mime: "image/jpeg", size: 1100, uploadedAt: T0 },
  ...over,
});

describe("Aadhaar checked by the Srijan team (no DigiLocker keys set)", () => {
  it("leaves a new creator unverified and off the job board until somebody approves them", () => {
    const { db, creator } = joined();
    expect(creator.verification).toBe("pending");
    expect(() => updateOwnCreator(db, creator.id, { available: true })).toThrow(/verified/);

    submitAadhaar(db, creator.id, upload(), T0 + MIN);
    // Uploading proves nothing by itself: it only puts them in the queue.
    expect(creator.verification).toBe("pending");
    expect(creator.kyc.aadhaar).toBe(false);
    expect(() => updateOwnCreator(db, creator.id, { available: true })).toThrow(/verified/);

    // Time passing must never verify anyone.
    tickAll(db, T0 + 30 * DAY);
    expect(creator.verification).toBe("pending");

    setVerification(db, creator.id, "verified", true, undefined, "Ops Anita", T0 + HOUR);
    expect(creator.verification).toBe("verified");
    expect(creator.kyc.aadhaar).toBe(true);
    // PAN isn't collected here, so approving must not claim it was checked.
    expect(creator.kyc.pan).toBe(false);
    expect(creator.kyc.aadhaarDoc).toMatchObject({ checkedAt: T0 + HOUR, checkedBy: "Ops Anita" });
    updateOwnCreator(db, creator.id, { available: true });
    expect(creator.available).toBe(true);
  });

  it("won’t let the team approve without saying they read the documents", () => {
    const { db, creator } = joined();
    submitAadhaar(db, creator.id, upload(), T0 + MIN);
    expect(() => setVerification(db, creator.id, "verified", false)).toThrow(/read their Aadhaar/);
    expect(creator.verification).toBe("pending");
  });

  it("sends a creator back with a reason, and takes them again once they re-upload", () => {
    const { db, creator } = joined();
    submitAadhaar(db, creator.id, upload(), T0 + MIN);
    creator.available = true;

    setVerification(db, creator.id, "rejected", false, "The back is too blurry to read.", "Ops Anita", T0 + HOUR);
    expect(creator.verification).toBe("rejected");
    // Off the job board at once, whatever they had switched on.
    expect(creator.available).toBe(false);
    expect(kycSummary(creator).aadhaarDoc?.rejectedNote).toBe("The back is too blurry to read.");

    const { replaced } = submitAadhaar(db, creator.id, upload({ front: { id: "doc_front2", mime: "image/jpeg", size: 900, uploadedAt: T0 } }), T0 + 2 * HOUR);
    // Back in the queue, and the photos nothing points at any more are handed back to be deleted.
    expect(creator.verification).toBe("pending");
    expect(replaced.map((r) => r.id)).toEqual(["doc_front1", "doc_back1"]);
    expect(kycSummary(creator).aadhaarDoc).toMatchObject({ frontId: "doc_front2", rejectedNote: undefined });
  });

  it("flags the same Aadhaar arriving on a second account instead of letting both through", () => {
    const { db, creator } = joined();
    submitAadhaar(db, creator.id, upload(), T0 + MIN);
    setVerification(db, creator.id, "verified", true, undefined, "Ops Anita", T0 + HOUR);

    const { creator: second } = signUpCreator(
      db,
      { name: "Mitali Deka", phone: "9876522222", cityId: "guwahati", zoneId: "beltola", services: [{ key: "videography" }] },
      { email: "mitali2@example.com", phone: "9876522222" },
      T0,
    );
    const { duplicate } = submitAadhaar(db, second.id, upload(), T0 + 2 * HOUR);
    expect(duplicate).toBe(true);
    expect(second.verification).toBe("pending");
    expect(kycSummary(second).aadhaarDoc?.duplicate).toBe(true);
    // And they can't simply send it again until the team has sorted it out.
    expect(() => submitAadhaar(db, second.id, upload(), T0 + 3 * HOUR)).toThrow(/already on another/);
    // The first account is untouched.
    expect(creator.verification).toBe("verified");
  });

  it("tells the team when the card and the profile disagree, without deciding for them", () => {
    const { db, creator } = joined();
    submitAadhaar(db, creator.id, upload({ name: "Rituraj Das" }), T0 + MIN);
    expect(kycSummary(creator).aadhaarDoc?.nameMismatch).toBe(true);
    // A middle name on the card is not a mismatch.
    submitAadhaar(db, creator.id, upload({ name: "Mitali Rani Deka" }), T0 + 2 * MIN);
    expect(kycSummary(creator).aadhaarDoc?.nameMismatch).toBe(false);
  });

  it("keeps the Aadhaar number out of everything a browser is sent", () => {
    const { db, creator } = joined();
    submitAadhaar(db, creator.id, upload(), T0 + MIN);
    const summary = JSON.stringify(kycSummary(creator));
    expect(summary).toContain("4321");
    expect(summary).not.toContain("hash-of-mitali-aadhaar");
    expect(kycSummary(creator).aadhaarDoc).toMatchObject({ last4: "4321", frontId: "doc_front1", backId: "doc_back1" });
  });

  it("won’t take an Aadhaar from a creator who is already verified", () => {
    const { db, creator } = joined();
    submitAadhaar(db, creator.id, upload(), T0 + MIN);
    setVerification(db, creator.id, "verified", true);
    expect(() => submitAadhaar(db, creator.id, upload(), T0 + HOUR)).toThrow(/already verified/);
  });
});

describe("Aadhaar numbers", () => {
  it("accepts real numbers and catches a mistyped digit", () => {
    // Valid Verhoeff check digits.
    expect(isAadhaarNumber("234567890124")).toBe(true);
    expect(isAadhaarNumber("999999990019")).toBe(true);
    // One digit changed: the check digit no longer agrees.
    expect(isAadhaarNumber("234567890123")).toBe(false);
    expect(isAadhaarNumber("243567890124")).toBe(false);
  });

  it("refuses anything that isn’t 12 digits starting 2–9", () => {
    expect(isAadhaarNumber("123456789012")).toBe(false);
    expect(isAadhaarNumber("034567890124")).toBe(false);
    expect(isAadhaarNumber("23456789012")).toBe(false);
    expect(isAadhaarNumber("2345 6789 0124")).toBe(false);
    expect(isAadhaarNumber("")).toBe(false);
  });
});

describe("name matching", () => {
  it("accepts the same person spelled a bit differently", () => {
    expect(namesMatch("Mitali Deka", "mitali deka")).toBe(true);
    // Aadhaar often carries a middle name the creator didn't type.
    expect(namesMatch("Mitali Rani Deka", "Mitali Deka")).toBe(true);
    expect(namesMatch("Dr. Mitali Deka", "Mitali Deka")).toBe(true);
    expect(namesMatch("Mitali  Deka!", "Mitali Deka")).toBe(true);
  });

  it("rejects two different people, and an empty name", () => {
    expect(namesMatch("Rituraj Das", "Mitali Deka")).toBe(false);
    expect(namesMatch("Mitali Dekaa", "Mitali Deka")).toBe(false);
    expect(namesMatch("", "Mitali Deka")).toBe(false);
    expect(namesMatch("Mr.", "Mitali Deka")).toBe(false);
  });
});

describe("DigiLocker verification", () => {
  it("verifies the creator the moment DigiLocker confirms them", () => {
    const { db, creator } = joined();
    expect(creator.verification).toBe("pending");
    startDigilocker(db, creator.id, T0);
    const { outcome } = verify(db, creator.id);
    expect(outcome).toBe("verified");
    expect(creator.verification).toBe("verified");
    expect(creator.kyc).toMatchObject({ aadhaar: true, pan: true });
    // Nobody from Srijan was involved, and they can go online right away.
    updateOwnCreator(db, creator.id, { available: true });
    expect(creator.available).toBe(true);
  });

  it("keeps only the last 4 digits of the Aadhaar, and no handshake secrets", () => {
    const { db, creator } = joined();
    startDigilocker(db, creator.id, T0);
    verify(db, creator.id);
    const summary = kycSummary(creator);
    expect(summary.digilocker).toMatchObject({ name: "Mitali Deka", aadhaarLast4: "4321", pan: true });
    expect(JSON.stringify(summary)).not.toContain("verifier");
    expect(JSON.stringify(summary)).not.toContain(creator.kyc.digilocker!.digilockerId!);
  });

  it("hands a name that doesn't match to the Srijan team instead of verifying", () => {
    const { db, creator } = joined();
    startDigilocker(db, creator.id, T0);
    const { outcome } = verify(db, creator.id, { name: "Rituraj Das" });
    expect(outcome).toBe("needs_review");
    expect(creator.verification).toBe("pending");
    expect(kycSummary(creator).needsReview).toMatchObject({ reason: "name_mismatch", name: "Rituraj Das" });
    // Nothing is ticked off: we can't say these documents are this creator's.
    expect(creator.kyc).toMatchObject({ aadhaar: false, pan: false });
    expect(kycSummary(creator).digilocker).toBeNull();
    expect(() => updateOwnCreator(db, creator.id, { available: true })).toThrow(/verified/);
  });

  it("refuses one Aadhaar on a second creator account", () => {
    const { db, creator } = joined();
    startDigilocker(db, creator.id, T0);
    verify(db, creator.id);

    const { creator: second } = signUpCreator(
      db,
      { name: "Mitali Deka", phone: "9876522222", cityId: "guwahati", zoneId: "beltola", services: [{ key: "videography" }] },
      { email: "mitali2@example.com", phone: "9876522222" },
      T0,
    );
    startDigilocker(db, second.id, T0);
    const { outcome } = verify(db, second.id);
    expect(outcome).toBe("already_used");
    expect(second.verification).toBe("pending");
    expect(second.kyc.aadhaar).toBe(false);
    expect(kycSummary(second).needsReview).toMatchObject({ reason: "duplicate" });
    // And they can't simply try again until the team has sorted it out.
    expect(() => startDigilocker(db, second.id, T0 + MIN)).toThrow(/already verified on another/);
    // The first account is untouched.
    expect(creator.verification).toBe("verified");
  });

  it("only trusts a reply that matches an open handshake", () => {
    const { db, creator } = joined();
    const { state } = startDigilocker(db, creator.id, T0);
    expect(pendingDigilocker(db, state, T0 + MIN)?.creator.id).toBe(creator.id);
    expect(pendingDigilocker(db, "dlk_madeup", T0 + MIN)).toBeNull();
    expect(pendingDigilocker(db, "", T0 + MIN)).toBeNull();
    // A reply that took too long to come back is no good.
    expect(pendingDigilocker(db, state, T0 + KYC_HANDSHAKE_MS + 1)).toBeNull();
  });

  it("lets a creator who gave up start again, and won't start one twice over", () => {
    const { db, creator } = joined();
    const first = startDigilocker(db, creator.id, T0);
    const second = startDigilocker(db, creator.id, T0 + MIN);
    expect(second.state).not.toBe(first.state);
    // The abandoned handshake can't be used any more.
    expect(pendingDigilocker(db, first.state, T0 + 2 * MIN)).toBeNull();

    cancelDigilocker(db, creator.id);
    expect(pendingDigilocker(db, second.state, T0 + 2 * MIN)).toBeNull();

    startDigilocker(db, creator.id, T0 + 3 * MIN);
    verify(db, creator.id);
    expect(() => startDigilocker(db, creator.id, T0 + 4 * MIN)).toThrow(/already verified/);
  });

  it("won't start for a rejected creator", () => {
    const { db, creator } = joined();
    creator.verification = "rejected";
    expect(() => startDigilocker(db, creator.id, T0)).toThrow(/wasn’t approved/);
  });

  it("marks PAN only when DigiLocker found a PAN card", () => {
    const { db, creator } = joined();
    startDigilocker(db, creator.id, T0);
    verify(db, creator.id, { pan: false });
    expect(creator.kyc).toMatchObject({ aadhaar: true, pan: false });
  });
});

describe("the DigiLocker sign-in link", () => {
  beforeEach(() => {
    vi.stubEnv("DIGILOCKER_CLIENT_ID", "srijan-test");
    vi.stubEnv("DIGILOCKER_CLIENT_SECRET", "dl-secret");
    vi.stubEnv("SRIJAN_SITE_URL", "https://srijanclub.in");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("asks DigiLocker for an authorization code, with PKCE and our one-time state", () => {
    const u = new URL(authorizeUrl("dlk_state1", "verifier-1234567890"));
    expect(u.origin).toBe("https://digilocker.meripehchaan.gov.in");
    expect(u.pathname).toBe("/public/oauth2/1/authorize");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      response_type: "code",
      client_id: "srijan-test",
      redirect_uri: "https://srijanclub.in/api/kyc/digilocker/callback",
      state: "dlk_state1",
      code_challenge_method: "S256",
      dl_flow: "signin",
    });
    // The verifier itself must never be in the link — only its hash.
    expect(u.searchParams.get("code_challenge")).toBe(createHash("sha256").update("verifier-1234567890").digest("base64url"));
    expect(u.search).not.toContain("verifier-1234567890");
    expect(u.search).not.toContain("dl-secret");
  });

  it("uses the registered redirect when one is set", () => {
    vi.stubEnv("DIGILOCKER_REDIRECT_URI", "https://srijanclub.in/custom/callback");
    expect(new URL(authorizeUrl("s", "v")).searchParams.get("redirect_uri")).toBe("https://srijanclub.in/custom/callback");
  });

  it("fails closed, with something a creator can act on, when DigiLocker isn't set up", () => {
    vi.stubEnv("DIGILOCKER_CLIENT_ID", "");
    vi.stubEnv("DIGILOCKER_CLIENT_SECRET", "");
    expect(digilockerConfigured()).toBe(false);
    expect(() => assertDigilockerConfigured()).toThrow(/by hand/);
    expect(() => authorizeUrl("s", "v")).toThrow(/isn’t set up/);
  });
});
