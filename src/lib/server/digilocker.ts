// DigiLocker (MeriPehchaan) OAuth 2.0, the government's own API. Called only from the server: the
// client secret must never reach a browser.
//
// Set DIGILOCKER_CLIENT_ID and DIGILOCKER_CLIENT_SECRET (see README → Creator KYC with DigiLocker).
// The two host names and the scope are settings too, because DigiLocker gives each partner its own
// in the onboarding email and they have changed before — see the defaults below.
//
// The flow, which is the standard authorization-code-with-PKCE one:
//   1. We send the creator to `authorizeUrl` with a one-time `state` and the hash of a `verifier`.
//   2. They sign in to DigiLocker and agree to share their Aadhaar.
//   3. DigiLocker sends them back to our callback with a short-lived `code`.
//   4. We swap that code and the original `verifier` for a token, which comes back with their name,
//      date of birth and gender. Their Aadhaar's last 4 digits and PAN are then looked up with it.
//
// We ask DigiLocker for the least it will give us and keep less: the full Aadhaar number is never
// stored (see `kyc.ts`).

import { createHash } from "node:crypto";
import { DomainError } from "@/lib/domain/util";
import type { DigilockerIdentity, VerificationMode } from "@/lib/domain/kyc";
import { siteUrl } from "./env";

/** Where the creator signs in. The end-to-end test points this at a fake DigiLocker. */
const authBase = () => (process.env.DIGILOCKER_AUTH_BASE || "https://digilocker.meripehchaan.gov.in").replace(/\/+$/, "");
/** Where the documents are read from, once we have a token. */
const apiBase = () => (process.env.DIGILOCKER_API_BASE || "https://api.digitallocker.gov.in").replace(/\/+$/, "");

export class DigilockerError extends Error {}

export function digilockerConfigured() {
  return !!process.env.DIGILOCKER_CLIENT_ID && !!process.env.DIGILOCKER_CLIENT_SECRET;
}

/**
 * How creators get verified right now — **the one switch for creator KYC**.
 *
 * With no DigiLocker partner keys there is nothing to verify against, so creators are verified
 * directly as they sign up and go online straight away. Setting DIGILOCKER_CLIENT_ID and
 * DIGILOCKER_CLIENT_SECRET turns Aadhaar verification back on by itself, for creators who sign up
 * from then on; everyone already verified stays verified.
 */
export function creatorVerificationMode(): VerificationMode {
  return digilockerConfigured() ? "digilocker" : "direct";
}

export function assertDigilockerConfigured() {
  if (!digilockerConfigured()) {
    throw new DomainError("DigiLocker verification isn’t set up yet. The Srijan team will verify your profile by hand.", 503);
  }
}

/**
 * Where DigiLocker sends the creator back to. It has to match what was registered with DigiLocker
 * exactly, so it is a setting; otherwise it is built from the site's own address.
 */
export function redirectUri() {
  const explicit = (process.env.DIGILOCKER_REDIRECT_URI || "").trim();
  if (explicit) return explicit;
  const site = siteUrl();
  if (!site) throw new DomainError("DigiLocker verification isn’t set up yet: this server doesn’t know its own address.", 503);
  return `${site}/api/kyc/digilocker/callback`;
}

/** PKCE: DigiLocker is given this hash now and checks the original against it later. */
function codeChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** The link that sends a creator to DigiLocker to sign in and share their Aadhaar. */
export function authorizeUrl(state: string, verifier: string) {
  assertDigilockerConfigured();
  const u = new URL(`${authBase()}/public/oauth2/1/authorize`);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", process.env.DIGILOCKER_CLIENT_ID!);
  u.searchParams.set("redirect_uri", redirectUri());
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", codeChallenge(verifier));
  u.searchParams.set("code_challenge_method", "S256");
  // "signin" is DigiLocker's own sign-in-and-share-eKYC journey.
  u.searchParams.set("dl_flow", process.env.DIGILOCKER_FLOW || "signin");
  const scope = (process.env.DIGILOCKER_SCOPE || "").trim();
  if (scope) u.searchParams.set("scope", scope);
  return u.toString();
}

interface TokenResponse {
  access_token?: string;
  id_token?: string;
  digilockerid?: string;
  name?: string;
  dob?: string;
  gender?: string;
  eaadhaar?: string;
  reference_key?: string;
  error?: string;
  error_description?: string;
}

/** The middle part of a JWT, which is plain JSON. Used only as a fallback for the name fields. */
function idTokenClaims(idToken: string | undefined): Record<string, unknown> {
  try {
    const body = idToken?.split(".")[1];
    return body ? (JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function exchangeCode(code: string, verifier: string) {
  assertDigilockerConfigured();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: process.env.DIGILOCKER_CLIENT_ID!,
    client_secret: process.env.DIGILOCKER_CLIENT_SECRET!,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
  });
  const res = await fetch(`${authBase()}/public/oauth2/1/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => null)) as TokenResponse | null;
  if (!res.ok || !json?.access_token) {
    throw new DigilockerError(json?.error_description || json?.error || `DigiLocker replied ${res.status}`);
  }
  return json;
}

async function get(path: string, accessToken: string) {
  const res = await fetch(`${apiBase()}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new DigilockerError(`DigiLocker replied ${res.status} for ${path}`);
  return res;
}

/**
 * The last 4 digits of the Aadhaar number, from the e-Aadhaar DigiLocker holds. Best-effort: it is
 * only shown back to the creator and the Srijan team, so a creator is never blocked by it going
 * missing. Nothing longer than these 4 digits leaves this function.
 */
async function aadhaarLast4(accessToken: string) {
  try {
    const xml = await (await get("/public/oauth2/3/xml/eaadhaar", accessToken)).text();
    const uid = /\buid\s*=\s*"([^"]+)"/.exec(xml)?.[1] ?? "";
    const digits = uid.replace(/\D/g, "");
    return digits.length >= 4 ? digits.slice(-4) : undefined;
  } catch {
    return undefined;
  }
}

/** Is their PAN card in their DigiLocker? Best-effort, and only ever a yes/no — never the number. */
async function hasPan(accessToken: string) {
  try {
    const json = (await (await get("/public/oauth2/2/files/issued", accessToken)).json()) as { items?: { doctype?: string }[] } | null;
    return !!json?.items?.some((d) => String(d.doctype ?? "").toUpperCase() === "PANCR");
  } catch {
    return false;
  }
}

/**
 * Finishes the handshake: swaps the code for a token and returns who DigiLocker says this is.
 * Throws `DigilockerError` if DigiLocker refuses or doesn't tell us a name.
 */
export async function fetchIdentity(code: string, verifier: string): Promise<DigilockerIdentity> {
  const token = await exchangeCode(code, verifier);
  const claims = idTokenClaims(token.id_token);
  const str = (...values: unknown[]) => {
    for (const v of values) if (typeof v === "string" && v.trim()) return v.trim();
    return undefined;
  };
  const name = str(token.name, claims.name, claims.given_name);
  if (!name) throw new DigilockerError("DigiLocker didn’t share your name. Please try again.");
  const [last4, pan] = await Promise.all([aadhaarLast4(token.access_token!), hasPan(token.access_token!)]);
  return {
    name,
    dob: str(token.dob, claims.dob, claims.birthdate),
    gender: str(token.gender, claims.gender),
    aadhaarLast4: last4,
    digilockerId: str(token.digilockerid, claims.digilockerid, claims.sub),
    pan,
  };
}
