// Finding a creator for an on-demand shoot.
//
// 1. Every available, verified creator within 10 km is alerted at once (5 min window).
//    The first to accept gets the job.
// 2. At minute 3 the search widens to 25 km for the rest of the same window.
// 3. Creators who come online during the window are alerted too.
// 4. If nobody accepts by the end of the window, the booking goes to the ops team.
//
// Only creators who offer the job's service are alerted. Online jobs skip the distance rules.
//
// All of this runs lazily: `tickDispatch` is called on every request with the current
// time, so it works without background jobs (and on serverless hosting).

import { DISPATCH, HOUR, findPackage } from "./config";
import { hasPayoutDetails } from "./creators";
import { closeOfferNotifications, notifyCreatorOfOffer, notifyUser } from "./notifications";
import type { Booking, Creator, DB, Offer, ServiceKey } from "./types";
import { DomainError, assert, haversineKm, newId } from "./util";

function log(b: Booking, at: number, text: string) {
  b.events.push({ at, text });
}

export function bookingWindow(b: Booking): [number, number] {
  const hours = findPackage(b.packageId)?.hours ?? 2;
  return [b.scheduledAt - DISPATCH.slotBufferMs, b.scheduledAt + hours * HOUR + DISPATCH.slotBufferMs];
}

export function isCreatorBusy(db: DB, creatorId: string, booking: Booking) {
  if (booking.online) return false;
  const [s, e] = bookingWindow(booking);
  return db.bookings.some((o) => {
    if (o.id === booking.id || o.creatorId !== creatorId || o.online) return false;
    if (o.status !== "assigned") return false;
    const [os, oe] = bookingWindow(o);
    return os < e && s < oe;
  });
}

export function jobService(b: Booking): ServiceKey {
  return findPackage(b.packageId)?.service ?? "videography";
}

/** Verified, opted in to alerts, offers this kind of work and can be paid for it. */
export function canTakeJob(c: Creator, service: ServiceKey) {
  return c.verification === "verified" && c.onDemand && hasPayoutDetails(c) && c.services.some((s) => s.key === service);
}

/** Creators who should be alerted now, nearest first. Skips anyone already alerted or who declined. */
export function eligibleCreators(db: DB, booking: Booking, radiusKm: number) {
  const skip = new Set(
    db.offers
      .filter((o) => o.bookingId === booking.id && (o.status === "pending" || o.status === "declined"))
      .map((o) => o.creatorId),
  );
  const service = jobService(booking);
  return db.creators
    .filter((c) => canTakeJob(c, service) && c.available && !skip.has(c.id))
    .map((creator) => ({ creator, distanceKm: booking.online ? 0 : haversineKm(creator, booking) }))
    .filter((x) => booking.online || (x.distanceKm <= radiusKm && x.distanceKm <= x.creator.maxTravelKm))
    .filter((x) => !isCreatorBusy(db, x.creator.id, booking))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

function createOffer(db: DB, b: Booking, creatorId: string, kind: Offer["kind"], at: number, distanceKm: number) {
  const offer: Offer = {
    id: newId("ofr"),
    bookingId: b.id,
    creatorId,
    kind,
    sentAt: at,
    expiresAt: b.dispatch.roundEndsAt,
    distanceKm: Math.round(distanceKm * 10) / 10,
    status: "pending",
  };
  db.offers.push(offer);
  if (!b.dispatch.notifiedCreatorIds.includes(creatorId)) b.dispatch.notifiedCreatorIds.push(creatorId);
  notifyCreatorOfOffer(db, b, offer);
  return offer;
}

function alertNearby(db: DB, b: Booking, at: number) {
  const list = eligibleCreators(db, b, b.dispatch.radiusKm);
  for (const x of list) createOffer(db, b, x.creator.id, "broadcast", at, x.distanceKm);
  return list.length;
}

function widen(db: DB, b: Booking, at: number) {
  b.dispatch.widened = true;
  b.dispatch.radiusKm = DISPATCH.widenedRadiusKm;
  const n = alertNearby(db, b, at);
  log(b, at, `Search widened to ${DISPATCH.widenedRadiusKm} km — ${n} more creator${n === 1 ? "" : "s"} alerted`);
}

function startBroadcast(db: DB, b: Booking, at: number) {
  const d = b.dispatch;
  d.phase = "broadcast";
  d.roundStartedAt = at;
  d.roundEndsAt = at + DISPATCH.broadcastWindowMs;
  d.widened = false;
  d.radiusKm = DISPATCH.initialRadiusKm;
  const n = alertNearby(db, b, at);
  if (b.online) {
    d.widened = true; // no distance limit, so there is nothing to widen
    log(b, at, n === 0 ? "No one available right now" : `${n} creator${n === 1 ? "" : "s"} alerted · 5 min to accept`);
  } else if (n === 0) {
    log(b, at, `No one free within ${DISPATCH.initialRadiusKm} km`);
    widen(db, b, at);
  } else {
    log(b, at, `${n} creator${n === 1 ? "" : "s"} within ${DISPATCH.initialRadiusKm} km alerted · 5 min to accept`);
  }
}

/** Called once, right after payment. */
export function startDispatch(db: DB, b: Booking, now: number) {
  b.dispatch = {
    phase: "broadcast",
    roundStartedAt: now,
    roundEndsAt: now,
    widened: false,
    radiusKm: DISPATCH.initialRadiusKm,
    notifiedCreatorIds: [],
  };
  startBroadcast(db, b, now);
}

function expirePending(db: DB, bookingId: string, status: "expired" | "taken", at: number) {
  for (const o of db.offers) {
    if (o.bookingId === bookingId && o.status === "pending") {
      o.status = status;
      o.respondedAt = at;
      closeOfferNotifications(db, o.id, at);
    }
  }
}

/** Advance the search for one booking up to `now`. Safe to call any number of times. */
export function tickDispatch(db: DB, b: Booking, now: number) {
  if (b.status !== "searching") return;
  const d = b.dispatch;

  // Clients can no longer pick a creator. This only moves on bookings sent to one creator before that changed.
  if (d.phase === "direct") {
    const direct = [...db.offers].reverse().find((o) => o.bookingId === b.id && o.kind === "direct");
    const declined = direct?.status === "declined";
    if (!declined && now < d.roundEndsAt) return;
    const at = declined ? (direct!.respondedAt ?? now) : d.roundEndsAt;
    const name = db.creators.find((c) => c.id === direct?.creatorId)?.name ?? "The chosen creator";
    if (direct && direct.status === "pending") {
      direct.status = "expired";
      direct.respondedAt = at;
      log(b, at, `${name} didn’t respond in 5 min`);
    } else if (declined) {
      log(b, at, `${name} declined`);
    }
    startBroadcast(db, b, at);
  }

  if (d.phase === "broadcast") {
    const widenAt = d.roundStartedAt + DISPATCH.widenAfterMs;
    if (!d.widened && now >= widenAt && widenAt < d.roundEndsAt) widen(db, b, widenAt);
    if (now >= d.roundEndsAt) {
      expirePending(db, b.id, "expired", d.roundEndsAt);
      d.phase = "done";
      b.status = "needs_ops";
      log(
        b,
        d.roundEndsAt,
        `No one accepted in 5 min (${d.notifiedCreatorIds.length} alerted) — Srijan team is assigning a creator`,
      );
    } else {
      const n = alertNearby(db, b, now);
      if (n > 0) log(b, now, `${n} more creator${n === 1 ? "" : "s"} came online and ${n === 1 ? "was" : "were"} alerted`);
    }
  }
}

function assignCreator(db: DB, b: Booking, creator: Creator, now: number) {
  b.creatorId = creator.id;
  b.status = "assigned";
  b.assignedAt = now;
  b.dispatch.phase = "done";
  expirePending(db, b.id, "taken", now);
  notifyUser(db, b.clientId, now, {
    title: `${creator.name} accepted your job`,
    lines: [b.code, "Open the job to see their phone number and all the details."],
    href: `/bookings/${b.id}`,
  });
}

export function acceptOffer(db: DB, offerId: string, creatorId: string, now: number) {
  const o = db.offers.find((x) => x.id === offerId);
  assert(o && o.creatorId === creatorId, "Offer not found", 404);
  const b = db.bookings.find((x) => x.id === o.bookingId);
  assert(b, "Booking not found", 404);
  if (o.status === "taken" || (b.status !== "searching" && b.creatorId !== creatorId)) {
    throw new DomainError("Another creator accepted this job first", 409);
  }
  assert(o.status === "pending", "This offer is no longer open", 409);
  assert(now < o.expiresAt, "This offer has expired", 409);
  assert(!isCreatorBusy(db, creatorId, b), "You already have a shoot around this time", 409);
  const creator = db.creators.find((c) => c.id === creatorId)!;
  o.status = "accepted";
  o.respondedAt = now;
  closeOfferNotifications(db, o.id, now);
  assignCreator(db, b, creator, now);
  const secs = Math.max(0, Math.round((now - (b.paidAt ?? now)) / 1000));
  const took = secs < 60 ? `${secs} sec` : `${Math.floor(secs / 60)} min ${secs % 60} sec`;
  log(b, now, `${creator.name} accepted · ${b.dispatch.notifiedCreatorIds.length} alerted · matched in ${took}`);
  return b;
}

export function declineOffer(db: DB, offerId: string, creatorId: string, now: number) {
  const o = db.offers.find((x) => x.id === offerId);
  assert(o && o.creatorId === creatorId, "Offer not found", 404);
  assert(o.status === "pending", "This offer is no longer open", 409);
  o.status = "declined";
  o.respondedAt = now;
  closeOfferNotifications(db, o.id, now);
  const b = db.bookings.find((x) => x.id === o.bookingId);
  if (b) tickDispatch(db, b, now);
}

/** Ops assigns a creator by hand (after the 5-minute window, or any time while searching). */
export function manualAssign(db: DB, b: Booking, creatorId: string, now: number) {
  assert(b.status === "searching" || b.status === "needs_ops", "This booking already has a creator");
  const c = db.creators.find((x) => x.id === creatorId);
  assert(c && canTakeJob(c, jobService(b)), "Pick a verified creator who offers this service and has linked their bank or UPI");
  assert(!isCreatorBusy(db, c.id, b), `${c.name} already has a shoot around this time`);
  assignCreator(db, b, c, now);
  log(b, now, `Srijan team assigned ${c.name}`);
}

export function cancelSearch(db: DB, b: Booking, now: number) {
  expirePending(db, b.id, "expired", now);
  b.dispatch.phase = "done";
}
