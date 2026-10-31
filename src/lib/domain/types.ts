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

export interface User {
  id: string;
  role: Role;
  name: string;
  email?: string;
  phone?: string;
  /** Set when role === "creator". */
  creatorId?: string;
  createdAt: number;
}

export interface CreatorService {
  key: ServiceKey;
  title: string;
  description: string;
  /** Price in rupees; null means "quote on request". */
  price: number | null;
}

export type Verification = "pending" | "verified" | "rejected";

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
  /** Main social media account, linked on the public profile. */
  social?: { platform: SocialPlatform; url: string };
  followers?: number;
  /** Percent, e.g. 6.1 */
  engagementRate?: number;
  /** Opted in to same-day shoot jobs. */
  onDemand: boolean;
  /** Online toggle: only available creators get job alerts. */
  available: boolean;
  /** Furthest the creator is willing to travel for a job. */
  maxTravelKm: number;
  verification: Verification;
  kyc: { aadhaar: boolean; pan: boolean };
  upiId?: string;
  ratingSum: number;
  ratingCount: number;
  jobsDone: number;
  createdAt: number;
}

export type BookingStatus =
  | "searching" // paid, alerts going out
  | "needs_ops" // nobody accepted in time; ops must assign or refund
  | "assigned" // creator accepted, travelling
  | "shooting" // checked in with client's code
  | "editing" // shoot finished, editing
  | "delivered" // video uploaded, waiting for client
  | "revision_requested"
  | "completed" // approved (by client or automatically), money settled
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
  gst: number;
  total: number;
  address: string;
  cityId: string;
  zoneId: string;
  lat: number;
  lng: number;
  scheduledAt: number;
  brief: string;
  aspect: "9:16" | "16:9" | "1:1";
  referenceUrl?: string;
  requestedCreatorId?: string;
  creatorId?: string;
  status: BookingStatus;
  /** 4-digit start code the client gives the creator on arrival. */
  otp: string;
  createdAt: number;
  paidAt: number;
  dispatch: DispatchState;
  assignedAt?: number;
  checkInAt?: number;
  shootEndAt?: number;
  deliveryDueAt: number;
  deliveredAt?: number;
  firstDeliveredAt?: number;
  videoUrl?: string;
  revisionsUsed: number;
  revisionNote?: string;
  approvedAt?: number;
  autoApproved?: boolean;
  /** The client's review of the creator: 1–5 stars, optional text. */
  rating?: number;
  review?: string;
  reviewedAt?: number;
  /** The creator's review of the client. */
  reviewOfClient?: { rating: number; text?: string; at: number };
  /** Percent cut from the creator's payout for late delivery. */
  latePenaltyPct?: number;
  refundedAt?: number;
  /** Wrong start codes entered by the creator; check-in locks after a few. */
  checkInFailures?: number;
  events: BookingEvent[];
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
  | "client_payment" // client paid for a shoot (incl. GST)
  | "gst_collected"
  | "creator_earning" // credited to a creator wallet (shoot or campaign)
  | "platform_fee" // Srijan's 20% on shoots
  | "client_refund"
  | "campaign_payment" // brand paid campaign budget
  | "campaign_commission" // Srijan's share of a campaign
  | "withdrawal"; // creator moved money to UPI

export interface LedgerEntry {
  id: string;
  at: number;
  type: LedgerType;
  amount: number;
  bookingId?: string;
  campaignId?: string;
  creatorId?: string;
  note?: string;
  /** For withdrawals. */
  status?: "processing" | "paid";
  fee?: number;
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
}
