import { NextResponse } from "next/server";
import { confirmPayment, recordRefundResult } from "@/lib/server/payments";
import { webhookSignatureValid } from "@/lib/server/razorpay";

interface WebhookEvent {
  event?: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string | null } };
    refund?: { entity?: { id?: string; payment_id?: string } };
  };
}

/**
 * Razorpay tells us about payments here, so a booking is still confirmed if the client closes the
 * page straight after paying. Events can repeat or arrive out of order, and both are handled.
 * Anything other than a 2xx makes Razorpay send the event again.
 */
export async function POST(req: Request) {
  // The signature covers the exact bytes sent, so read the raw text before parsing it.
  const raw = await req.text();
  if (!webhookSignatureValid(raw, req.headers.get("x-razorpay-signature"))) {
    return NextResponse.json({ ok: false, error: "Bad signature" }, { status: 400 });
  }
  let event: WebhookEvent;
  try {
    event = JSON.parse(raw) as WebhookEvent;
  } catch {
    return NextResponse.json({ ok: false, error: "Bad JSON" }, { status: 400 });
  }
  try {
    const payment = event.payload?.payment?.entity;
    const refund = event.payload?.refund?.entity;
    if (["payment.authorized", "payment.captured", "order.paid"].includes(event.event ?? "") && payment?.id && payment.order_id) {
      await confirmPayment(payment.order_id, payment.id);
    } else if ((event.event === "refund.processed" || event.event === "refund.failed") && refund?.id && refund.payment_id) {
      await recordRefundResult(refund.payment_id, refund.id, event.event === "refund.processed" ? "processed" : "failed");
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Razorpay webhook failed", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
