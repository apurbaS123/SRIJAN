// What each kind of user is allowed to see. API responses are built from these.
import { AUTO_APPROVE_MS, CAMPAIGN_STAGES, CREATOR_SHARE, findPackage, findZone, lowestPrice } from "./config";
import { campaignMath } from "./campaigns";
import { clientRating, tickBooking } from "./bookings";
import { pruneNotifications } from "./notifications";
import { verifyWaitingCreators, type VerificationMode } from "./kyc";
import type { Booking, Campaign, Creator, DB, Offer, Role } from "./types";
import { istDay, istMonth, rupees } from "./util";

export interface Viewer {
  userId?: string;
  role?: Role;
  creatorId?: string;
}

/**
 * Run every time-based rule up to `now`. Returns the ops alerts that fell due, for the server layer
 * to send once the database is unlocked.
 *
 * `verification` is how creators get verified right now (see `kyc.ts`); the server layer reads it
 * from the environment. It defaults to "digilocker", so a caller that forgets verifies nobody.
 */
export function tickAll(db: DB, now: number, verification: VerificationMode = "digilocker") {
  const alerts: string[][] = [];
  if (verification === "direct") verifyWaitingCreators(db);
  for (const b of db.bookings) {
    const reminder = tickBooking(db, b, now);
    if (reminder) alerts.push(reminder);
  }
  // Profiles saved before the rename keep their own copy of this title.
  for (const c of db.creators) for (const s of c.services) if (s.title === "1-day shoot") s.title = "1-day service";
  pruneNotifications(db, now);
  return alerts;
}

export interface PendingReview {
  bookingId: string;
  code: string;
  creatorName: string;
  packageName: string;
  /** When the job was approved — by the client, or automatically after 48 hours. */
  approvedAt: number;
  autoApproved: boolean;
}

/**
 * Completed jobs this client hasn't reviewed, oldest first. A creator's or the ops team's list is
 * always empty: only the client who paid reviews the creator.
 *
 * Nothing is owed while one of their jobs is waiting to be paid for: a creator is holding that slot
 * and has minutes to spare, so the pop-up that blocks the site must not stand between them and the
 * payment form. It comes back the moment that job is settled either way.
 */
export function pendingReviews(db: DB, viewer: Viewer): PendingReview[] {
  if (!viewer.userId || viewer.role !== "client") return [];
  if (db.bookings.some((b) => b.clientId === viewer.userId && b.status === "awaiting_payment")) return [];
  return db.bookings
    .filter((b) => b.clientId === viewer.userId && b.status === "completed" && !b.rating && b.creatorId)
    .sort((a, b) => (a.approvedAt ?? 0) - (b.approvedAt ?? 0))
    .map((b) => ({
      bookingId: b.id,
      code: b.code,
      creatorName: db.creators.find((c) => c.id === b.creatorId)?.name ?? "your creator",
      packageName: findPackage(b.packageId)?.name ?? b.packageId,
      approvedAt: b.approvedAt ?? 0,
      autoApproved: !!b.autoApproved,
    }));
}

export function creatorPublic(c: Creator) {
  return {
    id: c.id,
    name: c.name,
    bio: c.bio,
    cityId: c.cityId,
    zoneId: c.zoneId,
    area: placeName(c.cityId, c.zoneId),
    languages: c.languages,
    services: c.services.map((s) => ({ ...s, price: lowestPrice(s.key) })),
    gear: c.gear,
    instagram: c.instagram,
    portfolio: c.portfolio,
    social: c.social,
    followers: c.followers,
    engagementRate: c.engagementRate,
    available: c.available,
    maxTravelKm: c.maxTravelKm,
    verified: c.verification === "verified",
    verification: c.verification,
    rating: c.ratingCount ? Math.round((c.ratingSum / c.ratingCount) * 10) / 10 : null,
    ratingCount: c.ratingCount,
    jobsDone: c.jobsDone,
  };
}
export type CreatorPublic = ReturnType<typeof creatorPublic>;

export function placeName(cityId: string, zoneId: string) {
  const p = findZone(cityId, zoneId);
  return p ? `${p.zone.name}, ${p.city.name}` : "";
}

export const STATUS_LABEL: Record<Booking["status"], string> = {
  searching: "Finding your creator",
  needs_ops: "Our team is assigning a creator",
  awaiting_payment: "Waiting for payment",
  assigned: "Creator working on it",
  delivered: "Waiting for approval",
  disputed: "Problem reported",
  completed: "Completed",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

export function bookingView(db: DB, b: Booking, viewer: Viewer) {
  const pkg = findPackage(b.packageId)!;
  const creator = b.creatorId ? db.creators.find((c) => c.id === b.creatorId) : undefined;
  const client = db.users.find((u) => u.id === b.clientId);
  const isOps = viewer.role === "ops";
  const isClient = viewer.userId === b.clientId;
  const isJobCreator = !!viewer.creatorId && viewer.creatorId === b.creatorId;
  // Each side learns who the other is, and the creator the exact address, only once it's paid for.
  const paid = !!b.paidAt;
  const creatorUser = creator ? db.users.find((u) => u.id === creator.userId) : undefined;
  const earning = db.ledger.find((l) => l.type === "creator_earning" && l.bookingId === b.id);
  const pendingOffers = db.offers.filter((o) => o.bookingId === b.id && o.status === "pending").length;
  const requested = b.requestedCreatorId ? db.creators.find((c) => c.id === b.requestedCreatorId) : undefined;
  return {
    id: b.id,
    code: b.code,
    status: b.status,
    statusLabel: STATUS_LABEL[b.status],
    packageId: b.packageId,
    packageName: pkg.name,
    packageSummary: pkg.summary,
    packageHours: pkg.hours,
    price: b.price,
    total: b.total,
    creatorPayout: rupees(b.price * CREATOR_SHARE),
    online: !!b.online,
    /** The creator is given the exact address once the client has paid, never before. */
    address: isJobCreator && !paid ? "" : b.address,
    area: b.online ? "Online" : placeName(b.cityId, b.zoneId),
    cityId: b.cityId,
    lat: b.lat,
    lng: b.lng,
    scheduledAt: b.scheduledAt,
    brief: b.brief,
    aspect: b.aspect,
    referenceUrl: b.referenceUrl,
    clientName: isJobCreator && !paid ? "Client" : (client?.name ?? "Client"),
    /** Shared with the creator once the client has paid for the job. */
    clientPhone: isOps || isClient || (isJobCreator && paid) ? client?.phone : undefined,
    creatorPhone: isOps || (isClient && paid) ? creatorUser?.phone : undefined,
    /** Where the creator uploads proof of work. */
    proofUploadUrl: isJobCreator && b.status === "assigned" ? process.env.SRIJAN_PROOF_DRIVE_URL || null : undefined,
    /** Has Srijan sent the creator their share yet? */
    payoutStatus: (isOps || isJobCreator) && earning ? (earning.status === "processing" ? ("owed" as const) : ("paid" as const)) : undefined,
    refund: isOps || isClient ? (b.refund ? { amount: b.refund.amount, status: b.refund.status } : null) : undefined,
    report: b.report ?? null,
    requestedCreatorId: b.requestedCreatorId,
    /** The creator the client sent this job to from their profile, and what became of it. */
    requestedCreator: requested ? { id: requested.id, name: requested.name, outcome: sentOfferOutcome(db, b, requested.id) } : null,
    creator: creator ? creatorPublic(creator) : null,
    dispatch: {
      phase: b.dispatch.phase,
      roundEndsAt: b.dispatch.roundEndsAt,
      widened: b.dispatch.widened,
      radiusKm: b.dispatch.radiusKm,
      notified: b.dispatch.notifiedCreatorIds.length,
      pendingOffers,
    },
    /** Has the client paid? Everything the two sides share hangs off this. */
    paid,
    acceptedAt: b.acceptedAt,
    /** While waiting for payment: the moment the job is dropped if the money hasn't arrived. */
    paymentDueAt: b.status === "awaiting_payment" ? b.paymentDueAt : undefined,
    assignedAt: b.assignedAt,
    deliveredAt: b.deliveredAt,
    autoApproveAt: b.status === "delivered" && b.deliveredAt ? b.deliveredAt + AUTO_APPROVE_MS : null,
    approvedAt: b.approvedAt,
    autoApproved: b.autoApproved,
    rating: b.rating,
    review: b.review,
    reviewedAt: b.reviewedAt,
    reviewOfClient: b.reviewOfClient ?? null,
    /** The client's average from creators' reviews, shown to the creator and ops. */
    clientRating: isOps || (isJobCreator && paid) ? clientRating(db, b.clientId) : undefined,
    createdAt: b.createdAt,
    events: [...b.events].sort((x, y) => x.at - y.at),
  };
}
export type BookingView = ReturnType<typeof bookingView>;

/** What a creator sees in a job alert — no exact address or client code until they accept. */
export function offerView(db: DB, o: Offer) {
  const b = db.bookings.find((x) => x.id === o.bookingId)!;
  const pkg = findPackage(b.packageId)!;
  return {
    id: o.id,
    kind: o.kind,
    status: o.status,
    sentAt: o.sentAt,
    expiresAt: o.expiresAt,
    distanceKm: o.distanceKm,
    bookingId: b.id,
    code: b.code,
    packageName: pkg.name,
    packageSummary: pkg.summary,
    price: b.price,
    payout: rupees(b.price * CREATOR_SHARE),
    online: !!b.online,
    area: b.online ? "Online" : placeName(b.cityId, b.zoneId),
    scheduledAt: b.scheduledAt,
    brief: b.brief,
    aspect: b.aspect,
    alerted: b.dispatch.notifiedCreatorIds.length,
  };
}
export type OfferView = ReturnType<typeof offerView>;

/** What became of a job offer sent to one creator from their profile. */
export function sentOfferOutcome(db: DB, b: Booking, creatorId: string) {
  const direct = db.offers.find((o) => o.bookingId === b.id && o.creatorId === creatorId && o.kind === "direct");
  type Outcome = "waiting" | "taken" | "declined" | "missed" | "offline" | "cancelled" | "other_creator";
  const outcome: Outcome =
    b.creatorId === creatorId
      ? "taken"
      : direct?.status === "pending"
        ? "waiting"
        : direct?.status === "declined"
          ? "declined"
          : !direct
            ? "offline"
            : b.status === "cancelled" || b.status === "refunded"
              ? "cancelled"
              : b.creatorId
                ? "other_creator"
                : "missed";
  return outcome;
}

/**
 * Jobs clients sent to this creator from their profile, newest first, and what became of each.
 * Only what the offer itself showed: no address or client details unless the creator took the job.
 */
export function sentOffersFor(db: DB, creatorId: string, limit = 20) {
  return db.bookings
    .filter((b) => b.requestedCreatorId === creatorId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
    .map((b) => {
      const outcome = sentOfferOutcome(db, b, creatorId);
      const pkg = findPackage(b.packageId);
      return {
        bookingId: b.id,
        code: b.code,
        sentAt: b.createdAt,
        packageName: pkg?.name ?? b.packageId,
        payout: rupees(b.price * CREATOR_SHARE),
        online: !!b.online,
        area: b.online ? "Online" : placeName(b.cityId, b.zoneId),
        scheduledAt: b.scheduledAt,
        outcome,
      };
    });
}
export type SentOfferView = ReturnType<typeof sentOffersFor>[number];

export function campaignView(db: DB, c: Campaign, viewer: Viewer) {
  const m = campaignMath(c);
  const isOps = viewer.role === "ops";
  // The brand that booked it: their agreed budget and who worked on it, but not fees or commission.
  const isOwner = !!viewer.userId && viewer.userId === c.userId;
  return {
    id: c.id,
    code: c.code,
    brandName: c.brandName,
    contactName: isOps ? c.contactName : undefined,
    email: isOps ? c.email : undefined,
    phone: isOps ? c.phone : undefined,
    goal: c.goal,
    regions: c.regions,
    budgetRange: c.budgetRange,
    callAt: c.callAt,
    callMode: c.callMode,
    stage: c.stage,
    stageLabel: CAMPAIGN_STAGES.find((s) => s.key === c.stage)?.label ?? c.stage,
    budget: isOps || isOwner ? c.budget : undefined,
    commissionRate: isOps ? c.commissionRate : undefined,
    math: isOps ? m : undefined,
    advancePaid: c.advancePaid,
    balancePaid: c.balancePaid,
    notes: isOps ? c.notes : undefined,
    creators: c.creators
      .filter((x) => isOps || x.creatorId === viewer.creatorId || (isOwner && (x.status === "accepted" || x.status === "paid")))
      .map((x) => ({
        ...x,
        fee: isOwner && !isOps ? undefined : x.fee,
        name: db.creators.find((cr) => cr.id === x.creatorId)?.name ?? "Creator",
      })),
    createdAt: c.createdAt,
    settledAt: c.settledAt,
  };
}
export type CampaignView = ReturnType<typeof campaignView>;

export function opsOverview(db: DB, now: number) {
  const today = istDay(now);
  const month = istMonth(now);
  const inMonth = (at: number) => istMonth(at) === month;
  const sum = (type: string) => db.ledger.filter((l) => l.type === type && inMonth(l.at)).reduce((s, l) => s + l.amount, 0);
  const shootGmv = db.ledger
    .filter((l) => l.type === "platform_fee" && inMonth(l.at))
    .reduce((s, l) => {
      const b = db.bookings.find((x) => x.id === l.bookingId);
      return s + (b?.price ?? 0);
    }, 0);
  const platformFee = sum("platform_fee");
  const campaignBilled = sum("campaign_payment");
  const campaignCommission = sum("campaign_commission");
  const openCampaigns = db.campaigns.filter((c) => c.stage !== "closed");
  return {
    kpis: {
      shootsToday: db.bookings.filter((b) => istDay(b.scheduledAt) === today && !["refunded", "cancelled"].includes(b.status)).length,
      liveNow: db.bookings.filter((b) => b.status === "assigned").length,
      searching: db.bookings.filter((b) => b.status === "searching").length,
      needsOps: db.bookings.filter((b) => b.status === "needs_ops").length,
      /** Jobs a creator has taken that the client still has to pay for. */
      awaitingPayment: db.bookings.filter((b) => b.status === "awaiting_payment").length,
      pipelineValue: openCampaigns.reduce((s, c) => s + (c.budget ?? 0), 0),
      revenueMonth: platformFee + campaignCommission,
      pendingVerification: db.creators.filter((c) => c.verification === "pending").length,
    },
    money: {
      month,
      shootGmv,
      platformFee,
      campaignBilled,
      campaignCommission,
      refunds: sum("client_refund"),
    },
  };
}
