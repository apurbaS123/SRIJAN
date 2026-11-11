// Job lifecycle: book (nothing to pay yet) → the first creator to accept takes it → the client is
// asked to pay for it → payment confirms the job and the two sides swap details → creator uploads
// proof and marks it finished → client approves → Srijan pays the creator 80%.
import {
  AUTO_APPROVE_MS,
  CREATOR_SHARE,
  DAY,
  DISPATCH,
  MAX_SERVICES_PER_ORDER,
  PAYOUT_WINDOW_TEXT,
  PLATFORM_SHARE,
  findPackage,
  findZone,
} from "./config";
import { cancelSearch, startDispatch, tickDispatch } from "./dispatch";
import { notifyCreatorJobLost, notifyJobConfirmed, notifyUser, remindOpsIfStartingSoon } from "./notifications";
import type { Booking, BookingStatus, DB } from "./types";
import { assert, cleanText, cleanUrl, istHour, newId, nextCode, parseIstLocal, rupees } from "./util";

const ASPECTS: Booking["aspect"][] = ["9:16", "16:9", "1:1"];

function log(b: Booking, at: number, text: string) {
  b.events.push({ at, text });
}

export function quote(packageId: string) {
  const pkg = findPackage(packageId);
  assert(pkg && !pkg.retired, "Unknown package");
  return { pkg, price: pkg.price, total: pkg.price, creatorPayout: rupees(pkg.price * CREATOR_SHARE) };
}

export interface NewBookingInput {
  packageId: string;
  /** Not needed for online jobs, like zoneId and address. */
  cityId?: string;
  zoneId?: string;
  address?: string;
  /** "YYYY-MM-DDTHH:mm" in IST */
  scheduledAt: string;
  brief: string;
  aspect?: Booking["aspect"];
  referenceUrl?: string;
  /** Send the job to this creator first (from their profile). */
  requestedCreatorId?: string;
}

/**
 * Creates the booking and starts looking for a creator at once. Nothing is paid yet: the client is
 * asked for the money only once a creator has accepted (see `acceptOffer`).
 */
export function createBooking(db: DB, clientId: string, input: NewBookingInput, now: number) {
  const q = quote(input.packageId);
  const online = !!q.pkg.online;
  const place = online ? undefined : findZone(String(input.cityId), String(input.zoneId));
  assert(online || place, "Pick a city and area");
  const address = online ? "" : cleanText(input.address, 300, "the shoot address");
  assert(online || address.length >= 5, "Enter the full shoot address");
  const brief = cleanText(input.brief, 2000, "the brief");
  assert(brief.length >= 10, "Tell the creator what you need (at least 10 characters)");
  const referenceUrl = cleanUrl(input.referenceUrl, "the reference video", true);
  const aspect = input.aspect ?? "9:16";
  assert(ASPECTS.includes(aspect), "Pick a video format");
  const scheduledAt = parseIstLocal(String(input.scheduledAt ?? ""));
  assert(!Number.isNaN(scheduledAt), "Pick a date and time");
  const noticeMs = online ? 0 : DISPATCH.onSiteNoticeMs;
  assert(scheduledAt >= now + noticeMs - 60_000, online ? "That time has passed. Please pick a later time." : "On-site jobs need at least 1 hour’s notice, so the creator can reach you on time");
  const h = istHour(scheduledAt);
  assert(
    h >= DISPATCH.firstStartHour && h <= DISPATCH.lastStartHour,
    `Pick a time between ${DISPATCH.firstStartHour}:00 and ${DISPATCH.lastStartHour}:00`,
  );
  assert(scheduledAt <= now + DISPATCH.maxDaysAhead * DAY, `Jobs can be booked up to ${DISPATCH.maxDaysAhead} days ahead`);
  const requested = input.requestedCreatorId ? db.creators.find((c) => c.id === input.requestedCreatorId && c.verification === "verified") : undefined;
  assert(!input.requestedCreatorId || requested, "Creator not found");
  assert(!requested || requested.services.some((s) => s.key === q.pkg.service), `${requested?.name} doesn’t offer ${q.pkg.name}. Pick one of their services`);

  const b: Booking = {
    id: newId("bkg"),
    code: nextCode(db, "SR"),
    clientId,
    packageId: q.pkg.id,
    price: q.price,
    total: q.total,
    online: online || undefined,
    address,
    cityId: place?.city.id ?? "",
    zoneId: place?.zone.id ?? "",
    lat: place?.zone.lat ?? 0,
    lng: place?.zone.lng ?? 0,
    scheduledAt,
    brief,
    aspect,
    referenceUrl,
    requestedCreatorId: requested?.id,
    status: "searching",
    createdAt: now,
    dispatch: { phase: "done", roundStartedAt: now, roundEndsAt: now, widened: false, radiusKm: 0, notifiedCreatorIds: [] },
    events: [],
  };
  db.bookings.push(b);
  log(b, now, `Booked ${q.pkg.name} · ₹${b.total.toLocaleString("en-IN")} to pay once a creator accepts`);
  startDispatch(db, b, now);
  return b;
}


export interface NewOrderInput extends Omit<NewBookingInput, "packageId"> {
  packageIds: string[];
}

/**
 * One order on /book: each service becomes its own job, looked for and paid for on its own, since
 * each one's creator accepts at their own moment.
 */
export function createBookings(db: DB, clientId: string, input: NewOrderInput, now: number) {
  const ids = Array.isArray(input.packageIds) ? [...new Set(input.packageIds)] : [];
  assert(ids.length > 0, "Pick at least one service");
  assert(ids.length <= MAX_SERVICES_PER_ORDER, `You can book up to ${MAX_SERVICES_PER_ORDER} services at a time`);
  return ids.map((packageId) => createBooking(db, clientId, { ...input, packageId }, now));
}

/**
 * Razorpay has confirmed the money. Safe to call twice (checkout and webhook both report it).
 * Returns "paid" the first time, which confirms the job for the creator who accepted it and gives
 * each side the other's details. A payment that lands once the job has been dropped can't confirm
 * anything, so it is set up for a refund: returns "refund".
 */
export function recordPayment(db: DB, b: Booking, paymentId: string, now: number): "paid" | "refund" | "already" {
  if (b.razorpayPaymentId) return "already";
  const confirms = b.status === "awaiting_payment" && !!b.creatorId;
  b.razorpayPaymentId = paymentId;
  b.paidAt = now;
  db.ledger.push({ id: newId("led"), at: now, type: "client_payment", amount: b.total, bookingId: b.id, note: b.code });
  log(b, now, `Paid ₹${b.total.toLocaleString("en-IN")}`);
  if (confirms) {
    b.status = "assigned";
    b.assignedAt = now;
    b.paymentDueAt = undefined;
    const creator = db.creators.find((c) => c.id === b.creatorId);
    log(b, now, `Job confirmed with ${creator?.name ?? "the creator"} · both sides have each other's details`);
    notifyJobConfirmed(db, b, now);
    return "paid";
  }
  b.status = "awaiting_payment"; // a dropped job is "cancelled", which `refund` would refuse
  refund(db, b, "paid after the job had been dropped", now);
  return "refund";
}

function getForCreator(db: DB, bookingId: string, creatorId: string) {
  const b = db.bookings.find((x) => x.id === bookingId);
  assert(b && b.creatorId === creatorId, "Job not found", 404);
  return b;
}

function getForClient(db: DB, bookingId: string, clientId: string) {
  const b = db.bookings.find((x) => x.id === bookingId);
  assert(b && b.clientId === clientId, "Booking not found", 404);
  return b;
}

/** The creator has uploaded their proof of work and pressed Mark As Finished. */
export function markFinished(db: DB, bookingId: string, creatorId: string, now: number) {
  const b = getForCreator(db, bookingId, creatorId);
  assert(b.status === "assigned", "This job isn’t in progress");
  assert(b.online || now >= b.scheduledAt, "You can mark this job as finished once its start time has passed");
  b.status = "delivered";
  b.deliveredAt = now;
  log(b, now, "Creator marked the job as finished");
  notifyUser(db, b.clientId, now, {
    title: "Your job is finished",
    lines: [b.code, "Please check it and press Mark As Approved."],
    href: `/bookings/${b.id}`,
  });
  return b;
}

/** Books the 80/20 split. The creator's share stays owed until ops has paid it. */
export function settleBooking(db: DB, b: Booking, now: number) {
  const creatorNet = rupees(b.price * CREATOR_SHARE);
  const platformFee = b.price - creatorNet;
  db.ledger.push({ id: newId("led"), at: now, type: "creator_earning", amount: creatorNet, bookingId: b.id, creatorId: b.creatorId, status: "processing", note: b.code });
  db.ledger.push({ id: newId("led"), at: now, type: "platform_fee", amount: platformFee, bookingId: b.id, note: `${b.code} · ${Math.round(PLATFORM_SHARE * 100)}%` });
  const c = db.creators.find((x) => x.id === b.creatorId);
  if (c) {
    c.jobsDone += 1;
    notifyUser(db, c.userId, now, {
      title: "Job approved",
      lines: [b.code, `₹${creatorNet.toLocaleString("en-IN")} has been added to your wallet.`, PAYOUT_WINDOW_TEXT],
      href: `/creator/wallet`,
    });
  }
  return { creatorNet, platformFee };
}

export function approve(db: DB, bookingId: string, clientId: string, now: number) {
  const b = getForClient(db, bookingId, clientId);
  assert(b.status === "delivered", "There is nothing to approve yet");
  b.status = "completed";
  b.approvedAt = now;
  const s = settleBooking(db, b, now);
  log(b, now, `Approved · ₹${s.creatorNet.toLocaleString("en-IN")} to be paid to the creator`);
  return b;
}

/** The client isn't happy: the payout stops until the Srijan team decides. */
export function reportProblem(db: DB, bookingId: string, clientId: string, note: unknown, now: number) {
  const b = getForClient(db, bookingId, clientId);
  assert(b.status === "delivered", "You can report a problem once the job is marked as finished");
  const text = cleanText(note, 1000, "the problem");
  assert(text.length >= 5, "Tell us what went wrong");
  b.status = "disputed";
  b.report = { note: text, at: now };
  log(b, now, `Client reported a problem: “${text}”`);
  return b;
}

/** Ops looked into a reported problem and sides with the creator. */
export function releaseDisputed(db: DB, b: Booking, now: number) {
  assert(b.status === "disputed", "This job has no reported problem");
  b.status = "completed";
  b.approvedAt = now;
  const s = settleBooking(db, b, now);
  log(b, now, `Srijan team approved the job · ₹${s.creatorNet.toLocaleString("en-IN")} to be paid to the creator`);
  return b;
}

/** 1–5 whole stars and optional text, the same rules for both sides of a review. */
function cleanReview(rating: unknown, text: unknown) {
  const r = Number(rating);
  assert(Number.isInteger(r) && r >= 1 && r <= 5, "Choose from 1 to 5 stars");
  return { rating: r, text: cleanText(text, 1000, "your review", true) || undefined };
}

/** The client reviews the creator, once, after the booking is completed. */
export function reviewCreator(db: DB, bookingId: string, clientId: string, rating: unknown, text: unknown, now: number) {
  const b = getForClient(db, bookingId, clientId);
  assert(b.status === "completed", "You can review once the booking is completed");
  assert(!b.rating, "You’ve already reviewed this booking");
  const r = cleanReview(rating, text);
  b.rating = r.rating;
  b.review = r.text;
  b.reviewedAt = now;
  const c = db.creators.find((x) => x.id === b.creatorId);
  if (c) {
    c.ratingSum += r.rating;
    c.ratingCount += 1;
  }
  log(b, now, `Client rated the creator ${r.rating} ★`);
  return b;
}

/** The creator reviews the client, once, after the booking is completed. */
export function reviewClient(db: DB, bookingId: string, creatorId: string, rating: unknown, text: unknown, now: number) {
  const b = getForCreator(db, bookingId, creatorId);
  assert(b.status === "completed", "You can review once the booking is completed");
  assert(!b.reviewOfClient, "You’ve already reviewed this client");
  const r = cleanReview(rating, text);
  b.reviewOfClient = { rating: r.rating, text: r.text, at: now };
  log(b, now, `Creator rated the client ${r.rating} ★`);
  return b;
}

/** A client's average rating from creators, to one decimal, or null before their first review. */
export function clientRating(db: DB, clientId: string) {
  const rs = db.bookings.filter((b) => b.clientId === clientId && b.reviewOfClient).map((b) => b.reviewOfClient!.rating);
  return { rating: rs.length ? Math.round((rs.reduce((s, r) => s + r, 0) / rs.length) * 10) / 10 : null, count: rs.length };
}

/**
 * Refunds are manual: this marks the booking refunded and, if real money was taken, leaves the refund
 * "pending" for ops to send by hand, outside Razorpay, and then mark as sent.
 */
export function refund(db: DB, b: Booking, reason: string, now: number) {
  assert(!["completed", "refunded", "cancelled"].includes(b.status), "This booking can’t be refunded now");
  const paid = !!b.razorpayPaymentId;
  const creatorWasWaiting = b.status === "awaiting_payment" && !!b.creatorId;
  cancelSearch(db, b, now);
  // Nothing was ever charged until a creator accepted, so most dropped jobs owe the client nothing.
  b.status = paid ? "refunded" : "cancelled";
  b.refundedAt = now;
  if (paid) {
    b.refund = { amount: b.total, reason, status: "pending" };
    db.ledger.push({ id: newId("led"), at: now, type: "client_refund", amount: b.total, bookingId: b.id, note: `${b.code} · ${reason}` });
    log(b, now, `Full refund of ₹${b.total.toLocaleString("en-IN")} due · ${reason}`);
  } else {
    log(b, now, `Job dropped · ${reason} · nothing was paid, so there is nothing to refund`);
  }
  if (creatorWasWaiting && !paid) notifyCreatorJobLost(db, b, `The job was dropped before it was paid for: ${reason}.`, now);
  return b;
}

/** For the ops page: refunds still to be sent by hand, with who to contact for their bank or UPI details. */
export function refundsDue(db: DB) {
  return db.bookings
    .filter((b) => b.refund?.status === "pending")
    .map((b) => {
      const client = db.users.find((u) => u.id === b.clientId);
      return {
        id: b.id,
        code: b.code,
        amount: b.refund!.amount,
        reason: b.refund!.reason,
        paymentId: b.razorpayPaymentId,
        at: b.refundedAt!,
        clientName: client?.name,
        clientPhone: client?.phone,
        clientEmail: client?.email,
      };
    });
}
export type RefundDue = ReturnType<typeof refundsDue>[number];

/** Ops has sent the client their money by hand, outside Razorpay, so there is nothing to check it against. */
export function markRefundSent(db: DB, bookingId: string, reference: unknown, now: number) {
  const b = db.bookings.find((x) => x.id === bookingId);
  assert(b?.refund, "Refund not found", 404);
  assert(b.refund.status === "pending", "This refund is already marked as sent", 409);
  b.refund.status = "sent";
  b.refund.sentAt = now;
  b.refund.paymentRef = cleanText(reference, 100, "the refund reference", true) || undefined;
  log(b, now, `Refund of ₹${b.refund.amount.toLocaleString("en-IN")} sent`);
  notifyUser(db, b.clientId, now, {
    title: "Your refund has been sent",
    lines: [b.code, "Please contact us if it hasn’t reached you in a few working days."],
    href: `/bookings/${b.id}`,
  });
  return b;
}

/** Client can cancel for free until they have paid: before that, nobody is out of pocket. */
export function cancelByClient(db: DB, bookingId: string, clientId: string, now: number) {
  const b = getForClient(db, bookingId, clientId);
  assert(
    ["searching", "needs_ops", "awaiting_payment"].includes(b.status),
    "This job has been paid for and is under way — contact support to cancel",
  );
  refund(db, b, "cancelled by client", now);
  b.status = "cancelled";
  return b;
}

/** Bookings saved under the old check-in, shoot and revision steps carry on as "creator working". */
const OLD_IN_PROGRESS = ["shooting", "editing", "revision_requested"];

/** Time-based rules that aren't part of the creator search. */
export function tickBooking(db: DB, b: Booking, now: number) {
  if (OLD_IN_PROGRESS.includes(b.status)) b.status = "assigned" as BookingStatus;
  // Bookings made under the old "pay first, then search" flow have nobody to pay for, so they are
  // dropped the way the old 30-minute rule dropped them.
  if (b.status === "awaiting_payment" && !b.creatorId) {
    b.status = "cancelled";
    log(b, now, "Payment wasn’t completed");
    return;
  }
  // A creator accepted and is holding the slot. No money in time means the job goes, not their day.
  if (b.status === "awaiting_payment" && b.paymentDueAt && now >= b.paymentDueAt) {
    const at = b.paymentDueAt;
    cancelSearch(db, b, at);
    b.status = "cancelled";
    log(b, at, "The client didn’t pay in time — the job was dropped and the creator released");
    notifyCreatorJobLost(db, b, "The client didn’t pay in time, so the job was dropped.", at);
    notifyUser(db, b.clientId, at, {
      title: "Your job was dropped — it wasn’t paid for",
      lines: [b.code, "The creator who accepted it has been released. You haven’t been charged.", "Book again whenever you’re ready."],
      href: "/book",
    });
    return;
  }
  // Anything this returns has to reach the ops team, so it's handed back to the server layer.
  tickDispatch(db, b, now);
  const reminder = remindOpsIfStartingSoon(db, b, now);
  if (b.status === "delivered" && b.deliveredAt && now >= b.deliveredAt + AUTO_APPROVE_MS) {
    const at = b.deliveredAt + AUTO_APPROVE_MS;
    b.status = "completed";
    b.approvedAt = at;
    b.autoApproved = true;
    const s = settleBooking(db, b, at);
    log(b, at, `Auto-approved after 48 h · ₹${s.creatorNet.toLocaleString("en-IN")} to be paid to the creator`);
    // Nobody is looking at the page when this happens, so ask for the review that is now owed.
    const creator = db.creators.find((c) => c.id === b.creatorId);
    notifyUser(db, b.clientId, at, {
      title: `Please rate ${creator?.name.split(" ")[0] ?? "your creator"}`,
      lines: [b.code, "Your job was approved automatically after 48 hours. Rating your creator takes a moment and is the last step."],
      href: `/bookings/${b.id}`,
    });
  }
  return reminder;
}
