// Alerts to the Srijan team: what a new booking, a brand campaign request or a job about to start
// looks like, and getting it to them. Email only — see sendOpsAlertEmail for the channel.
import { after } from "next/server";
import { findPackage, findZone } from "@/lib/domain/config";
import type { Booking, Campaign, DB } from "@/lib/domain/types";
import { sendOpsAlertEmail } from "./email";

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
    `Paid: ${inr(b.total)}`,
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

/** Never throws and never blocks the reply. */
async function deliver(lines: string[]) {
  await sendOpsAlertEmail(lines);
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
