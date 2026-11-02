// Razorpay's REST API. Called only from the server: the key secret must never reach a browser.
// Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET (see README → Payments).
import { createHmac, timingSafeEqual } from "node:crypto";
import { DomainError } from "@/lib/domain/util";

// Only the end-to-end test changes this, to reach its fake Razorpay server.
const apiBase = () => process.env.RAZORPAY_API_BASE || "https://api.razorpay.com";

export class RazorpayError extends Error {}

export function razorpayKeyId() {
  return process.env.RAZORPAY_KEY_ID ?? "";
}

export function assertRazorpayConfigured() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new DomainError("Online payment isn’t set up yet. Please try again later.", 503);
  }
}

async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  assertRazorpayConfigured();
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const res = await fetch(`${apiBase()}/v1${path}`, {
    method,
    headers: { Authorization: `Basic ${auth}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => null)) as { error?: { description?: string } } | null;
  if (!res.ok) throw new RazorpayError(json?.error?.description || `Razorpay replied ${res.status}`);
  return json as T;
}

export interface RazorpayPayment {
  id: string;
  order_id: string | null;
  amount: number;
  status: string;
}

export interface RazorpayRefund {
  id: string;
  receipt?: string | null;
  status: "pending" | "processed" | "failed";
}

/** Amounts go to Razorpay in paise. */
export function createOrder(rupees: number, receipt: string, notes: Record<string, string>) {
  return request<{ id: string; amount: number; currency: string }>("POST", "/orders", { amount: rupees * 100, currency: "INR", receipt, notes });
}

export function fetchPayment(paymentId: string) {
  return request<RazorpayPayment>("GET", `/payments/${encodeURIComponent(paymentId)}`);
}

export function capturePayment(paymentId: string, paise: number) {
  return request<RazorpayPayment>("POST", `/payments/${encodeURIComponent(paymentId)}/capture`, { amount: paise, currency: "INR" });
}

/** Razorpay refuses a second refund with the same receipt, so a retry can't pay out twice. */
export function createRefund(paymentId: string, rupees: number, receipt: string) {
  return request<RazorpayRefund>("POST", `/payments/${encodeURIComponent(paymentId)}/refund`, { amount: rupees * 100, receipt });
}

export async function findRefundByReceipt(paymentId: string, receipt: string) {
  const list = await request<{ items: RazorpayRefund[] }>("GET", `/payments/${encodeURIComponent(paymentId)}/refunds`);
  return list.items.find((r) => r.receipt === receipt);
}

function hmacEquals(secret: string, message: string, given: unknown) {
  const expected = Buffer.from(createHmac("sha256", secret).update(message).digest("hex"));
  const actual = Buffer.from(String(given ?? ""));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** `orderId` must come from our own records, not from the browser. */
export function checkoutSignatureValid(orderId: string, paymentId: unknown, signature: unknown) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  return !!secret && hmacEquals(secret, `${orderId}|${String(paymentId ?? "")}`, signature);
}

export function webhookSignatureValid(rawBody: string, signature: unknown) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  return !!secret && hmacEquals(secret, rawBody, signature);
}
