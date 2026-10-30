// Booking and campaign alerts to the owner's WhatsApp via the Meta WhatsApp Cloud API.
// Configure in .env.local (see README); with no config, alerts are skipped.
import { findPackage, findZone } from "@/lib/domain/config";
import type { Booking, Campaign, DB } from "@/lib/domain/types";

const GRAPH_VERSION = "v21.0";

function istDateTime(ms: number) {
  return new Date(ms).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Every detail of a new booking as plain lines. */
export function bookingAlertLines(db: DB, b: Booking): string[] {
  const client = db.users.find((u) => u.id === b.clientId);
  const pkg = findPackage(b.packageId);
  const place = findZone(b.cityId, b.zoneId);
  const requested = b.requestedCreatorId ? db.creators.find((c) => c.id === b.requestedCreatorId) : undefined;
  const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
  return [
    `New booking ${b.code}`,
    `Package: ${pkg?.name ?? b.packageId}`,
    `When: ${istDateTime(b.scheduledAt)} IST`,
    `Where: ${b.address}, ${place ? `${place.zone.name}, ${place.city.name}` : `${b.zoneId}, ${b.cityId}`}`,
    `Client: ${client?.name ?? "Unknown"}${client?.phone ? ` · ${client.phone}` : ""}${client?.email ? ` · ${client.email}` : ""}`,
    `Brief: ${b.brief}`,
    `Format: ${b.aspect}`,
    ...(b.referenceUrl ? [`Reference: ${b.referenceUrl}`] : []),
    ...(requested ? [`Requested creator: ${requested.name}`] : []),
    `Paid: ${inr(b.total)} (${inr(b.price)} + GST ${inr(b.gst)})`,
    `Start code: ${b.otp}`,
    `Delivery due: ${istDateTime(b.deliveryDueAt)} IST`,
  ];
}

/** Every detail of a brand's campaign request as plain lines. */
export function campaignAlertLines(c: Campaign): string[] {
  const mode = { video: "Video call", phone: "Phone call", office: "Office visit" }[c.callMode];
  return [
    `New brand campaign ${c.code}`,
    `Brand: ${c.brandName}`,
    `Contact: ${c.contactName} · ${c.phone} · ${c.email}`,
    `Strategy call: ${istDateTime(c.callAt)} IST · ${mode}`,
    `Goal: ${c.goal}`,
    `Regions: ${c.regions.join(", ")}`,
    `Budget: ${c.budgetRange}`,
  ];
}

type Content = Record<string, unknown>;

function whatsAppConfig() {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  return token && phoneNumberId ? { token, phoneNumberId } : null;
}

/** Sends one message; returns false (and logs) on failure. Never throws. */
async function send(to: string, content: Content, timeoutMs = 10_000) {
  const cfg = whatsAppConfig();
  if (!cfg) return false;
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, ...content }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) return true;
    console.error(`WhatsApp message to …${to.slice(-4)} failed: ${res.status} ${(await res.text()).slice(0, 500)}`);
  } catch (e) {
    console.error(`WhatsApp message to …${to.slice(-4)} failed`, e);
  }
  return false;
}

/**
 * Sends the lines to every number in WHATSAPP_NOTIFY_TO. Uses the approved template in
 * WHATSAPP_TEMPLATE when set (needed outside WhatsApp's 24 h reply window), otherwise plain text.
 */
export async function sendWhatsAppAlert(lines: string[]) {
  const recipients = (process.env.WHATSAPP_NOTIFY_TO ?? "")
    .split(",")
    .map((n) => n.replace(/\D/g, ""))
    .filter(Boolean);
  if (!whatsAppConfig() || recipients.length === 0) return;

  const template = process.env.WHATSAPP_TEMPLATE;
  // Template variables can't contain newlines, tabs or 4+ spaces, and are capped in length.
  const oneLine = lines.join(" · ").replace(/\s+/g, " ").slice(0, 1000);
  const content: Content = template
    ? {
        type: "template",
        template: {
          name: template,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "en" },
          components: [{ type: "body", parameters: [{ type: "text", text: oneLine }] }],
        },
      }
    : { type: "text", text: { preview_url: false, body: lines.join("\n").slice(0, 4000) } };

  await Promise.all(recipients.map((to) => send(to, content)));
}
