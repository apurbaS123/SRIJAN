import { NextResponse } from "next/server";
import { api, readJson } from "@/lib/server/api";
import { IS_PROD, normalizeEmail } from "@/lib/server/env";
import { issueOtp } from "@/lib/server/auth";
import { limitByIp } from "@/lib/server/rateLimit";
import { emailConfigured, sendEmailCode } from "@/lib/server/email";
import { assert } from "@/lib/domain/util";

/** Emails a 6-digit sign-in code. */
export async function POST(req: Request) {
  const limited = await limitByIp("otp", 10, 60 * 60_000);
  if (limited) return limited;
  const body = await readJson<{ email?: string }>(req);
  if (IS_PROD && !emailConfigured()) {
    console.error("Sign-in codes can't be sent: set BREVO_API_KEY and EMAIL_FROM");
    return NextResponse.json({ ok: false, error: "Sign-in is temporarily unavailable. Please try again later." }, { status: 503 });
  }
  let code: string | undefined;
  const email = normalizeEmail(body.email);
  const res = await api(({ db, now }) => {
    assert(email, "Enter a valid email address");
    code = issueOtp(db, email, now);
    return { sent: true };
  });
  if (!res.ok || !code) return res;
  if (emailConfigured()) {
    if (!(await sendEmailCode(email, code))) {
      return NextResponse.json({ ok: false, error: "We couldn’t send the code. Check the email address and try again." }, { status: 502 });
    }
  } else {
    // Development without Brevo set up: read the code from the server log.
    console.log(`[dev] Sign-in code for ${email}: ${code}`);
  }
  return res;
}
