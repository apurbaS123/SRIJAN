// DEMO notifications. Messages are stored here and shown by <DemoNotifications /> while the person
// has the site open. To send real phone notifications, add the push call in `notifyUser`: every
// message in the app goes through it.
import { CREATOR_SHARE, DAY, OPS_REMINDER_MS, findPackage, findZone } from "./config";
import type { Booking, DB, Notification, Offer } from "./types";
import { newId, rupees } from "./util";

const KEEP_MS = 7 * DAY;

export function notifyUser(db: DB, userId: string, at: number, message: Pick<Notification, "title" | "lines" | "href" | "offerId">) {
  (db.notifications ??= []).push({ id: newId("ntf"), userId, at, ...message });
}

function istDateTime(ms: number) {
  return new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
}

/** The job alert: what, where, when and the brief. */
export function notifyCreatorOfOffer(db: DB, b: Booking, offer: Offer) {
  const creator = db.creators.find((c) => c.id === offer.creatorId);
  if (!creator) return;
  const place = findZone(b.cityId, b.zoneId);
  notifyUser(db, creator.userId, offer.sentAt, {
    title: offer.kind === "direct" ? "A client sent you a job offer" : b.online ? "New online job" : "New job near you",
    lines: [
      `Job: ${findPackage(b.packageId)?.name ?? b.packageId}`,
      `Where: ${b.online ? "Online" : place ? `${place.zone.name}, ${place.city.name}` : ""}`,
      `${b.online ? "Finish by" : "When"}: ${istDateTime(b.scheduledAt)} IST`,
      `Brief: ${b.brief}`,
      `You earn: ₹${rupees(b.price * CREATOR_SHARE).toLocaleString("en-IN")}. ${offer.kind === "direct" ? `Only you have this job for ${Math.round((offer.expiresAt - offer.sentAt) / 60_000)} minutes.` : "First to accept gets it."}`,
    ],
    href: "/creator",
    offerId: offer.id,
  });
}

/**
 * A creator took the job, so the payment form opens for the client. This is the alert that asks
 * them to pay: it also reaches their phone if they've turned on notifications.
 */
export function notifyPaymentDue(db: DB, b: Booking, creatorName: string, at: number) {
  const minutes = Math.max(1, Math.round(((b.paymentDueAt ?? at) - at) / 60_000));
  notifyUser(db, b.clientId, at, {
    title: `${creatorName} accepted your job — pay to confirm`,
    lines: [
      `Job: ${findPackage(b.packageId)?.name ?? b.packageId} · ${b.code}`,
      `Pay ₹${b.total.toLocaleString("en-IN")} in the next ${minutes} minute${minutes === 1 ? "" : "s"} to confirm it.`,
      `${creatorName} is holding this slot for you and is given your details once you've paid.`,
    ],
    href: `/bookings/${b.id}`,
  });
}

/** The money has arrived: each side gets the other's number and everything about the job. */
export function notifyJobConfirmed(db: DB, b: Booking, at: number) {
  const creator = db.creators.find((c) => c.id === b.creatorId);
  const creatorPhone = creator ? db.users.find((u) => u.id === creator.userId)?.phone : undefined;
  const client = db.users.find((u) => u.id === b.clientId);
  const place = findZone(b.cityId, b.zoneId);
  const when = `${b.online ? "Finish by" : "When"}: ${istDateTime(b.scheduledAt)} IST`;
  notifyUser(db, b.clientId, at, {
    title: `Payment received — ${creator?.name ?? "your creator"} is confirmed`,
    lines: [
      b.code,
      `Creator: ${creator?.name ?? "Your creator"}${creatorPhone ? ` · ${creatorPhone}` : ""}`,
      when,
      "Open the job to see everything you both agreed.",
    ],
    href: `/bookings/${b.id}`,
  });
  if (!creator) return;
  notifyUser(db, creator.userId, at, {
    title: "The client has paid — the job is yours",
    lines: [
      `Job: ${findPackage(b.packageId)?.name ?? b.packageId} · ${b.code}`,
      `Client: ${client?.name ?? "Client"}${client?.phone ? ` · ${client.phone}` : ""}`,
      when,
      b.online ? "Where: Online · no visit needed" : `Where: ${b.address}${place ? `, ${place.zone.name}, ${place.city.name}` : ""}`,
      `You earn: ₹${rupees(b.price * CREATOR_SHARE).toLocaleString("en-IN")}`,
    ],
    href: `/creator/jobs/${b.id}`,
  });
}

/** The job never got paid for, so the creator who accepted it is let go. */
export function notifyCreatorJobLost(db: DB, b: Booking, reason: string, at: number) {
  const creator = db.creators.find((c) => c.id === b.creatorId);
  if (!creator) return;
  notifyUser(db, creator.userId, at, {
    title: "A job you accepted was dropped",
    lines: [`Job: ${findPackage(b.packageId)?.name ?? b.packageId} · ${b.code}`, reason, "Your time is free again, and no payment is owed either way."],
    href: `/creator/jobs/${b.id}`,
  });
}

/**
 * "Starts in 20 minutes" for the ops team: who the creator is, or that nobody has it yet. Returned as
 * lines so the server layer can also email them to the ops inbox.
 */
export function opsStartingSoonLines(db: DB, b: Booking, now: number): string[] {
  const place = findZone(b.cityId, b.zoneId);
  const creator = b.creatorId ? db.creators.find((c) => c.id === b.creatorId) : undefined;
  const creatorPhone = creator ? db.users.find((u) => u.id === creator.userId)?.phone : undefined;
  const client = db.users.find((u) => u.id === b.clientId);
  const mins = Math.max(0, Math.round((b.scheduledAt - now) / 60_000));
  const headline = !creator
    ? `Job ${b.code} starts in ${mins} min and has NO creator`
    : !b.paidAt
      ? `Job ${b.code} starts in ${mins} min and ISN’T PAID FOR`
      : `Job ${b.code} starts in ${mins} min`;
  return [
    headline,
    `Service: ${findPackage(b.packageId)?.name ?? b.packageId}`,
    `Starts: ${istDateTime(b.scheduledAt)} IST`,
    b.online ? "Where: Online job" : `Where: ${b.address}, ${place ? `${place.zone.name}, ${place.city.name}` : `${b.zoneId}, ${b.cityId}`}`,
    creator ? `Creator: ${creator.name}${creatorPhone ? ` · ${creatorPhone}` : ""}` : `Status: ${b.status === "needs_ops" ? "waiting for the Srijan team to assign someone" : "still searching"}`,
    b.paidAt ? `Paid: ₹${b.total.toLocaleString("en-IN")}` : `Payment: ₹${b.total.toLocaleString("en-IN")} still to be paid by the client`,
    `Client: ${client?.name ?? "Unknown"}${client?.phone ? ` · ${client.phone}` : ""}`,
  ];
}

/** Tells every ops account a job is about to start. Returns the lines, or undefined if it's not due. */
export function remindOpsIfStartingSoon(db: DB, b: Booking, now: number) {
  if (b.opsRemindedAt) return;
  if (!["searching", "needs_ops", "awaiting_payment", "assigned"].includes(b.status)) return;
  if (now < b.scheduledAt - OPS_REMINDER_MS || now >= b.scheduledAt) return;
  b.opsRemindedAt = now;
  const lines = opsStartingSoonLines(db, b, now);
  for (const u of db.users) if (u.role === "ops") notifyUser(db, u.id, now, { title: lines[0]!, lines: lines.slice(1), href: "/ops" });
  b.events.push({ at: now, text: lines[0]! });
  return lines;
}

/** Once an offer is accepted, declined, taken or expired its alert goes away. */
export function closeOfferNotifications(db: DB, offerId: string, at: number) {
  for (const n of db.notifications ?? []) if (n.offerId === offerId && !n.readAt) n.readAt = at;
}

export function unreadNotifications(db: DB, userId: string) {
  return (db.notifications ?? []).filter((n) => n.userId === userId && !n.readAt);
}

export function markNotificationRead(db: DB, userId: string, id: string, at: number) {
  const n = db.notifications?.find((x) => x.id === id && x.userId === userId);
  if (n && !n.readAt) n.readAt = at;
}

export function pruneNotifications(db: DB, now: number) {
  if (db.notifications?.some((n) => now - n.at > KEEP_MS)) db.notifications = db.notifications.filter((n) => now - n.at <= KEEP_MS);
}
