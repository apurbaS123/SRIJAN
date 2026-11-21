import Link from "next/link";
import { BookFormLoader } from "./BookFormLoader";
import { DISPATCH, SERVICES, lowestPrice, sellable } from "@/lib/domain/config";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbSchema, serviceListSchema } from "@/lib/schema";
import { siteUrl } from "@/lib/server/env";

/**
 * Book a service.
 *
 * The form itself has to run in the browser — it reads the clock for the earliest bookable time
 * and sessionStorage for a saved order — and the whole page used to wait on it, so /book arrived
 * as the word "Loading…". What a visitor wants first is not the form but the answer to "what does
 * this cost and how does it work", and that does not depend on the clock at all. It is below, in
 * the markup, read from the same package list the form offers.
 */
export default function BookPage() {
  const packages = sellable();
  const prices = packages.map((p) => p.price);
  const from = prices.length ? Math.min(...prices) : null;
  const hours = Math.round(DISPATCH.onSiteNoticeMs / 3_600_000);

  // Only crafts that actually have something to sell, cheapest first: a heading with no price
  // under it tells a visitor nothing.
  const crafts = SERVICES.map((s) => ({ ...s, from: lowestPrice(s.key), count: packages.filter((p) => p.service === s.key).length }))
    .filter((s) => s.from !== null && s.count > 0)
    .sort((a, b) => a.from! - b.from!);

  const base = siteUrl() || "https://srijanclub.in";

  return (
    <div className="container page narrow">
      {/* Real prices, from the same list the page prints. `sellable()` keeps retired packages and
          the ₹1 payment test out — a price published here is a price an assistant will quote. */}
      <JsonLd data={serviceListSchema(base)} />
      <JsonLd data={breadcrumbSchema(base, [{ name: "Home", path: "/" }, { name: "Book a service", path: "/book" }])} />
      <h1>Book a service</h1>
      <p className="muted">
        {packages.length} services at fixed prices{from ? `, from ₹${from.toLocaleString("en-IN")}` : ""}. Pick what you need, say
        when and where, and every verified creator who does that work nearby is alerted at once. The first to accept gets the job.
      </p>

      <section className="card stack">
        <h2>What things cost</h2>
        <p className="small muted">
          The price is the price: it is set by this menu rather than by the creator, and Srijan adds nothing on top — no travel
          fee, no booking fee. You can see the exact figure for a service before you choose it.
        </p>
        <ul className="stack" style={{ margin: 0, paddingLeft: 20, gap: 6 }}>
          {crafts.map((c) => (
            <li key={c.key}>
              <b>{c.label}</b> — {c.count} {c.count === 1 ? "service" : "services"}, from ₹{c.from!.toLocaleString("en-IN")}
            </li>
          ))}
        </ul>
      </section>

      <section className="card stack">
        <h2>How booking works</h2>
        <p className="small">
          Booking is free and nothing is charged up front. Once a creator accepts, you are asked to pay — and paying is what hands
          the job over and swaps your contact details with theirs. If nobody accepts, you owe nothing. On-site jobs need at least{" "}
          {hours} {hours === 1 ? "hour" : "hours"} notice so the creator can reach you; online work can be booked for any time.
          Srijan is not limited to a list of cities: pick your state and type the city or town the job is in, and it goes to
          verified creators near you. Online work has no location at all and can be booked from anywhere in India.
        </p>
        <p className="small muted">
          Want one particular person? Open their profile in <Link href="/creators">the directory</Link> and send the job to them
          first. Running something bigger across several creators is a <Link href="/brands">campaign</Link>, and{" "}
          <Link href="/how-it-works">how it works</Link> walks through every step.
        </p>
      </section>

      <BookFormLoader />
    </div>
  );
}
