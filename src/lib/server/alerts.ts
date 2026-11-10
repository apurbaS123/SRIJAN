// Ops alerts that aren't tied to one request: the "starts in 20 minutes" reminder raised by the
// time-based tick. Sent on every channel that is configured, so one missing setting isn't silence.
import { after } from "next/server";
import { sendOpsAlertEmail } from "./email";
import { sendWhatsAppAlert } from "./whatsapp";

/** Never throws and never blocks the reply. */
async function deliver(lines: string[]) {
  await Promise.all([sendWhatsAppAlert(lines), sendOpsAlertEmail(lines)]);
}

/**
 * Hands the alerts to the platform to finish after the reply is sent. Outside a request (tests,
 * scripts) `after` isn't available, so they go out in the background instead.
 */
export function sendOpsAlerts(alerts: string[][]) {
  for (const lines of alerts) {
    try {
      after(() => deliver(lines));
    } catch {
      void deliver(lines).catch((e) => console.error("Ops alert failed", e));
    }
  }
}
