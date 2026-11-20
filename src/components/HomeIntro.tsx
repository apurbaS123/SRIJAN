import Link from "next/link";
import { CITIES, CREATOR_SHARE, PAYOUT_MAX_HOURS, PAYOUT_MIN_HOURS, sellable } from "@/lib/domain/config";

/**
 * The homepage's standing copy: what Srijan is, in sentences, in the HTML.
 *
 * A server component with no state, so every word of it is in the page before a line of
 * JavaScript runs. The hero above says "Create it today." and little else; a reader arriving from
 * a search result — or an answer engine deciding what to say about Srijan — needs the plain facts
 * somewhere it can actually read them.
 *
 * Every number here is read from `config.ts` rather than typed out, because copy that repeats a
 * price is copy that will one day contradict it. The ₹1 payment-test package is excluded for free
 * by `sellable()`.
 */
export function HomeIntro() {
  const prices = sellable().map((p) => p.price);
  const from = prices.length ? Math.min(...prices) : null;
  const services = sellable().length;
  const cities = CITIES.map((c) => c.name);

  return (
    <section className="home-intro" aria-labelledby="home-intro-heading">
      <div className="home-intro-slab">
        <h2 id="home-intro-heading">Hire a verified creator, at a price you can see before you book</h2>
        <p>
          Srijan is a creator marketplace for Assam and the North East. Videographers, photographers, editors, designers, writers,
          voice artists and influencers list what they do, and you book the one you want from{" "}
          <Link href="/book">a menu of {services} services</Link>
          {from ? ` starting at ₹${from.toLocaleString("en-IN")}` : ""} — a fixed price, agreed before anyone turns up, with nothing
          added on top.
        </p>
        <p>
          Every creator on <Link href="/creators">the directory</Link> has had their Aadhaar read and approved by someone on the
          Srijan team. Nobody can accept paid work until that has happened, so the person who arrives is the person on the profile.
        </p>
        <p>
          Booking is free and you are only asked to pay once a creator has accepted your job, which is also when the two of you get
          each other&rsquo;s details. Creators keep {Math.round(CREATOR_SHARE * 100)}% of the price and are paid within{" "}
          {PAYOUT_MIN_HOURS}&ndash;{PAYOUT_MAX_HOURS} hours of a finished job. Brands running something larger can{" "}
          <Link href="/brands">brief a campaign</Link>, and <Link href="/how-it-works">how it works</Link> sets out each step in
          order.
        </p>
        <ul className="home-intro-cities" aria-label="Cities Srijan covers">
          {cities.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
