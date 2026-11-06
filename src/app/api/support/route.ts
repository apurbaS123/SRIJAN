import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { api, readJson } from "@/lib/server/api";
import { IS_PROD, normalizeEmail, normalizePhone } from "@/lib/server/env";
import { limitByIp } from "@/lib/server/rateLimit";
import { emailConfigured, sendSupportTicket, type SupportTicket } from "@/lib/server/email";
import { SUPPORT_EMAIL, SUPPORT_PHONE, SUPPORT_TOPICS } from "@/lib/domain/config";
import { assert } from "@/lib/domain/util";

const clean = (v: unknown, max: number) => String(v ?? "").replace(/\r\n?/g, "\n").trim().slice(0, max);
const oneLine = (v: unknown, max: number) => clean(v, max).replace(/\s+/g, " ");

/** Raises a help ticket: emails it to the support inbox and returns the ticket reference. */
export async function POST(req: Request) {
  const limited = await limitByIp("support", 5, 60 * 60_000);
  if (limited) return limited;
  const body = await readJson(req);
  if (IS_PROD && !emailConfigured()) {
    console.error("Help tickets can't be sent: set BREVO_API_KEY and EMAIL_FROM");
    return NextResponse.json({ ok: false, error: `Help tickets are unavailable right now. Please call us on ${SUPPORT_PHONE}.` }, { status: 503 });
  }

  let ticket: SupportTicket | undefined;
  const res = await api(({ user }) => {
    const name = oneLine(body.name, 100);
    const email = normalizeEmail(body.email);
    const topic = oneLine(body.topic, 60);
    const subject = oneLine(body.subject, 150);
    const message = clean(body.message, 5000);
    const rawPhone = oneLine(body.phone, 20);
    assert(name, "Enter your name");
    assert(email, "Enter a valid email address so we can reply");
    assert((SUPPORT_TOPICS as readonly string[]).includes(topic), "Choose what your question is about");
    assert(subject, "Add a short subject");
    assert(message.length >= 10, "Tell us a little more in the message");
    assert(!rawPhone || normalizePhone(rawPhone), "Enter a valid 10-digit mobile number, or leave it empty");
    const ref = `HLP-${Date.now().toString(36).toUpperCase().slice(-5)}${randomInt(36 ** 3).toString(36).toUpperCase().padStart(3, "0")}`;
    ticket = {
      ref,
      topic,
      subject,
      message,
      name,
      email,
      phone: normalizePhone(rawPhone) || undefined,
      bookingCode: oneLine(body.bookingCode, 40) || undefined,
      account: user ? `${user.name} (${user.role}${user.email ? `, ${user.email}` : ""})` : undefined,
    };
    return { ref };
  });
  if (!res.ok || !ticket) return res;

  if (emailConfigured()) {
    if (!(await sendSupportTicket(SUPPORT_EMAIL, ticket))) {
      return NextResponse.json({ ok: false, error: `We couldn’t send your ticket. Please try again or call us on ${SUPPORT_PHONE}.` }, { status: 502 });
    }
  } else {
    // Development without Brevo set up: read the ticket from the server log.
    console.log(`[dev] Help ticket for ${SUPPORT_EMAIL}:`, ticket);
  }
  return res;
}
