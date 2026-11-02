// Connects Razorpay to bookings. Razorpay is never called while the database is locked: every other
// request would have to wait for it.
import { after } from "next/server";
import { recordPayment } from "@/lib/domain/bookings";
import { withDb } from "./store";
import { capturePayment, createRefund, fetchPayment, findRefundByReceipt, RazorpayError, type RazorpayPayment } from "./razorpay";
import { bookingAlertLines, sendWhatsAppAlert } from "./whatsapp";

/** Asks Razorpay what really happened and captures the money if it's only authorized. */
async function capturedPayment(paymentId: string, paise: number): Promise<RazorpayPayment> {
  const p = await fetchPayment(paymentId);
  if (p.status !== "authorized") return p;
  try {
    return await capturePayment(paymentId, paise);
  } catch (e) {
    // Checkout and the webhook can both get here, or auto-capture may have just run.
    if (e instanceof RazorpayError) return fetchPayment(paymentId);
    throw e;
  }
}

/**
 * Called by both the checkout page and the webhook, in whichever order they arrive. Starts the
 * search for a creator once, and only if Razorpay confirms the right amount for this order.
 */
export async function confirmPayment(orderId: string, paymentId: string) {
  const { result: found } = await withDb((db) => {
    const b = db.bookings.find((x) => x.razorpayOrderId === orderId);
    return b ? { id: b.id, paise: b.total * 100, known: !!b.razorpayPaymentId } : null;
  });
  if (!found) return "unknown_order" as const;
  if (found.known) return "already" as const;

  const p = await capturedPayment(paymentId, found.paise);
  if (p.order_id !== orderId || p.amount !== found.paise) {
    console.error(`Razorpay payment ${paymentId} doesn't match order ${orderId}`);
    return "mismatch" as const;
  }
  if (p.status !== "captured") return "not_captured" as const;

  const { result } = await withDb((db, now) => {
    const b = db.bookings.find((x) => x.id === found.id)!;
    const outcome = recordPayment(db, b, paymentId, now);
    return { outcome, alert: outcome === "paid" ? bookingAlertLines(db, b) : undefined };
  });
  if (result.alert) {
    const lines = result.alert;
    after(() => sendWhatsAppAlert(lines));
  }
  if (result.outcome === "refund") await processRefund(found.id);
  return result.outcome;
}

/** Sends a pending refund to Razorpay. Never throws: a failure is saved for ops to retry. */
export async function processRefund(bookingId: string) {
  const { result: job } = await withDb((db) => {
    const b = db.bookings.find((x) => x.id === bookingId);
    return b?.refund?.status === "pending" && !b.refund.razorpayRefundId && b.razorpayPaymentId
      ? { paymentId: b.razorpayPaymentId, amount: b.refund.amount, receipt: `refund_${b.code}` }
      : null;
  });
  if (!job) return;

  let update: { status: "pending" | "processed" | "failed"; razorpayRefundId?: string; error?: string };
  try {
    const r = await createRefund(job.paymentId, job.amount, job.receipt);
    update = { status: r.status, razorpayRefundId: r.id };
  } catch (e) {
    update = await afterRefundError(job.paymentId, job.receipt, e);
  }
  await withDb((db, now) => {
    const b = db.bookings.find((x) => x.id === bookingId);
    if (!b?.refund) return;
    Object.assign(b.refund, { error: undefined }, update);
    if (update.status === "failed") b.events.push({ at: now, text: "Refund failed at Razorpay · Srijan team notified" });
  });
}

/** An earlier try may have gone through even though we never saw the reply. */
async function afterRefundError(paymentId: string, receipt: string, e: unknown) {
  console.error(`Refund ${receipt} failed`, e);
  try {
    const existing = await findRefundByReceipt(paymentId, receipt);
    if (existing) return { status: existing.status, razorpayRefundId: existing.id };
  } catch {
    /* report the original error */
  }
  return { status: "failed" as const, error: (e as Error).message.slice(0, 300) };
}

/** Razorpay's webhook reports how a refund ended. */
export async function recordRefundResult(paymentId: string, refundId: string, status: "processed" | "failed") {
  await withDb((db, now) => {
    const b = db.bookings.find((x) => x.razorpayPaymentId === paymentId);
    if (!b?.refund || b.refund.status === status) return;
    b.refund.status = status;
    b.refund.razorpayRefundId = refundId;
    if (status === "failed") b.events.push({ at: now, text: "Refund failed at Razorpay · Srijan team notified" });
  });
}
