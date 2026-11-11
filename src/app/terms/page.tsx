import type { Metadata } from "next";
import { creatorVerificationMode } from "@/lib/server/digilocker";
import { AUTO_APPROVE_MS, CREATOR_SHARE, HOUR, PAYMENT_WINDOW_MS, PAYOUT_MAX_HOURS, PAYOUT_MIN_HOURS, SUPPORT_PHONE } from "@/lib/domain/config";

export const metadata: Metadata = { title: "Terms & conditions — Srijan" };

export default function TermsPage() {
  return (
    <div className="container narrow page">
      <h1>Terms &amp; conditions</h1>
      <p>These terms apply when you use Srijan to book a service, offer your work as a creator, or run a brand campaign. By using the site you agree to them.</p>

      <h2>What Srijan does</h2>
      <p>Srijan connects clients and brands with independent creators, takes payment for the work and passes the creator’s share on to them.</p>

      <h2>Your account</h2>
      <p>Give accurate details and keep your password private. You’re responsible for what happens under your account.</p>

      <h2>Prices and payment</h2>
      <p>
        Services are sold at the fixed price shown when you book. Booking itself costs nothing: once a creator accepts the job you are asked to pay that price in full through Razorpay, and you have{" "}
        {PAYMENT_WINDOW_MS / 60_000} minutes to do so. If the payment doesn’t arrive in that time the job is dropped and the creator released, with nothing owed either way. Paying confirms the job,
        and you and the creator are then given each other’s contact details. Razorpay’s own terms also apply to your payment.
      </p>

      <h2>Cancellations and refunds</h2>
      <p>
        You can cancel for free any time before you pay, including while a creator is waiting for your payment. Once you have paid, call the Srijan team on {SUPPORT_PHONE}. Refunds are sent by the
        Srijan team by hand, so they aren’t instant, and we may contact you for your bank or UPI details.
      </p>

      <h2>Approving the work</h2>
      <p>
        When a creator marks a job as finished, you can approve it or report a problem. If you do neither within {AUTO_APPROVE_MS / HOUR} hours, the job is approved automatically. If you report a
        problem, the creator’s payment stops until the Srijan team has decided.
      </p>

      <h2>For creators</h2>
      <p>
        You keep {Math.round(CREATOR_SHARE * 100)}% of the price of each service you complete. Once a job is approved, your share appears in your wallet and Srijan sends it to the bank account or UPI
        ID on your profile within {PAYOUT_MIN_HOURS}–{PAYOUT_MAX_HOURS} hours. The wallet is a record of what you have earned; it doesn’t hold money, and there is nothing to withdraw. If you haven’t
        added a payment receive method yet, your earnings wait there until you do. Only accept jobs you can deliver, and only upload work you have the right to share.
      </p>
      <p>
        {creatorVerificationMode() === "direct"
          ? "Your account is verified when you sign up, and we don’t check your identity documents yet. We are adding Aadhaar verification through DigiLocker and will ask you to verify once it is live."
          : "Before you can go online you must verify your identity, either by sharing your Aadhaar details through DigiLocker or by sending your documents to the Srijan team."}{" "}
        Either way, one person may hold one creator account, you must use your own name, and an account opened or verified with someone else’s details will be closed.
      </p>

      <h2>For brands</h2>
      <p>Campaign fees, deliverables and payment dates are set out in the proposal agreed with the Srijan team for each campaign.</p>

      <h2>Acceptable use</h2>
      <p>Don’t use Srijan for anything unlawful, misuse other people’s contact details, or try to interfere with how the site works.</p>

      <h2>Changes</h2>
      <p>We may update these terms. The version on this page is the one that applies.</p>

      <h2>Contact us</h2>
      <p>Call the Srijan team on {SUPPORT_PHONE}.</p>
    </div>
  );
}
