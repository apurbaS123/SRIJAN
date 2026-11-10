"use client";
// Opens Razorpay Checkout, the payment form Razorpay hosts. Card and UPI details go straight to
// Razorpay and never touch this site.

export interface CheckoutDetails {
  key: string;
  orderId: string;
  amount: number;
  currency: string;
  description: string;
  prefill: { name?: string; email?: string; contact?: string };
}

export interface CheckoutSuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open(): void;
}
type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

const SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";
/** Closes well before the client's time to pay runs out (PAYMENT_WINDOW_MS, from the accept). */
const CHECKOUT_TIMEOUT_S = 20 * 60;

function loadScript() {
  return new Promise<RazorpayConstructor>((resolve, reject) => {
    const existing = (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay;
    if (existing) return resolve(existing);
    const s = document.createElement("script");
    s.src = SCRIPT_URL;
    s.onload = () => resolve((window as unknown as { Razorpay: RazorpayConstructor }).Razorpay);
    s.onerror = () => {
      s.remove();
      reject(new Error("We couldn’t open the payment form. Check your connection and try again."));
    };
    document.head.appendChild(s);
  });
}

/** Resolves with Razorpay's reply once paid, or null if the person closes the form. */
export async function openCheckout(c: CheckoutDetails) {
  const Razorpay = await loadScript();
  return new Promise<CheckoutSuccess | null>((resolve) => {
    new Razorpay({
      key: c.key,
      order_id: c.orderId,
      amount: c.amount,
      currency: c.currency,
      name: "Srijan",
      description: c.description,
      prefill: c.prefill,
      theme: { color: "#7c3aed" },
      timeout: CHECKOUT_TIMEOUT_S,
      handler: (reply: CheckoutSuccess) => resolve(reply),
      modal: { ondismiss: () => resolve(null) },
    }).open();
  });
}
