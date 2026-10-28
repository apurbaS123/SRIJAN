// Finding a creator for an on-demand shoot.
//
// 1. If the client picked a creator, only that creator is alerted first (5 min).
// 2. Then every available, verified creator within 10 km is alerted at once (5 min window).
//    The first to accept gets the job.
// 3. At minute 3 the search widens to 25 km for the rest of the same window.
// 4. Creators who come online during the window are alerted too.
// 5. If nobody accepts by the end of the window, the booking goes to the ops team.
//
// All of this runs lazily: `tickDispatch` is called on every request with the current
// time, so it works without background jobs (and on serverless hosting).

import { DISPATCH, HOUR, findPackage } from "./config";
import type { Booking, Creator, DB, Offer } from "./types";
import { DomainError, assert, haversineKm, newId } from "./util";

function log(b: Booking, at: number, text: string) {
  b.events.push({ at, text });
}

export function bookingWindow(b: Booking): [number, number] {
  const hours = findPackage(b.packageId)?.hours ?? 2;
  return [b.scheduledAt - DISPATCH.slotBufferMs, b.scheduledAt + hours * HOUR + DISPATCH.slotBufferMs];
}

export function isCreatorBusy(db: DB, creatorId: string, booking: Booking) {
  const [s, e] = bookingWindow(booking);
  return db.bookings.some((o) => {
    if (o.id === booking.id || o.creatorId !== creatorId) return false;
    if (o.status !== "assigned" && o.status !== "shooting") return false;
    const [os, oe] = bookingWindow(o);
    return os < e && s < oe;
  });
}

export function canTakeShoots(c: Creator) {
  return c.verification === "verified" && c.onDemand && c.services.some((s) => s.key === "videography");
}

/** Creators who should be alerted now, nearest first. Skips anyone already alerted or who declined. */
export function eligibleCreators(db: DB, booking: Booking, radiusKm: number) {
  const skip = new Set(
    db.offers
      .filter((o) => o.bookingId === booking.id && (o.status === "pending" || o.status === "declined"))
      .map((o) => o.creatorId),
  );
  return db.creators
    .filter((c) => canTakeShoots(c) && c.available && !skip.has(c.id))
    .map((creator) => ({ creator, distanceKm: haversineKm(creator, booking) }))
    .filter((x) => x.distanceKm <= radiusKm && x.distanceKm <= x.creator.maxTravelKm)
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
  if (n === 0) {
    log(b, at, `No one free within ${DISPATCH.initialRadiusKm} km`);
    widen(db, b, at);
  } else {
    log(b, at, `${n} creator${n === 1 ? "" : "s"} within ${DISPATCH.initialRadiusKm} km alerted · 5 min to accept`);
  }
}

/** Called once, right after payment. */
export function startDispatch(db: DB, b: Booking, now: number) {
  b.dispatch = {
    phase: "direct",
    roundStartedAt: now,
    roundEndsAt: now,
    widened: false,
    radiusKm: DISPATCH.initialRadiusKm,
    notifiedCreatorIds: [],
  };
  if (b.requestedCreatorId) {
    const c = db.creators.find((x) => x.id === b.requestedCreatorId);
    if (c && canTakeShoots(c) && c.available && !isCreatorBusy(db, c.id, b)) {
      b.dispatch.roundEndsAt = now + DISPATCH.directOfferMs;
      createOffer(db, b, c.id, "direct", now, haversineKm(c, b));
      log(b, now, `Sent to ${c.name} first · 5 min to accept`);
      return;
    }
    log(b, now, `${c?.name ?? "Your chosen creator"} isn’t available right now — alerting everyone nearby`);
  }
  startBroadcast(db, b, now);
}

function expirePending(db: DB, bookingId: string, status: "expired" | "taken", at: number) {
  for (const o of db.offers) {
    if (o.bookingId === bookingId && o.status === "pending") {
      o.status = status;
      o.respondedAt = at;
    }
  }
}

/** Advance the search for one booking up to `now`. Safe to call any number of times. */
export function tickDispatch(db: DB, b: Booking, now: number) {
  if (b.status !== "searching") return;
  const d = b.dispatch;

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
  assignCreator(db, b, creator, now);
  const secs = Math.max(0, Math.round((now - b.paidAt) / 1000));
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
  const b = db.bookings.find((x) => x.id === o.bookingId);
  if (b) tickDispatch(db, b, now);
}

/** Ops assigns a creator by hand (after the 5-minute window, or any time while searching). */
export function manualAssign(db: DB, b: Booking, creatorId: string, now: number) {
  assert(b.status === "searching" || b.status === "needs_ops", "This booking already has a creator");
  const c = db.creators.find((x) => x.id === creatorId);
  assert(c && c.verification === "verified", "Pick a verified creator");
  assert(!isCreatorBusy(db, c.id, b), `${c.name} already has a shoot around this time`);
  assignCreator(db, b, c, now);
  log(b, now, `Srijan team assigned ${c.name}`);
}

export function cancelSearch(db: DB, b: Booking, now: number) {
  expirePending(db, b.id, "expired", now);
  b.dispatch.phase = "done";
}
