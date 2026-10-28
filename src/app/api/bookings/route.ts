import { api, readJson } from "@/lib/server/api";
import { bookingView } from "@/lib/domain/views";
import { createBooking, type NewBookingInput } from "@/lib/domain/bookings";

/** Clients see their bookings, creators their jobs, ops everything. */
export async function GET() {
  return api(
    ({ db, user, viewer }) => {
      const list =
        user!.role === "ops"
          ? db.bookings
          : user!.role === "creator"
            ? db.bookings.filter((b) => b.creatorId === user!.creatorId)
            : db.bookings.filter((b) => b.clientId === user!.id);
      return [...list].sort((a, b) => b.createdAt - a.createdAt).map((b) => bookingView(db, b, viewer));
    },
    { role: ["client", "creator", "ops"] },
  );
}

/** Book and pay (payment is mocked — plug in Razorpay/Cashfree here). */
export async function POST(req: Request) {
  const input = await readJson<NewBookingInput>(req);
  return api(
    ({ db, now, user, viewer }) => {
      const b = createBooking(db, user!.id, input, now);
      return bookingView(db, b, viewer);
    },
    { role: "client" },
  );
}
