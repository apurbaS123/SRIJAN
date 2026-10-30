// On-demand shoot lifecycle: book & pay → find creator → check in → shoot → edit → deliver → approve → payout.
import {
  AUTO_APPROVE_MS,
  CHECKIN_RADIUS_KM,
  CREATOR_SHARE,
  DELIVERY_SLA_MS,
  DISPATCH,
  FREE_REVISIONS,
  GST_RATE,
  LATE_PENALTY,
  PLATFORM_SHARE,
  findPackage,
  findZone,
} from "./config";
import { cancelSearch, startDispatch, tickDispatch } from "./dispatch";
import type { Booking, DB } from "./types";
import { DomainError, assert, cleanText, cleanUrl, haversineKm, istHour, newId, nextCode, parseIstLocal, randomOtp, rupees } from "./util";

const ASPECTS: Booking["aspect"][] = ["9:16", "16:9", "1:1"];
const MAX_CHECKIN_FAILURES = 5;

function log(b: Booking, at: number, text: string) {
  b.events.push({ at, text });
}

export function quote(packageId: string) {
  const pkg = findPackage(packageId);
  assert(pkg, "Unknown package");
  const gst = rupees(pkg.price * GST_RATE);
  return { pkg, price: pkg.price, gst, total: pkg.price + gst, creatorPayout: rupees(pkg.price * CREATOR_SHARE) };
}

export interface NewBookingInput {
  packageId: string;
  cityId: string;
  zoneId: string;
  address: string;
  /** "YYYY-MM-DDTHH:mm" in IST */
  scheduledAt: string;
  brief: string;
  aspect?: Booking["aspect"];
  referenceUrl?: string;
  requestedCreatorId?: string;
}

/** Creates the booking, records the (mock) payment and starts looking for a creator. */
export function createBooking(db: DB, clientId: string, input: NewBookingInput, now: number) {
  const q = quote(input.packageId);
  const place = findZone(input.cityId, input.zoneId);
  assert(place, "Pick a city and area");
  const address = cleanText(input.address, 300, "the shoot address");
  assert(address.length >= 5, "Enter the full shoot address");
  const brief = cleanText(input.brief, 2000, "the brief");
  assert(brief.length >= 10, "Tell the creator what the video should show (at least 10 characters)");
  const referenceUrl = cleanUrl(input.referenceUrl, "the reference video", true);
  const aspect = input.aspect ?? "9:16";
  assert(ASPECTS.includes(aspect), "Pick a video format");
  const scheduledAt = parseIstLocal(String(input.scheduledAt ?? ""));
  assert(!Number.isNaN(scheduledAt), "Pick a date and time");
  assert(scheduledAt >= now + DISPATCH.minNoticeMs - 60_000, "Shoots need at least 2 hours’ notice");
  const h = istHour(scheduledAt);
  assert(
    h >= DISPATCH.firstStartHour && h <= DISPATCH.lastStartHour,
    `Shoots can start between ${DISPATCH.firstStartHour}:00 and ${DISPATCH.lastStartHour}:00`,
  );
  assert(scheduledAt <= now + 90 * 24 * 60 * 60_000, "Shoots can be booked up to 90 days ahead");
  if (input.requestedCreatorId) {
    assert(db.creators.some((c) => c.id === input.requestedCreatorId && c.verification === "verified"), "Creator not found");
  }

  const b: Booking = {
    id: newId("bkg"),
    code: nextCode(db, "SR"),
    clientId,
    packageId: q.pkg.id,
    price: q.price,
    gst: q.gst,
    total: q.total,
    address,
    cityId: place.city.id,
    zoneId: place.zone.id,
    lat: place.zone.lat,
    lng: place.zone.lng,
    scheduledAt,
    brief,
    aspect,
    referenceUrl,
    requestedCreatorId: input.requestedCreatorId || undefined,
    status: "searching",
    otp: randomOtp(),
    createdAt: now,
    paidAt: now,
    dispatch: { phase: "done", roundStartedAt: now, roundEndsAt: now, widened: false, radiusKm: 0, notifiedCreatorIds: [] },
    deliveryDueAt: scheduledAt + DELIVERY_SLA_MS,
    revisionsUsed: 0,
    events: [],
  };
  db.bookings.push(b);
  db.ledger.push({ id: newId("led"), at: now, type: "client_payment", amount: b.total, bookingId: b.id, note: `${b.code} · held until approval` });
  log(b, now, `Paid ₹${b.total.toLocaleString("en-IN")} · held safely by Srijan`);
  startDispatch(db, b, now);
  return b;
}

function getForCreator(db: DB, bookingId: string, creatorId: string) {
  const b = db.bookings.find((x) => x.id === bookingId);
  assert(b && b.creatorId === creatorId, "Job not found", 404);
  return b;
}

export function checkIn(db: DB, bookingId: string, creatorId: string, otp: string, at: { lat: number; lng: number }, now: number) {
  const b = getForCreator(db, bookingId, creatorId);
  assert(b.status === "assigned", "This job is not waiting for check-in");
  assert((b.checkInFailures ?? 0) < MAX_CHECKIN_FAILURES, "Check-in is locked after too many wrong codes — contact the Srijan team", 429);
  if (String(otp ?? "").trim() !== b.otp) {
    b.checkInFailures = (b.checkInFailures ?? 0) + 1;
    if (b.checkInFailures === MAX_CHECKIN_FAILURES) log(b, now, "Check-in locked after too many wrong start codes");
    throw new DomainError("That start code is wrong — ask the client for the code shown in their app", 400, true);
  }
  assert(Number.isFinite(at.lat) && Number.isFinite(at.lng), "Turn on location to check in");
  const distKm = haversineKm(at, b);
  assert(
    distKm <= CHECKIN_RADIUS_KM,
    `You are ${distKm < 1 ? Math.round(distKm * 1000) + " m" : distKm.toFixed(1) + " km"} from the address. Check in within ${CHECKIN_RADIUS_KM * 1000} m.`,
  );
  const c = db.creators.find((x) => x.id === creatorId);
  if (c) {
    c.lat = at.lat;
    c.lng = at.lng;
  }
  b.status = "shooting";
  b.checkInAt = now;
  log(b, now, "Creator checked in · shoot started");
  return b;
}

export function finishShoot(db: DB, bookingId: string, creatorId: string, now: number) {
  const b = getForCreator(db, bookingId, creatorId);
  assert(b.status === "shooting", "The shoot hasn’t started");
  b.status = "editing";
  b.shootEndAt = now;
  log(b, now, "Shoot finished · editing");
  return b;
}

export function latePenaltyPct(dueAt: number, deliveredAt: number) {
  if (deliveredAt <= dueAt) return 0;
  const steps = Math.ceil((deliveredAt - dueAt) / LATE_PENALTY.stepMs);
  return Math.min(LATE_PENALTY.capPct, steps * LATE_PENALTY.pctPerStep);
}

export function deliver(db: DB, bookingId: string, creatorId: string, videoUrl: string, now: number) {
  const b = getForCreator(db, bookingId, creatorId);
  assert(b.status === "editing" || b.status === "revision_requested", "Nothing to deliver right now");
  const url = cleanUrl(videoUrl, "the video (Google Drive, YouTube unlisted, etc.)")!;
  const revision = b.status === "revision_requested";
  b.videoUrl = url;
  b.deliveredAt = now;
  b.status = "delivered";
  if (!b.firstDeliveredAt) {
    b.firstDeliveredAt = now;
    b.latePenaltyPct = latePenaltyPct(b.deliveryDueAt, now);
  }
  log(
    b,
    now,
    revision
      ? "Revised video delivered"
      : b.latePenaltyPct
        ? `Video delivered late · creator payout reduced ${b.latePenaltyPct}%`
        : "Video delivered on time",
  );
  return b;
}

/** Splits the money once the client approves (or 48 h pass). */
export function settleBooking(db: DB, b: Booking, now: number) {
  const creatorGross = rupees(b.price * CREATOR_SHARE);
  const penalty = b.latePenaltyPct ?? 0;
  const creatorNet = rupees(creatorGross * (1 - penalty / 100));
  const refund = creatorGross - creatorNet;
  const platformFee = b.price - creatorGross;
  db.ledger.push({ id: newId("led"), at: now, type: "creator_earning", amount: creatorNet, bookingId: b.id, creatorId: b.creatorId, note: `${b.code}${penalty ? ` · late −${penalty}%` : ""}` });
  db.ledger.push({ id: newId("led"), at: now, type: "platform_fee", amount: platformFee, bookingId: b.id, note: `${b.code} · ${Math.round(PLATFORM_SHARE * 100)}%` });
  db.ledger.push({ id: newId("led"), at: now, type: "gst_collected", amount: b.gst, bookingId: b.id, note: b.code });
  if (refund > 0) {
    db.ledger.push({ id: newId("led"), at: now, type: "client_refund", amount: refund, bookingId: b.id, note: `${b.code} · late delivery credit` });
  }
  const c = db.creators.find((x) => x.id === b.creatorId);
  if (c) c.jobsDone += 1;
  return { creatorNet, platformFee, refund };
}

export function approve(db: DB, bookingId: string, clientId: string, rating: number, review: string | undefined, now: number) {
  const b = db.bookings.find((x) => x.id === bookingId);
  assert(b && b.clientId === clientId, "Booking not found", 404);
  assert(b.status === "delivered", "There is no delivery to approve yet");
  const r = Math.round(Number(rating));
  assert(r >= 1 && r <= 5, "Give a rating from 1 to 5 stars");
  b.status = "completed";
  b.approvedAt = now;
  b.rating = r;
  b.review = cleanText(review, 1000, "your review", true) || undefined;
  const c = db.creators.find((x) => x.id === b.creatorId);
  if (c) {
    c.ratingSum += r;
    c.ratingCount += 1;
  }
  const s = settleBooking(db, b, now);
  log(b, now, `Approved · ₹${s.creatorNet.toLocaleString("en-IN")} released to the creator`);
  return b;
}

export function requestRevision(db: DB, bookingId: string, clientId: string, note: string, now: number) {
  const b = db.bookings.find((x) => x.id === bookingId);
  assert(b && b.clientId === clientId, "Booking not found", 404);
  assert(b.status === "delivered", "There is no delivery to review yet");
  assert(b.revisionsUsed < FREE_REVISIONS, "You’ve used your free revision");
  const text = cleanText(note, 1000, "what to change");
  assert(text.length >= 5, "Tell the creator what to change");
  b.revisionsUsed += 1;
  b.revisionNote = text;
  b.status = "revision_requested";
  log(b, now, `Revision requested: “${b.revisionNote}”`);
  return b;
}

export function refund(db: DB, b: Booking, reason: string, now: number) {
  assert(!["completed", "refunded", "cancelled"].includes(b.status), "This booking can’t be refunded now");
  cancelSearch(db, b, now);
  b.status = "refunded";
  b.refundedAt = now;
  db.ledger.push({ id: newId("led"), at: now, type: "client_refund", amount: b.total, bookingId: b.id, note: `${b.code} · ${reason}` });
  log(b, now, `Full refund of ₹${b.total.toLocaleString("en-IN")} · ${reason}`);
  return b;
}

/** Client can cancel for free until a creator is on the way. */
export function cancelByClient(db: DB, bookingId: string, clientId: string, now: number) {
  const b = db.bookings.find((x) => x.id === bookingId);
  assert(b && b.clientId === clientId, "Booking not found", 404);
  assert(b.status === "searching" || b.status === "needs_ops", "A creator is already on this job — contact support to cancel");
  refund(db, b, "cancelled by client", now);
  b.status = "cancelled";
  return b;
}

/** Time-based rules that aren't part of the creator search. */
export function tickBooking(db: DB, b: Booking, now: number) {
  tickDispatch(db, b, now);
  if (b.status === "delivered" && b.deliveredAt && now >= b.deliveredAt + AUTO_APPROVE_MS) {
    const at = b.deliveredAt + AUTO_APPROVE_MS;
    b.status = "completed";
    b.approvedAt = at;
    b.autoApproved = true;
    const s = settleBooking(db, b, at);
    log(b, at, `Auto-approved after 48 h · ₹${s.creatorNet.toLocaleString("en-IN")} released to the creator`);
  }
}
