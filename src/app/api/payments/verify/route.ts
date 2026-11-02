import { NextResponse } from "next/server";
import { api, readJson } from "@/lib/server/api";
import { confirmPayment } from "@/lib/server/payments";
import { checkoutSignatureValid } from "@/lib/server/razorpay";
import { assert } from "@/lib/domain/util";

interface Body {
  bookingId?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
}

/** Checkout finished in the browser. The signature proves the reply really came from Razorpay. */
export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  let orderId: string | undefined;
  const res = await api(
    ({ db, user }) => {
      const b = db.bookings.find((x) => x.id === body.bookingId);
      assert(b && b.clientId === user!.id && b.razorpayOrderId, "Booking not found", 404);
      assert(checkoutSignatureValid(b.razorpayOrderId, body.razorpay_payment_id, body.razorpay_signature), "We couldn’t verify this payment");
      orderId = b.razorpayOrderId;
      return { bookingId: b.id };
    },
    { role: "client" },
  );
  if (!res.ok || !orderId) return res;
  try {
    const outcome = await confirmPayment(orderId, String(body.razorpay_payment_id));
    return NextResponse.json({ ok: true, data: { bookingId: body.bookingId, outcome } });
  } catch (e) {
    // The webhook will still confirm it, so the booking page just waits.
    console.error(e);
    return NextResponse.json({ ok: true, data: { bookingId: body.bookingId, outcome: "pending" } });
  }
}
