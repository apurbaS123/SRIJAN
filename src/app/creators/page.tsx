import { Suspense } from "react";
import Link from "next/link";
import { Browse } from "./Browse";
import { publicCreators } from "@/lib/server/public";
import { CITIES, SERVICES } from "@/lib/domain/config";

/**
 * Read on each request, so a creator verified an hour ago is in the HTML.
 *
 * The page is dynamic in any case — `Browse` reads the query string — but saying so here is what
 * stops the server-rendered list below from being frozen at build time, when there are no
 * creators at all.
 */
export const dynamic = "force-dynamic";

/**
 * The public directory.
 *
 * `Browse` does the filtering, which means it reads the query string, which means Next renders it
 * in the browser and puts this page's Suspense fallback in the HTML instead. That fallback used to
 * be the word "Loading…" — so the directory, the page most worth finding in a search, had no
 * heading and no creators in its markup.
 *
 * The fallback is now the real thing: the heading, the standing copy and every verified creator,
 * rendered on the server from the same data and in the same order `Browse` will ask for. When the
 * interactive version takes over it replaces like with like, so there is nothing to see and
 * nothing to shift.
 */
export default async function CreatorsPage() {
  const creators = await publicCreators();
  const services = SERVICES.map((s) => s.label).join(", ").toLowerCase();

  return (
    <div className="container page">
      <div className="row between">
        <h1>Creators on Srijan</h1>
        <Link href="/book" className="btn btn-accent">
          Book a service
        </Link>
      </div>
      <p className="muted">
        {creators.length
          ? `${creators.length} verified ${creators.length === 1 ? "creator" : "creators"} across ${CITIES.length} cities — ${services}.`
          : `Verified creators across ${CITIES.length} cities — ${services}.`}{" "}
        Every profile here has had its Aadhaar read and approved by someone on the Srijan team, which is what lets a creator accept
        paid work at all. Prices are fixed by <Link href="/book">the service menu</Link>, not set per creator, so the figure on a
        profile is the figure you pay. Browse by craft, city or who is online right now, send the job to the one you want, and pay
        only once they have accepted it.
      </p>

      {/* `Browse` reads the query string, so this page is rendered per request (above) and
          `Browse` renders on the server too — the Suspense boundary is belt and braces for a
          build where it bails to the client instead. Either way the creators are already in the
          HTML, because the list is handed to it rather than fetched by it. */}
      <Suspense fallback={<p className="muted">Searching…</p>}>
        <Browse initial={creators} />
      </Suspense>
    </div>
  );
}
