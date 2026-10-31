import { api, readJson } from "@/lib/server/api";
import { bookingView } from "@/lib/domain/views";
import { approve, cancelByClient, checkIn, deliver, finishShoot, refund, requestRevision, reviewClient, reviewCreator } from "@/lib/domain/bookings";
import { manualAssign } from "@/lib/domain/dispatch";
import { DomainError, assert, cleanText } from "@/lib/domain/util";
import type { Booking, DB, User } from "@/lib/domain/types";

function canSee(b: Booking | undefined, user: User): b is Booking {
  if (!b) return false;
  if (user.role === "ops") return true;
  if (user.role === "creator") return b.creatorId === user.creatorId;
  return b.clientId === user.id;
}

function find(db: DB, id: string, user: User) {
  const b = db.bookings.find((x) => x.id === id || x.code === id);
  assert(canSee(b, user), "Booking not found", 404);
  return b;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return api(({ db, user, viewer }) => bookingView(db, find(db, id, user!), viewer), { role: ["client", "creator", "ops"] });
}

type Action =
  | { action: "approve" }
  | { action: "review"; rating: number; text?: string }
  | { action: "revision"; note: string }
  | { action: "cancel" }
  | { action: "checkin"; otp: string; lat: number; lng: number }
  | { action: "finish" }
  | { action: "deliver"; videoUrl: string }
  | { action: "assign"; creatorId: string }
  | { action: "refund"; reason?: string };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson<Action>(req);
  return api(
    ({ db, now, user, viewer }) => {
      const u = user!;
      const b = find(db, id, u);
      const as = (role: User["role"]) => assert(u.role === role, "Your account can’t do that", 403);
      switch (body.action) {
        case "approve":
          as("client");
          approve(db, b.id, u.id, now);
          break;
        case "review":
          if (u.role === "client") reviewCreator(db, b.id, u.id, body.rating, body.text, now);
          else if (u.role === "creator") reviewClient(db, b.id, u.creatorId!, body.rating, body.text, now);
          else throw new DomainError("Your account can’t do that", 403);
          break;
        case "revision":
          as("client");
          requestRevision(db, b.id, u.id, body.note, now);
          break;
        case "cancel":
          as("client");
          cancelByClient(db, b.id, u.id, now);
          break;
        case "checkin":
          as("creator");
          checkIn(db, b.id, u.creatorId!, body.otp, { lat: Number(body.lat), lng: Number(body.lng) }, now);
          break;
        case "finish":
          as("creator");
          finishShoot(db, b.id, u.creatorId!, now);
          break;
        case "deliver":
          as("creator");
          deliver(db, b.id, u.creatorId!, body.videoUrl, now);
          break;
        case "assign":
          as("ops");
          manualAssign(db, b, body.creatorId, now);
          break;
        case "refund":
          as("ops");
          refund(db, b, cleanText(body.reason, 200, "the reason", true) || "refunded by Srijan team", now);
          break;
        default:
          throw new DomainError("Unknown action");
      }
      return bookingView(db, b, viewer);
    },
    { role: ["client", "creator", "ops"] },
  );
}
