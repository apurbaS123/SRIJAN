// Connects Razorpay to bookings. Razorpay is never called while the database is locked: every other
// request would have to wait for it.
import { after } from "next/server";
import { recordPayment } from "@/lib/domain/bookings";
import { withDb } from "./store";
import { capturePayment, fetchPayment, RazorpayError, type RazorpayPayment } from "./razorpay";
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
  return result.outcome;
}
