import { api } from "@/lib/server/api";
import { startDigilocker } from "@/lib/domain/kyc";
import { assertDigilockerConfigured, authorizeUrl } from "@/lib/server/digilocker";
import { limitByIp } from "@/lib/server/rateLimit";

/**
 * Starts DigiLocker verification: opens a one-time handshake and replies with the link to send the
 * creator to. Nothing is verified here — that's the callback, once DigiLocker replies.
 */
export async function POST() {
  const limited = await limitByIp("kyc", 10, 10 * 60_000);
  if (limited) return limited;
  // Checked before the database is locked, so a server with no DigiLocker keys fails fast.
  assertDigilockerConfigured();
  return api(
    ({ db, user, now }) => {
      const { state, verifier } = startDigilocker(db, user!.creatorId!, now);
      return { url: authorizeUrl(state, verifier) };
    },
    { role: "creator" },
  );
}
