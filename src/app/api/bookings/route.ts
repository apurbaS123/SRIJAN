import { after } from "next/server";
import { api, readJson } from "@/lib/server/api";
import { bookingAlertLines, sendWhatsAppAlert } from "@/lib/server/whatsapp";
import { limitByIp } from "@/lib/server/rateLimit";
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
  const limited = await limitByIp("booking", 20, 60 * 60_000);
  if (limited) return limited;
  const input = await readJson<NewBookingInput>(req);
  let alert: string[] | undefined;
  const res = await api(
    ({ db, now, user, viewer }) => {
      const b = createBooking(db, user!.id, input, now);
      alert = bookingAlertLines(db, b);
      return bookingView(db, b, viewer);
    },
    { role: "client" },
  );
  // Only alert once the booking is saved; runs after the response is sent.
  if (res.ok && alert) {
    const lines = alert;
    after(() => sendWhatsAppAlert(lines));
  }
  return res;
}
