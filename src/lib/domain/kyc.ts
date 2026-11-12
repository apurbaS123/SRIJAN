// Creator KYC: how a creator's profile becomes "verified", which is the one gate on taking paid work.
//
// There are two modes, and which one is on depends only on whether the DigiLocker partner keys are
// set (see `creatorVerificationMode` in `src/lib/server/digilocker.ts`):
//
//   "manual"     — no keys: the creator uploads photos of both sides of their Aadhaar when they sign
//                  up, and somebody on the Srijan team looks at them and approves the profile from
//                  the ops dashboard. Nobody is verified automatically, and an unverified creator
//                  cannot go online or accept a job. This is where Srijan is today.
//   "digilocker" — keys set: a creator verifies their own Aadhaar through DigiLocker, below. Adding
//                  the keys is the whole switch; nothing else has to change, and creators already
//                  verified by hand stay verified.
//
// DigiLocker, the Indian government's document wallet:
//
// The creator signs in to DigiLocker themselves and agrees to share their Aadhaar. DigiLocker sends
// us the name, date of birth and the last 4 digits of the Aadhaar number — never the full number —
// and the profile is verified on the spot, with nobody from Srijan in the loop.
//
// This file is the rules; `src/lib/server/digilocker.ts` does the talking to DigiLocker and
// `src/lib/server/uploads.ts` holds the uploaded documents, which never go in the marketplace data.
//
// One safety rule, in both modes: if the name on the Aadhaar doesn't look like the name on the
// profile, the creator is NOT verified automatically. It goes to the Srijan team instead, with both
// names shown, because a mismatch is either a typo or somebody using another person's documents.

import { KYC_HANDSHAKE_MS } from "./config";
import type { AadhaarDoc, Creator, DB, DigilockerKyc, UploadRef } from "./types";
import { assert, cleanText, newId } from "./util";

/** How creators get verified right now. Set by whether the DigiLocker partner keys are configured. */
export type VerificationMode = "digilocker" | "manual";

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

// ── Aadhaar checked by hand ───────────────────────────────────────────────────

/** Verhoeff's dihedral multiplication table, used by the Aadhaar check digit. */
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/**
 * Is this a real Aadhaar number? Twelve digits that don't start with 0 or 1, ending in a Verhoeff
 * check digit — the same check UIDAI's own forms use. It catches a mistyped digit before the
 * creator waits a day for the Srijan team to tell them, but it says nothing about whether the
 * number belongs to them: only the uploaded card, read by a person, does that.
 */
export function isAadhaarNumber(digits: string) {
  if (!/^[2-9]\d{11}$/.test(digits)) return false;
  let c = 0;
  const reversed = digits.split("").reverse().map(Number);
  reversed.forEach((d, i) => {
    c = VERHOEFF_D[c]![VERHOEFF_P[i % 8]![d]!]!;
  });
  return c === 0;
}

/** Everything the server worked out about the Aadhaar before it reached these rules. */
export interface AadhaarSubmission {
  /** The name printed on the card, as the creator typed it. */
  name: string;
  /** Last 4 digits of the number. Nothing longer is ever passed in. */
  last4: string;
  /** Keyed hash of all 12 digits, used only to spot the same card on a second account. */
  numberHash: string;
  front: UploadRef;
  back: UploadRef;
}

/**
 * The creator has uploaded both sides of their Aadhaar. Nothing is verified here: the profile goes
 * to the Srijan team, who look at the photos and approve or reject it from the ops dashboard.
 *
 * Uploading again replaces what was there before — which is how a creator answers "the photo was
 * too blurry to read" — and puts the profile back in the team's queue. The files it replaced are
 * returned so the caller can delete them from the document store.
 *
 * If the same Aadhaar is already on another Srijan account the submission is kept but flagged:
 * one person, one creator account, and the team decides which one it is.
 */
export function submitAadhaar(db: DB, creatorId: string, input: AadhaarSubmission, now: number) {
  const c = creatorOrThrow(db, creatorId);
  assert(!c.kyc.aadhaar, "Your Aadhaar is already verified");
  assert(c.kyc.aadhaarDoc?.review !== "duplicate", "This Aadhaar is already on another Srijan account. Please contact Srijan support.");
  const name = cleanText(input.name, 80, "the name printed on your Aadhaar");
  assert(name.length >= 2, "Enter the name printed on your Aadhaar");
  assert(/^\d{4}$/.test(input.last4) && !!input.numberHash, "That Aadhaar number doesn’t look right");

  const replaced = c.kyc.aadhaarDoc ? [c.kyc.aadhaarDoc.front, c.kyc.aadhaarDoc.back] : [];
  // Any other account that sent in the same card — approved or still waiting — is a clash the team
  // has to settle, so flag it rather than quietly letting both through.
  const clash = db.creators.some((x) => x.id !== c.id && x.kyc.aadhaarDoc?.numberHash === input.numberHash);
  const doc: AadhaarDoc = {
    name,
    last4: input.last4,
    numberHash: input.numberHash,
    front: input.front,
    back: input.back,
    submittedAt: now,
    review: clash ? "duplicate" : undefined,
  };
  c.kyc.aadhaarDoc = doc;
  // Back into the queue: a creator the team sent away can fix their photos and ask again.
  if (c.verification === "rejected") c.verification = "pending";
  return { creator: c, replaced, duplicate: clash };
}

/** Has this creator sent in an Aadhaar for the Srijan team to look at? */
export function hasAadhaarOnFile(c: Creator) {
  return !!c.kyc.aadhaarDoc;
}

/** The two uploaded files on a creator's record, if any — used when the documents are deleted. */
export function aadhaarUploadIds(c: Creator) {
  const d = c.kyc.aadhaarDoc;
  return d ? [d.front.id, d.back.id] : [];
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
 * The creator's KYC, safe to send to a browser or show the Srijan team: no handshake secrets, no
 * hash of the Aadhaar number, and no more of the number itself than its last 4 digits (which is
 * all that was ever stored).
 *
 * The two document ids are in here because both the Srijan team and the creator who uploaded them
 * are allowed to look at the photos; `/api/kyc/document/<id>` is what decides who actually can.
 */
export function kycSummary(c: Creator) {
  const dl = c.kyc.digilocker;
  const doc = c.kyc.aadhaarDoc;
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
    /** The Aadhaar the creator uploaded for the Srijan team to check by hand. */
    aadhaarDoc: doc
      ? {
          name: doc.name,
          last4: doc.last4,
          frontId: doc.front.id,
          backId: doc.back.id,
          submittedAt: doc.submittedAt,
          checkedAt: doc.checkedAt,
          /** Why the team sent it back. The creator reads this and uploads again. */
          rejectedNote: doc.rejectedNote,
          /** Already on another Srijan account: the team has to settle it. */
          duplicate: doc.review === "duplicate",
          /** The card says one name and the profile another — worth a second look before approving. */
          nameMismatch: !namesMatch(doc.name, c.name),
        }
      : null,
    /** A DigiLocker reply the Srijan team still has to look at, with the name it came back with. */
    needsReview: dl?.review ? { reason: dl.review, name: dl.name ?? "", aadhaarLast4: dl.aadhaarLast4 } : null,
  };
}
export type KycSummary = ReturnType<typeof kycSummary>;
