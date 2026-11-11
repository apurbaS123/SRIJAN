// Creator KYC: how a creator's profile becomes "verified", which is the one gate on taking paid work.
//
// There are two modes, and which one is on depends only on whether the DigiLocker partner keys are
// set (see `creatorVerificationMode` in `src/lib/server/digilocker.ts`):
//
//   "direct"     — no keys: every creator is verified as they sign up, and anyone still waiting for a
//                  check is verified on the next request. This is where Srijan is today.
//   "digilocker" — keys set: a creator verifies their own Aadhaar through DigiLocker, below. Adding
//                  the keys is the whole switch; nothing else has to change.
//
// DigiLocker, the Indian government's document wallet:
//
// The creator signs in to DigiLocker themselves and agrees to share their Aadhaar. DigiLocker sends
// us the name, date of birth and the last 4 digits of the Aadhaar number — never the full number —
// and the profile is verified on the spot, with nobody from Srijan in the loop.
//
// This file is the rules; `src/lib/server/digilocker.ts` does the talking to DigiLocker.
//
// One safety rule: if the name on the Aadhaar doesn't look like the name on the profile, the creator
// is NOT verified automatically. It goes to the Srijan team instead, with both names shown, because
// a mismatch is either a typo or somebody using another person's documents.

import { KYC_HANDSHAKE_MS } from "./config";
import type { Creator, DB, DigilockerKyc } from "./types";
import { assert, newId } from "./util";

/** How creators get verified right now. Set by whether the DigiLocker partner keys are configured. */
export type VerificationMode = "digilocker" | "direct";

/**
 * Direct verification: nobody has to check anything, so every creator waiting for a check is
 * verified. Runs on every request while the mode is "direct", so a creator who signed up before the
 * switch isn't left waiting for a review that no longer happens.
 *
 * Two kinds of creator are left alone: one DigiLocker flagged (a name that doesn't match, or an
 * Aadhaar already used — those are the Srijan team's to judge, whatever the mode), and one the team
 * has already rejected.
 */
export function verifyWaitingCreators(db: DB) {
  for (const c of db.creators) {
    if (c.verification !== "pending" || c.kyc.digilocker?.review) continue;
    c.verification = "verified";
  }
}

/** Honorifics and initials that shouldn't decide whether two names are the same person. */
const TITLES = new Set(["mr", "mrs", "ms", "miss", "dr", "shri", "smt", "sri", "md"]);

/** Letters, spaces and nothing else: "Apurba  Kr. Sarmah!" → ["apurba", "kr", "sarmah"] */
function nameParts(raw: string) {
  return raw
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !TITLES.has(w));
}

/**
 * Do these two names belong to the same person? Every part of the shorter name has to appear in the
 * longer one, so "Apurba Sarmah" matches "Apurba Kumar Sarmah" (Aadhaar often carries a middle name
 * the person doesn't type), while "Apurba Sarmah" and "Rituraj Das" don't match.
 */
export function namesMatch(a: string, b: string) {
  const x = nameParts(a);
  const y = nameParts(b);
  if (!x.length || !y.length) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  const pool = new Set(long);
  return short.every((part) => pool.has(part));
}

function creatorOrThrow(db: DB, creatorId: string) {
  const c = db.creators.find((x) => x.id === creatorId);
  assert(c, "Creator not found", 404);
  return c;
}

/**
 * Opens a DigiLocker handshake for this creator and returns the one-time values the sign-in link
 * needs. Starting a new one replaces any half-finished attempt, so a creator who gave up part-way
 * through can simply press the button again.
 */
export function startDigilocker(db: DB, creatorId: string, now: number) {
  const c = creatorOrThrow(db, creatorId);
  assert(c.verification !== "rejected", "Your profile wasn’t approved. Please contact Srijan support.");
  assert(!isDigilockerVerified(c), "Your Aadhaar is already verified");
  assert(c.kyc.digilocker?.review !== "duplicate", "This Aadhaar is already verified on another Srijan account. Please contact Srijan support.");
  const state = newId("dlk");
  // PKCE: DigiLocker gets a hash of this now and we show the original when swapping the code for a
  // token, which proves the reply came back to the app that started it.
  const verifier = `${newId("ver")}${newId("ver")}`.replace(/_/g, "");
  c.kyc.digilocker = { ...c.kyc.digilocker, state, verifier, startedAt: now, review: undefined };
  return { state, verifier };
}

/** The handshake this `state` belongs to, if it is still open. Nothing is changed. */
export function pendingDigilocker(db: DB, state: string, now: number) {
  if (!state) return null;
  const creator = db.creators.find((c) => c.kyc.digilocker?.state === state);
  const dl = creator?.kyc.digilocker;
  if (!creator || !dl?.verifier) return null;
  if (now - (dl.startedAt ?? 0) > KYC_HANDSHAKE_MS) return null;
  return { creator, verifier: dl.verifier };
}

/** Closes the handshake without verifying anything — the creator can start again. */
export function cancelDigilocker(db: DB, creatorId: string) {
  const c = db.creators.find((x) => x.id === creatorId);
  if (!c?.kyc.digilocker) return;
  c.kyc.digilocker = { ...c.kyc.digilocker, state: undefined, verifier: undefined, startedAt: undefined };
}

/** What DigiLocker tells us about the person who just signed in. */
export interface DigilockerIdentity {
  name: string;
  dob?: string;
  gender?: string;
  /** Last 4 digits of their Aadhaar number. Nothing longer is ever passed in. */
  aadhaarLast4?: string;
  /** DigiLocker's own id for this person. */
  digilockerId?: string;
  /** True when their PAN card was found in their DigiLocker. */
  pan?: boolean;
}

export type KycOutcome = "verified" | "needs_review" | "already_used";

/**
 * DigiLocker has confirmed who the creator is. Verifies the profile when the names agree, and hands
 * it to the Srijan team when they don't.
 *
 * `already_used` means another Srijan account has had the same Aadhaar verified: one person, one
 * creator account, so this attempt is refused and the team is left to sort it out.
 */
export function completeDigilocker(db: DB, creatorId: string, identity: DigilockerIdentity, now: number): { creator: Creator; outcome: KycOutcome } {
  const c = creatorOrThrow(db, creatorId);
  const taken =
    !!identity.digilockerId &&
    db.creators.some((x) => x.id !== c.id && x.kyc.digilocker?.verifiedAt && x.kyc.digilocker.digilockerId === identity.digilockerId);

  const dl: DigilockerKyc = {
    verifiedAt: now,
    name: identity.name,
    dob: identity.dob,
    gender: identity.gender,
    aadhaarLast4: identity.aadhaarLast4,
    digilockerId: identity.digilockerId,
    pan: !!identity.pan,
  };

  if (taken) {
    // Keep what came back so the team can see the clash, but don't verify anything.
    c.kyc.digilocker = { ...dl, review: "duplicate" };
    return { creator: c, outcome: "already_used" };
  }

  if (!namesMatch(identity.name, c.name)) {
    // The documents are real, but we can't say they're this creator's. Nothing is ticked off and the
    // profile stays "pending" for the Srijan team. A creator already verified stays verified.
    c.kyc.digilocker = { ...dl, review: "name_mismatch" };
    return { creator: c, outcome: "needs_review" };
  }

  c.kyc.digilocker = dl;
  c.kyc.aadhaar = true;
  if (identity.pan) c.kyc.pan = true;
  if (c.verification === "pending") c.verification = "verified";
  return { creator: c, outcome: "verified" };
}

export function isDigilockerVerified(c: Creator) {
  return !!c.kyc.digilocker?.verifiedAt && !c.kyc.digilocker.review;
}

/**
 * The creator's KYC, safe to send to a browser or show the Srijan team: no handshake secrets, and
 * no more of the Aadhaar than its last 4 digits (which is all that was ever stored).
 */
export function kycSummary(c: Creator) {
  const dl = c.kyc.digilocker;
  return {
    aadhaar: c.kyc.aadhaar,
    pan: c.kyc.pan,
    digilocker:
      dl?.verifiedAt && !dl.review
        ? {
            verifiedAt: dl.verifiedAt,
            name: dl.name,
            dob: dl.dob,
            aadhaarLast4: dl.aadhaarLast4,
            pan: !!dl.pan,
          }
        : null,
    /** A DigiLocker reply the Srijan team still has to look at, with the name it came back with. */
    needsReview: dl?.review ? { reason: dl.review, name: dl.name ?? "", aadhaarLast4: dl.aadhaarLast4 } : null,
  };
}
export type KycSummary = ReturnType<typeof kycSummary>;
