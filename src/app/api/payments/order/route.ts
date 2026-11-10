import { NextResponse } from "next/server";
import { api, readJson } from "@/lib/server/api";
import { assertRazorpayConfigured, createOrder, razorpayKeyId } from "@/lib/server/razorpay";
import { findPackage } from "@/lib/domain/config";
import { assert } from "@/lib/domain/util";

interface Body {
  bookingId?: string;
}

interface Pending {
  id: string;
  code: string;
  total: number;
  description: string;
  /** An order already made for this job: pressing Pay twice must not make a second one. */
  orderId?: string;
  prefill: { name: string; email?: string; contact?: string };
}

/**
 * Opens payment for a job a creator has accepted: the client presses Pay, this makes (or re-uses)
 * the Razorpay order and hands back what Razorpay Checkout needs. Razorpay is called outside the
 * database lock, so no other request waits on it.
 */
export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  let pending: Pending | undefined;
  const first = await api(
    ({ db, now, user }) => {
      assertRazorpayConfigured();
      const b = db.bookings.find((x) => x.id === body.bookingId);
      assert(b && b.clientId === user!.id, "Booking not found", 404);
      assert(b.status === "awaiting_payment" && b.creatorId, "There’s nothing to pay for on this job yet");
      assert(!b.razorpayPaymentId, "This job has already been paid for");
      assert(now < (b.paymentDueAt ?? 0), "The time to pay for this job has run out");
      pending = {
        id: b.id,
        code: b.code,
        total: b.total,
        description: `${findPackage(b.packageId)?.name ?? "Srijan job"} · ${b.code}`,
        orderId: b.razorpayOrderId,
        prefill: { name: user!.name, email: user!.email, contact: user!.phone?.replace(/\s/g, "") },
      };
      return null;
    },
    { role: "client" },
  );
  if (!first.ok || !pending) return first;

  const job = pending;
  let orderId = job.orderId;
  if (!orderId) {
    try {
      orderId = (await createOrder(job.total, job.code, { bookingId: job.id })).id;
    } catch (e) {
      console.error("Razorpay order failed", e);
      return NextResponse.json({ ok: false, error: "We couldn’t open the payment form. You haven’t been charged. Please try again." }, { status: 502 });
    }
  }

  const id = orderId;
  return api(
    ({ db, now, user }) => {
      const b = db.bookings.find((x) => x.id === job.id);
      // The job can only have been dropped in the moment Razorpay took to answer, but say so.
      assert(b && b.clientId === user!.id, "Booking not found", 404);
      assert(b.status === "awaiting_payment" && now < (b.paymentDueAt ?? 0), "This job was dropped while the payment form was opening");
      b.razorpayOrderId = id;
      return {
        bookingId: b.id,
        checkout: {
          key: razorpayKeyId(),
          orderId: id,
          amount: job.total * 100,
          currency: "INR",
          description: job.description,
          prefill: job.prefill,
        },
      };
    },
    { role: "client" },
  );
}
