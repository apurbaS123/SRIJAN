// Sign-in codes by email through Brevo's transactional email API.
// Configure BREVO_API_KEY and EMAIL_FROM (a sender verified in Brevo); see README.

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
