import { NextResponse } from "next/server";
import { api, readJson } from "@/lib/server/api";
import { IS_PROD, normalizePhone } from "@/lib/server/env";
import { issueOtp } from "@/lib/server/auth";
import { limitByIp } from "@/lib/server/rateLimit";
import { sendWhatsAppOtp } from "@/lib/server/whatsapp";
import { assert } from "@/lib/domain/util";

const otpConfigured = () => !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_OTP_TEMPLATE);

/** Sends a 6-digit sign-in code to the phone on WhatsApp. */
export async function POST(req: Request) {
  const limited = await limitByIp("otp", 10, 60 * 60_000);
  if (limited) return limited;
  const body = await readJson<{ phone?: string }>(req);
  if (IS_PROD && !otpConfigured()) {
    console.error("Sign-in codes can't be sent: set WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_OTP_TEMPLATE");
    return NextResponse.json({ ok: false, error: "Sign-in is temporarily unavailable. Please try again later." }, { status: 503 });
  }
  let code: string | undefined;
  const phone = normalizePhone(body.phone);
  const res = await api(({ db, now }) => {
    assert(phone, "Enter a valid 10-digit Indian mobile number");
    code = issueOtp(db, phone, now);
    return { sent: true };
  });
  if (!res.ok || !code) return res;
  if (otpConfigured()) {
    if (!(await sendWhatsAppOtp(phone, code))) {
      return NextResponse.json({ ok: false, error: "We couldn’t send the code. Check the number is on WhatsApp and try again." }, { status: 502 });
    }
  } else {
    // Development without WhatsApp set up: read the code from the server log.
    console.log(`[dev] Sign-in code for ${phone}: ${code}`);
  }
  return res;
}
