// Core data model for Srijan. Everything the app stores lives in one `DB` object.
// When you move to Postgres, each array below becomes a table with the same fields.

export type Role = "client" | "creator" | "ops";

export type ServiceKey =
  | "videography"
  | "video_editing"
  | "influencer"
  | "photography"
  | "graphic_design"
  | "content_writing"
  | "voice_over"
  | "social_media";

export type SocialPlatform = "instagram" | "youtube" | "facebook" | "other";

/** A browser or phone signed up for push notifications, as the Push API describes it. */
export interface PushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  addedAt: number;
  /** Set when the push service last rejected it, so a dead one can be dropped. */
  failedAt?: number;
}

export interface User {
  id: string;
  role: Role;
  name: string;
  email?: string;
  phone?: string;
  /** Set when role === "creator". */
  creatorId?: string;
  createdAt: number;
  /** Salted scrypt hash. Never send this to a browser. */
  passwordHash?: string;
  passwordFails?: number;
  passwordLockedUntil?: number;
  /** Every device this person turned push notifications on for. */
  push?: PushSub[];
}

export interface CreatorService {
  key: ServiceKey;
  title: string;
  description: string;
  /** Only in what's sent to screens: the service's lowest menu price. Anything saved on an older profile is ignored. */
  price: number | null;
}

export interface BankDetails {
  accountName: string;
  accountNumber: string;
  ifsc: string;
}

export type Verification = "pending" | "verified" | "rejected";

/**
 * Aadhaar KYC done by the creator themselves through DigiLocker, the government's document wallet.
 * They sign in to DigiLocker, agree to share their Aadhaar, and come back verified — no waiting for
 * the Srijan team. Only what we need is kept: never the full Aadhaar or PAN number.
 */
export interface DigilockerKyc {
  /** While the handshake is open: the one-time value DigiLocker sends back, so the reply can be trusted. */
  state?: string;
  /** While the handshake is open: the PKCE verifier that proves this app started it. Never sent to a browser. */
  verifier?: string;
  /** When the creator was sent to DigiLocker. The handshake is only good for a few minutes. */
  startedAt?: number;
  /** When DigiLocker confirmed who they are. */
  verifiedAt?: number;
  /** The name on their Aadhaar, as DigiLocker spells it. */
  name?: string;
  dob?: string;
  gender?: string;
  /** Last 4 digits of the Aadhaar number, for support. The rest is never stored. */
  aadhaarLast4?: string;
  /** DigiLocker's own id for this person, so a second account can't claim the same Aadhaar. */
  digilockerId?: string;
  /** True once their PAN card was found in their DigiLocker. */
  pan?: boolean;
  /**
   * Why this reply couldn't verify the creator by itself, so the Srijan team looks at it by hand
   * instead: the Aadhaar name doesn't look like the name on the profile, or the same Aadhaar is
   * already verified on another Srijan account.
   */
  review?: "name_mismatch" | "duplicate";
}

export interface Creator {
  id: string;
  userId: string;
  name: string;
  bio: string;
  cityId: string;
  zoneId: string;
  /** Current location used for matching. Starts at the base zone. */
  lat: number;
  lng: number;
  languages: string[];
  services: CreatorService[];
  gear: string[];
  instagram?: string;
  /** Link to the creator's portfolio of work. Optional. */
  portfolio?: string;
  /** Main social media account, linked on the public profile. */
  social?: { platform: SocialPlatform; url: string };
  followers?: number;
  /** Percent, e.g. 6.1 */
  engagementRate?: number;
  /** Opted in to same-day shoot jobs. */
  /** No longer used: everyone gets alerts for the services they offer. Older profiles may still say false. */
  onDemand: boolean;
  /** Online toggle: only available creators get job alerts. */
  available: boolean;
  /** Furthest the creator is willing to travel for a job. */
  maxTravelKm: number;
  verification: Verification;
  /** `aadhaar` and `pan` are true once checked — by DigiLocker, or by the Srijan team by hand. */
  kyc: { aadhaar: boolean; pan: boolean; digilocker?: DigilockerKyc };
  /** How this creator gets paid. Older accounts have only upiId, which means UPI. */
  payoutMethod?: "upi" | "bank";
  upiId?: string;
  bank?: BankDetails;
  ratingSum: number;
  ratingCount: number;
  jobsDone: number;
  createdAt: number;
}

export type BookingStatus =
  | "searching" // placed, alerts going out; nothing has been paid yet
  | "needs_ops" // nobody accepted in time; ops must assign or drop it
  | "awaiting_payment" // a creator accepted: the client has to pay to confirm the job
  | "assigned" // paid, and the creator is doing the job
  | "delivered" // creator pressed Mark As Finished, waiting for the client
  | "disputed" // client reported a problem; payout stopped until ops decides
  | "completed" // approved (by client or automatically), creator payout owed
  | "refunded"
  | "cancelled";

export interface BookingEvent {
  at: number;
  text: string;
}

export interface DispatchState {
  /** direct = only the creator the client picked; broadcast = everyone nearby. */
  phase: "direct" | "broadcast" | "done";
  roundStartedAt: number;
  roundEndsAt: number;
  widened: boolean;
  radiusKm: number;
  notifiedCreatorIds: string[];
}

export interface Booking {
  id: string;
  code: string;
  clientId: string;
  packageId: string;
  price: number;
  /** What the client pays. Same as price: Srijan adds nothing on top. */
  total: number;
  /** Done remotely (e.g. video editing): no visit, so no location or distance limit. */
  online?: boolean;
  /** Empty for online jobs, like cityId and zoneId. */
  address: string;
  cityId: string;
  zoneId: string;
  lat: number;
  lng: number;
  scheduledAt: number;
  brief: string;
  aspect: "9:16" | "16:9" | "1:1";
  referenceUrl?: string;
  /** The creator the client sent this job to from their profile. They get it first, alone. */
  requestedCreatorId?: string;
  creatorId?: string;
  status: BookingStatus;
  createdAt: number;
  /** When a creator accepted the job (or ops assigned one). The client is asked to pay from here. */
  acceptedAt?: number;
  /** The client has until this moment to pay, or the job is dropped and the creator released. */
  paymentDueAt?: number;
  /** Set once Razorpay has confirmed the payment. The job is only really the creator's from here. */
  paidAt?: number;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  /** A refund asked for through Razorpay. */
  refund?: BookingRefund;
  /** The client's "Report a problem" note. */
  report?: { note: string; at: number };
  dispatch: DispatchState;
  /** When the ops team was told this job starts in 20 minutes. Set once, so the alert can't repeat. */
  opsRemindedAt?: number;
  /** When the payment landed and the job became the creator's. */
  assignedAt?: number;
  /** When the creator pressed Mark As Finished. */
  deliveredAt?: number;
  approvedAt?: number;
  autoApproved?: boolean;
  /** The client's review of the creator: 1–5 stars, optional text. */
  rating?: number;
  review?: string;
  reviewedAt?: number;
  /** The creator's review of the client. */
  reviewOfClient?: { rating: number; text?: string; at: number };
  refundedAt?: number;
  events: BookingEvent[];
}

export interface BookingRefund {
  amount: number;
  reason: string;
  /** "pending" until ops has refunded it in the Razorpay dashboard and marked it sent. */
  status: "pending" | "sent";
  sentAt?: number;
  paymentRef?: string;
}

export type OfferStatus = "pending" | "accepted" | "declined" | "expired" | "taken";

export interface Offer {
  id: string;
  bookingId: string;
  creatorId: string;
  kind: "direct" | "broadcast";
  sentAt: number;
  expiresAt: number;
  distanceKm: number;
  status: OfferStatus;
  respondedAt?: number;
}

export type LedgerType =
  | "client_payment" // client paid for a job
  | "gst_collected" // older bookings only
  | "creator_earning" // owed to a creator (shoot or campaign); ops pays it by hand
  | "platform_fee" // Srijan's 20% on shoots
  | "client_refund"
  | "campaign_payment" // brand paid campaign budget
  | "campaign_commission" // Srijan's share of a campaign
  | "withdrawal"; // older wallet withdrawals only

export interface LedgerEntry {
  id: string;
  at: number;
  type: LedgerType;
  amount: number;
  bookingId?: string;
  campaignId?: string;
  creatorId?: string;
  note?: string;
  /** creator_earning: "processing" = ops still has to pay it. Older entries have no status. */
  status?: "processing" | "paid";
  fee?: number;
  /** When ops paid it, and the bank or UPI reference they noted. */
  paidAt?: number;
  paymentRef?: string;
}

export type CampaignStage =
  | "call_booked"
  | "proposal_sent"
  | "booking_creators"
  | "content_review"
  | "live"
  | "report_settle"
  | "closed";

export interface CampaignCreator {
  creatorId: string;
  deliverables: string;
  fee: number;
  status: "invited" | "accepted" | "declined" | "paid";
  invitedAt: number;
}

export interface Campaign {
  id: string;
  code: string;
  userId?: string;
  brandName: string;
  contactName: string;
  email: string;
  phone: string;
  goal: string;
  regions: string[];
  budgetRange: string;
  callAt: number;
  callMode: "video" | "phone" | "office";
  stage: CampaignStage;
  /** Final agreed budget in rupees, set by ops after the proposal. */
  budget: number | null;
  /** Srijan commission, 0.30–0.35. */
  commissionRate: number;
  advancePaid: boolean;
  balancePaid: boolean;
  creators: CampaignCreator[];
  notes: string;
  createdAt: number;
  settledAt?: number;
}

/** A one-time sign-in code sent to a phone. Only a hash of the code is stored. */
export interface OtpChallenge {
  /** Lower-cased email address the code was sent to. */
  email: string;
  codeHash: string;
  sentAt: number;
  expiresAt: number;
  attempts: number;
}

/** A message for one user, shown by the on-site demo notification. */
export interface Notification {
  id: string;
  userId: string;
  at: number;
  title: string;
  lines: string[];
  href: string;
  /** Job alerts disappear once the offer is no longer open. */
  offerId?: string;
  readAt?: number;
  /** Set once this has been handed to the push service, so a phone is never buzzed twice. */
  pushedAt?: number;
}

export interface DB {
  version: 1;
  seq: number;
  users: User[];
  creators: Creator[];
  bookings: Booking[];
  offers: Offer[];
  ledger: LedgerEntry[];
  campaigns: Campaign[];
  otps?: OtpChallenge[];
  notifications?: Notification[];
}
