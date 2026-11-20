import Link from "next/link";
import { JoinForm } from "./JoinForm";
import { LaunchSticker } from "@/components/ui";
import { CITIES, CREATOR_SHARE, PAYOUT_MAX_HOURS, PAYOUT_MIN_HOURS, SERVICES, sellable } from "@/lib/domain/config";

/**
 * Signing up as a creator.
 *
 * The form waits on the service catalogue, which is a fetch, so the page used to be a spinner —
 * including the part that has to persuade somebody to fill it in at all. The terms are not a
 * fetch: the share, the payout window, the crafts and the cities are all settled in `config.ts`,
 * so they are stated here, in the HTML, above the form.
 */
export default function JoinPage() {
  const share = Math.round(CREATOR_SHARE * 100);
  const packages = sellable();
  const prices = packages.map((p) => p.price);
  const from = prices.length ? Math.min(...prices) : null;

  return (
    <div className="container page narrow">
      <h1>Join Srijan as a creator</h1>
      <LaunchSticker />
      <p className="muted">
        List everything you do. Jobs through Srijan pay {share}% of the package price, and the price is fixed by the menu rather
        than haggled over — so you know what a job pays before you accept it.
      </p>

      <section className="card stack">
        <h2>What you get</h2>
        <ul className="stack" style={{ margin: 0, paddingLeft: 20, gap: 8 }}>
          <li>
            <b>{share}% of every job.</b> Srijan keeps {100 - share}%{from ? `, on services priced from ₹${from.toLocaleString("en-IN")}` : ""}. Nothing is
            deducted for travel or for being listed.
          </li>
          <li>
            <b>Paid within {PAYOUT_MIN_HOURS}&ndash;{PAYOUT_MAX_HOURS} hours</b> of a finished job, to your bank account or UPI ID.
            You do not have to add one to start — only to be paid.
          </li>
          <li>
            <b>Jobs come to you.</b> Go online and you are alerted about work near you in the crafts you offer. You see the fee,
            the place and the time before you accept, and you can decline anything.
          </li>
          <li>
            <b>Clients are charged before you start.</b> Payment is what hands the job over, so you are never working on a promise.
          </li>
        </ul>
      </section>

      <section className="card stack">
        <h2>What we need from you</h2>
        <p className="small">
          A photo of both sides of your Aadhaar, which someone on the Srijan team reads before approving you. Nobody can accept
          paid work until that is done — that is what the word &ldquo;verified&rdquo; means on a profile here, and it is why
          clients trust the directory. Srijan keeps only the last four digits of the number.
        </p>
        <p className="small muted">
          We list {SERVICES.length} kinds of work — {SERVICES.map((s) => s.label.toLowerCase()).join(", ")} — across{" "}
          {CITIES.length} cities: {CITIES.map((c) => c.name).join(", ")}. See{" "}
          <Link href="/creators">creators already on Srijan</Link>, the <Link href="/book">services and prices</Link> clients book
          from, or <Link href="/how-it-works">how it works</Link> end to end.
        </p>
      </section>

      <JoinForm />
    </div>
  );
}
