import { NextResponse } from "next/server";
import { api, readJson } from "@/lib/server/api";
import { assertRazorpayConfigured, createOrder, razorpayKeyId } from "@/lib/server/razorpay";
import { limitByIp } from "@/lib/server/rateLimit";
import { withDb } from "@/lib/server/store";
import { bookingView } from "@/lib/domain/views";
import { createBooking, type NewBookingInput } from "@/lib/domain/bookings";
import { findPackage } from "@/lib/domain/config";
import type { Booking } from "@/lib/domain/types";

/** Bookings nobody paid for are clutter, not history. */
const everPaid = (b: Booking) => b.status !== "awaiting_payment" && !(b.status === "cancelled" && !b.paidAt);

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
      return list.filter(everPaid).sort((a, b) => b.createdAt - a.createdAt).map((b) => bookingView(db, b, viewer));
    },
    { role: ["client", "creator", "ops"] },
  );
}

/** Creates an unpaid booking and its Razorpay order. The browser then opens Razorpay Checkout. */
export async function POST(req: Request) {
  const limited = await limitByIp("booking", 20, 60 * 60_000);
  if (limited) return limited;
  const input = await readJson<NewBookingInput>(req);
  let made: { id: string; code: string; total: number; packageName: string; prefill: { name: string; email?: string; contact?: string } } | undefined;
  const first = await api(
    ({ db, now, user }) => {
      assertRazorpayConfigured();
      const b = createBooking(db, user!.id, input, now);
      made = {
        id: b.id,
        code: b.code,
        total: b.total,
        packageName: findPackage(b.packageId)?.name ?? "Srijan job",
        prefill: { name: user!.name, email: user!.email, contact: user!.phone?.replace(/\s/g, "") },
      };
      return null;
    },
    { role: "client" },
  );
  if (!first.ok || !made) return first;

  const booking = made;
  let orderId: string;
  try {
    orderId = (await createOrder(booking.total, booking.code, { bookingId: booking.id })).id;
  } catch (e) {
    console.error("Razorpay order failed", e);
    await withDb((db) => {
      const b = db.bookings.find((x) => x.id === booking.id);
      if (b) b.status = "cancelled";
    });
    return NextResponse.json({ ok: false, error: "We couldn’t start the payment. You haven’t been charged. Please try again." }, { status: 502 });
  }
  return api(
    ({ db, viewer }) => {
      const b = db.bookings.find((x) => x.id === booking.id)!;
      b.razorpayOrderId = orderId;
      return {
        booking: bookingView(db, b, viewer),
        checkout: {
          key: razorpayKeyId(),
          orderId,
          amount: booking.total * 100,
          currency: "INR",
          description: `${booking.packageName} · ${booking.code}`,
          prefill: booking.prefill,
        },
      };
    },
    { role: "client" },
  );
}
