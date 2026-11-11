// Where DigiLocker sends the creator back to after they've signed in and shared their Aadhaar.
//
// This is a normal page visit in the creator's browser, not an API call, so it always answers with a
// redirect back to /creator/kyc and never with JSON. The `state` in the link is what ties the reply
// to the handshake we opened, so a reply nobody asked for is thrown away.
import { NextResponse } from "next/server";
import { signedInUserId } from "@/lib/server/api";
import { withDb } from "@/lib/server/store";
import { DigilockerError, fetchIdentity } from "@/lib/server/digilocker";
import { cancelDigilocker, completeDigilocker, pendingDigilocker, type DigilockerIdentity } from "@/lib/domain/kyc";

function back(req: Request, result: string, message?: string) {
  const url = new URL("/creator/kyc", req.url);
  url.searchParams.set("result", result);
  if (message) url.searchParams.set("message", message);
  return NextResponse.redirect(url);
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const state = q.get("state") ?? "";
  const code = q.get("code") ?? "";

  // DigiLocker says the creator backed out, or something went wrong on their side.
  const refused = q.get("error_description") || q.get("error");
  if (refused || !code) {
    await withDb((db, now) => {
      const open = pendingDigilocker(db, state, now);
      if (open) cancelDigilocker(db, open.creator.id);
    });
    return back(req, "cancelled");
  }

  // 1. Find the handshake and take the PKCE verifier, before any network call.
  const started = await withDb((db, now) => {
    const open = pendingDigilocker(db, state, now);
    if (!open) return null;
    return { creatorId: open.creator.id, userId: open.creator.userId, verifier: open.verifier };
  });
  const handshake = started.result;
  if (!handshake) return back(req, "expired");

  // Whoever is signed in must be the creator who started it. Not signed in at all is fine: the
  // one-time `state` is what proves this reply belongs to them, and a browser can drop the cookie
  // on the way back from another site.
  const signedIn = await signedInUserId();
  if (signedIn && signedIn !== handshake.userId) return back(req, "failed", "Please sign in as the creator who started this and try again.");

  // 2. Swap the code for the person's details. Outside the database lock: it reaches the internet.
  let identity: DigilockerIdentity;
  try {
    identity = await fetchIdentity(code, handshake.verifier);
  } catch (e) {
    await withDb((db) => cancelDigilocker(db, handshake.creatorId));
    const message = e instanceof DigilockerError ? e.message : "DigiLocker couldn’t be reached. Please try again.";
    if (!(e instanceof DigilockerError)) console.error(e);
    return back(req, "failed", message);
  }

  // 3. Verify the profile (or hand it to the Srijan team).
  const done = await withDb((db, now) => completeDigilocker(db, handshake.creatorId, identity, now).outcome);
  return back(req, done.result);
}
