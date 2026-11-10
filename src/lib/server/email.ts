// Sign-in codes, help tickets, ops alerts and the "a creator is waiting for your payment" email,
// all through Brevo's transactional email API.
// Configure BREVO_API_KEY and EMAIL_FROM (a sender verified in Brevo); see README.
import { opsEmails } from "./env";

export const emailConfigured = () => !!(process.env.BREVO_API_KEY && process.env.EMAIL_FROM);

/** Sends the 6-digit sign-in code. Returns false (and logs) if it couldn't be sent. Never throws. */
export async function sendEmailCode(email: string, code: string) {
  const apiKey = process.env.BREVO_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return false;
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender: { name: process.env.EMAIL_FROM_NAME || "Srijan", email: from },
        to: [{ email }],
        subject: `${code} is your Srijan sign-in code`,
        htmlContent: `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#1a002e">
  <p style="margin:0 0 16px">Your Srijan sign-in code is</p>
  <p style="margin:0 0 16px;font-size:32px;font-weight:700;letter-spacing:6px">${code}</p>
  <p style="margin:0 0 8px;color:#6b5a7e">It works for 10 minutes. Don’t share it with anyone — the Srijan team will never ask for it.</p>
  <p style="margin:0;color:#6b5a7e">If you didn’t try to sign in, you can ignore this email.</p>
</div>`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return true;
    console.error(`Sign-in email to ${email.replace(/^(.).*@/, "$1…@")} failed: ${res.status} ${(await res.text()).slice(0, 500)}`);
  } catch (e) {
    console.error("Sign-in email failed", e);
  }
  return false;
}

/**
 * Sends an ops alert (such as "job starts in 20 minutes") to every address in SRIJAN_OPS_EMAILS.
 * The first line is the subject. Returns false (and logs) if it couldn't be sent. Never throws.
 */
export function sendOpsAlertEmail(lines: string[]) {
  return sendAlertEmail(opsEmails(), lines, "Open the ops dashboard to act on this.", "Ops alert");
}

/**
 * Sends one person an alert about their own booking — above all "a creator took your job, please
 * pay" — because they may well have closed the site while they waited. Never throws.
 */
export function sendClientAlertEmail(email: string, lines: string[], footer: string) {
  return sendAlertEmail(email ? [email] : [], lines, footer, "Client alert");
}

/** The shared plain-lines email: the first line is the subject, the rest the body. */
async function sendAlertEmail(recipients: string[], lines: string[], footer: string, what: string) {
  const apiKey = process.env.BREVO_API_KEY;
  const from = process.env.EMAIL_FROM;
  const to = recipients.map((email) => ({ email }));
  if (!apiKey || !from || !to.length || !lines.length) return false;
  const [subject, ...rest] = lines;
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender: { name: process.env.EMAIL_FROM_NAME || "Srijan", email: from },
        to,
        subject: subject!,
        htmlContent: `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a002e">
  <h2 style="margin:0 0 16px">${esc(subject!)}</h2>
  ${rest.map((l) => `<p style="margin:0 0 6px">${esc(l)}</p>`).join("")}
  <p style="margin:16px 0 0;color:#6b5a7e">${esc(footer)}</p>
</div>`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return true;
    console.error(`${what} email failed: ${res.status} ${(await res.text()).slice(0, 500)}`);
  } catch (e) {
    console.error(`${what} email failed`, e);
  }
  return false;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface SupportTicket {
  ref: string;
  topic: string;
  subject: string;
  message: string;
  name: string;
  email: string;
  phone?: string;
  bookingCode?: string;
  account?: string;
}

/** Emails a help ticket to the support inbox, with Reply-To set to the person who raised it. Never throws. */
export async function sendSupportTicket(to: string, t: SupportTicket) {
  const apiKey = process.env.BREVO_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return false;
  const rows: [string, string | undefined][] = [
    ["Ticket", t.ref],
    ["Topic", t.topic],
    ["Name", t.name],
    ["Email", t.email],
    ["Phone", t.phone],
    ["Booking reference", t.bookingCode],
    ["Signed in as", t.account],
  ];
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender: { name: process.env.EMAIL_FROM_NAME || "Srijan", email: from },
        to: [{ email: to }],
        replyTo: { email: t.email, name: t.name },
        subject: `[${t.ref}] ${t.topic}: ${t.subject}`,
        htmlContent: `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a002e">
  <h2 style="margin:0 0 16px">New help ticket ${esc(t.ref)}</h2>
  <table style="border-collapse:collapse;margin:0 0 16px">${rows
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:#6b5a7e">${k}</td><td style="padding:4px 0">${esc(v!)}</td></tr>`)
    .join("")}</table>
  <p style="margin:0 0 8px;font-weight:700">${esc(t.subject)}</p>
  <p style="margin:0 0 16px;white-space:pre-wrap">${esc(t.message)}</p>
  <p style="margin:0;color:#6b5a7e">Reply to this email to answer ${esc(t.name)} directly.</p>
</div>`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return true;
    console.error(`Support ticket ${t.ref} email failed: ${res.status} ${(await res.text()).slice(0, 500)}`);
  } catch (e) {
    console.error(`Support ticket ${t.ref} email failed`, e);
  }
  return false;
}
