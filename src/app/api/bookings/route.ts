import { NextResponse } from "next/server";
import { api, readJson } from "@/lib/server/api";
import { assertRazorpayConfigured, createOrder, razorpayKeyId } from "@/lib/server/razorpay";
import { limitByIp } from "@/lib/server/rateLimit";
import { withDb } from "@/lib/server/store";
import { bookingView } from "@/lib/domain/views";
import { createBookings, type NewOrderInput } from "@/lib/domain/bookings";
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

/** Creates one unpaid booking per service and a single Razorpay order for their total. The browser then opens Razorpay Checkout. */
export async function POST(req: Request) {
  const limited = await limitByIp("booking", 20, 60 * 60_000);
  if (limited) return limited;
  const input = await readJson<NewOrderInput>(req);
  let made: { ids: string[]; code: string; total: number; description: string; prefill: { name: string; email?: string; contact?: string } } | undefined;
  const first = await api(
    ({ db, now, user }) => {
      assertRazorpayConfigured();
      const list = createBookings(db, user!.id, input, now);
      const code = list[0]!.code;
      made = {
        ids: list.map((b) => b.id),
        code,
        total: list.reduce((sum, b) => sum + b.total, 0),
        description: `${list.length === 1 ? (findPackage(list[0]!.packageId)?.name ?? "Srijan job") : `${list.length} services`} · ${code}`,
        prefill: { name: user!.name, email: user!.email, contact: user!.phone?.replace(/\s/g, "") },
      };
      return null;
    },
    { role: "client" },
  );
  if (!first.ok || !made) return first;

  const order = made;
  let orderId: string;
  try {
    orderId = (await createOrder(order.total, order.code, { bookingId: order.ids[0]! })).id;
  } catch (e) {
    console.error("Razorpay order failed", e);
    await withDb((db) => {
      for (const b of db.bookings) if (order.ids.includes(b.id)) b.status = "cancelled";
    });
    return NextResponse.json({ ok: false, error: "We couldn’t start the payment. You haven’t been charged. Please try again." }, { status: 502 });
  }
  return api(
    ({ db, viewer }) => {
      const list = db.bookings.filter((b) => order.ids.includes(b.id));
      for (const b of list) b.razorpayOrderId = orderId;
      return {
        bookings: list.map((b) => bookingView(db, b, viewer)),
        checkout: {
          key: razorpayKeyId(),
          orderId,
          amount: order.total * 100,
          currency: "INR",
          description: order.description,
          prefill: order.prefill,
        },
      };
    },
    { role: "client" },
  );
}
