import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seedDb } from "./fixtures/seed";
import { signUpCreator, updateOwnCreator } from "@/lib/domain/creators";
import { cancelDigilocker, completeDigilocker, kycSummary, namesMatch, pendingDigilocker, startDigilocker } from "@/lib/domain/kyc";
import { KYC_HANDSHAKE_MS, MIN } from "@/lib/domain/config";
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
