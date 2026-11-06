// DEMO notifications. Messages are stored here and shown by <DemoNotifications /> while the person
// has the site open. To send real phone notifications, add the push call in `notifyUser`: every
// message in the app goes through it.
import { CREATOR_SHARE, DAY, findPackage, findZone } from "./config";
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
