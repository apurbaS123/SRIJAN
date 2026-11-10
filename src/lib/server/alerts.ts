// Alerts to the Srijan team: what a new booking, a brand campaign request or a job about to start
// looks like, and getting it to them. Email only — see sendOpsAlertEmail for the channel.
import { after } from "next/server";
import { CREATOR_SHARE, findPackage, findZone } from "@/lib/domain/config";
import type { Booking, Campaign, DB } from "@/lib/domain/types";
import { rupees } from "@/lib/domain/util";
import { siteUrl } from "./env";
import { sendClientAlertEmail, sendOpsAlertEmail } from "./email";

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
    b.online ? "Where: Online job" : `Where: ${b.address}, ${place ? `${place.zone.name}, ${place.city.name}` : `${b.zoneId}, ${b.cityId}`}`,
    `Client: ${client?.name ?? "Unknown"}${client?.phone ? ` · ${client.phone}` : ""}${client?.email ? ` · ${client.email}` : ""}`,
    `Brief: ${b.brief}`,
    `Format: ${b.aspect}`,
    ...(b.referenceUrl ? [`Reference: ${b.referenceUrl}`] : []),
    ...(requested ? [`Requested creator: ${requested.name}`] : []),
    b.paidAt ? `Paid: ${inr(b.total)}` : `To pay: ${inr(b.total)} — the client pays once a creator accepts`,
  ];
}

/** "A creator took your job, now pay for it", for the client's inbox. The first line is the subject. */
export function paymentRequestLines(db: DB, b: Booking): string[] {
  const creator = db.creators.find((c) => c.id === b.creatorId);
  const pkg = findPackage(b.packageId);
  const place = findZone(b.cityId, b.zoneId);
  const minutes = Math.max(1, Math.round(((b.paymentDueAt ?? 0) - (b.acceptedAt ?? 0)) / 60_000));
  const url = siteUrl();
  return [
    `${creator?.name ?? "A creator"} accepted your Srijan job — pay ₹${b.total.toLocaleString("en-IN")} to confirm it`,
    `Booking: ${b.code}`,
    `Service: ${pkg?.name ?? b.packageId}`,
    `Creator: ${creator?.name ?? "Assigned by the Srijan team"}`,
    `${b.online ? "Finish by" : "When"}: ${istDateTime(b.scheduledAt)} IST`,
    b.online ? "Where: Online job" : `Where: ${place ? `${place.zone.name}, ${place.city.name}` : `${b.zoneId}, ${b.cityId}`}`,
    `To pay: ₹${b.total.toLocaleString("en-IN")}`,
    `Please pay within ${minutes} minute${minutes === 1 ? "" : "s"}. They are holding this slot for you, and the job is dropped if the payment doesn’t arrive.`,
    url ? `Pay here: ${url}/bookings/${b.id}` : "Open your booking on Srijan to pay.",
  ];
}

/** What the creator is owed, for the ops email when a job is confirmed. */
const creatorNet = (b: Booking) => rupees(b.price * CREATOR_SHARE);

/** "The client has paid and the job is on", for the ops inbox. */
export function paymentConfirmedLines(db: DB, b: Booking): string[] {
  const creator = db.creators.find((c) => c.id === b.creatorId);
  const creatorPhone = creator ? db.users.find((u) => u.id === creator.userId)?.phone : undefined;
  return [
    `Job ${b.code} is paid for and confirmed`,
    ...bookingAlertLines(db, b).slice(1),
    `Creator: ${creator?.name ?? "Unknown"}${creatorPhone ? ` · ${creatorPhone}` : ""}`,
    `Creator earns: ₹${creatorNet(b).toLocaleString("en-IN")}`,
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

/**
 * Hands an email to the platform to finish after the reply is sent. Outside a request (tests,
 * scripts) `after` isn't available, so it goes out in the background instead. Never throws.
 */
function background(send: () => Promise<unknown>, what: string) {
  try {
    after(() => send());
  } catch {
    void send().catch((e) => console.error(`${what} failed`, e));
  }
}

export function sendOpsAlerts(alerts: string[][]) {
  for (const lines of alerts) background(() => sendOpsAlertEmail(lines), "Ops alert");
}

/** Emails one client about their own booking, after the reply has gone out. */
export function sendClientAlert(email: string | undefined, lines: string[], footer = "You can also open the booking on Srijan to pay.") {
  if (!email) return;
  background(() => sendClientAlertEmail(email, lines, footer), "Client alert");
}
