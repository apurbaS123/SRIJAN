import type { Metadata } from "next";
import { AUTO_APPROVE_MS, CREATOR_SHARE, DISPATCH, HOUR, MIN, sellable } from "@/lib/domain/config";

export const metadata: Metadata = { title: "How it works — Srijan" };

const LOWEST_PRICE = Math.min(...sellable().map((p) => p.price));

export default function HowItWorksPage() {
  return (
    <div className="container narrow page">
      <h1>How it works</h1>

      <h2>Same-day service</h2>
      <p>A verified creator comes to your place and gets the job done. Online jobs like video editing need no visit at all.</p>

      <h2>Five-minute dispatch</h2>
      <p>
        Every available creator within {DISPATCH.initialRadiusKm} km is alerted at once, and the first to accept takes the job. At minute {DISPATCH.widenAfterMs / MIN} the search widens to{" "}
        {DISPATCH.widenedRadiusKm} km.
      </p>

      <h2>Fixed price</h2>
      <p>
        Services start from ₹{LOWEST_PRICE.toLocaleString("en-IN")}, with no haggling. Creators keep {Math.round(CREATOR_SHARE * 100)}% of every service.
      </p>

      <h2>Safe payment</h2>
      <p>
        You pay Srijan up front, and the creator is paid after you approve the finished job. If you don’t approve it or report a problem within {AUTO_APPROVE_MS / HOUR} hours of the creator marking it
        finished, it is approved automatically.
      </p>

      <h2>Managed campaign</h2>
      <p>Brands book a strategy call. Our team shortlists creators across India, runs every deal and reports the results.</p>
    </div>
  );
}
