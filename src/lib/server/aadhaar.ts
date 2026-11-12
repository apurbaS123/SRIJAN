// Turning the 12 digits a creator types into the only two things Srijan keeps about them.
//
// The full Aadhaar number is never stored, never logged and never sent back to a browser. What is
// kept is the last 4 digits — which is what support and the ops dashboard show — and a keyed hash
// of all 12, whose only job is to notice the same card arriving on a second account.
//
// The hash is an HMAC under SESSION_SECRET, not a bare SHA-256. A plain hash of a 12-digit number
// would be trivially reversible: there are only a few billion of them, so anyone who got hold of
// the table could simply try them all. With a secret key they can't, unless they have the key too.
import { createHmac } from "node:crypto";
import { isAadhaarNumber } from "@/lib/domain/kyc";
import { DomainError } from "@/lib/domain/util";
import { sessionSecret } from "./env";

export interface AadhaarNumber {
  last4: string;
  numberHash: string;
}

/**
 * Checks the number a creator typed and reduces it to what we keep. Throws something they can act
 * on if it isn't a real Aadhaar number — a mistyped digit is caught here, in front of them, rather
 * than a day later by somebody on the Srijan team.
 *
 * Passing this check says only that the number is well-formed. Whether it is *theirs* is what the
 * uploaded card, read by a person, is for.
 */
export function readAadhaarNumber(raw: unknown): AadhaarNumber {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length !== 12) throw new DomainError("Your Aadhaar number should be 12 digits");
  if (!isAadhaarNumber(digits)) throw new DomainError("That Aadhaar number doesn’t look right — please check it digit by digit");
  return { last4: digits.slice(-4), numberHash: createHmac("sha256", sessionSecret()).update(`aadhaar:${digits}`).digest("base64url") };
}

