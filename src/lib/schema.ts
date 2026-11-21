// Structured data: what Srijan tells a search engine, or an assistant answering a question about
// it, in a form that is read rather than guessed at.
//
// Everything here is built from `config.ts` rather than typed out, for the same reason the page
// copy is: a price or a city repeated by hand is a price or a city that will one day be wrong, and
// being wrong in machine-readable form is worse than being wrong in prose — it is quoted back with
// confidence.
//
// Nothing is invented. A fact the site does not actually know — the registered company name, the
// founding year, a postal address — is left out rather than filled with something plausible.
import { SERVICES, SUPPORT_EMAIL, SUPPORT_PHONE, sellable } from "@/lib/domain/config";
import type { ServiceKey } from "@/lib/domain/types";
import { SITE, SITE_DESCRIPTION } from "@/lib/seo";

/**
 * Srijan's profiles elsewhere, and the single most valuable line in this file.
 *
 * `sameAs` is what binds this site to the organisation behind it. Without it, "Srijan" is a name
 * shared with Srijan Technologies (srijan.net, an established Indian digital-engineering firm),
 * the livelihoods NGO of the same name, a public figure and a college festival — and a search
 * engine has no way to tell which one a page is about.
 *
 * Add real profile URLs only. A `sameAs` pointing at an account that is not Srijan's, or does not
 * exist, is worse than an empty list: it attaches the wrong entity, and that is harder to undo
 * than never having claimed it.
 */
export const SOCIAL_PROFILES: string[] = ["https://www.instagram.com/srijan_ne_chapter/"];

const ORG_ID = (base: string) => `${base}/#organization`;
const SITE_ID = (base: string) => `${base}/#website`;

/**
 * The craft, for `serviceType`. The labels in `config.ts` name a category of people
 * ("Videographers"), which is right for a filter and wrong here: a service is not a person. The
 * keys themselves are already the craft, so they only need tidying.
 */
const craft = (key: ServiceKey) =>
  key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/**
 * Where Srijan will take a job. This was a list of six named cities, which is no longer what the
 * site does: a client picks any state and types any city, and an online job has no place at all.
 *
 * So the honest answer is the country, and only the country. Naming cities here would be a claim
 * about each one — that there is coverage in it — which a list copied from a dropdown cannot make.
 * Where the creators actually are is a question the directory answers, truthfully, per creator.
 */
const areaServed = { "@type": "Country", name: "India" };

/**
 * Who Srijan is. Lives on every page via the root layout, with an `@id` the other blocks point at
 * rather than repeating.
 */
export function organizationSchema(base: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID(base),
    name: SITE,
    url: base,
    logo: { "@type": "ImageObject", url: `${base}/logo.png` },
    image: `${base}/opengraph-image`,
    description: SITE_DESCRIPTION,
    areaServed,
    knowsAbout: SERVICES.map((s) => s.label),
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      telephone: `+91${SUPPORT_PHONE}`,
      email: SUPPORT_EMAIL,
      areaServed: "IN",
      availableLanguage: ["en", "hi", "as"],
    },
    // Omitted deliberately until somebody can state them: legalName, foundingDate, address.
    ...(SOCIAL_PROFILES.length ? { sameAs: SOCIAL_PROFILES } : {}),
  };
}

/** The site itself, so the brand name in a result is Srijan's rather than a guess from the URL. */
export function websiteSchema(base: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": SITE_ID(base),
    url: base,
    name: SITE,
    description: SITE_DESCRIPTION,
    inLanguage: "en-IN",
    publisher: { "@id": ORG_ID(base) },
  };
}

/**
 * The service menu, with real prices.
 *
 * Only what `sellable()` returns: a retired package, or a ₹1 payment test, must never reach this.
 * Publishing a price as structured data is publishing it — to search results, to shopping
 * surfaces, and to assistants that will repeat it to someone.
 */
export function serviceListSchema(base: string) {
  const packages = sellable();
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Services on ${SITE}`,
    numberOfItems: packages.length,
    itemListElement: packages.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Service",
        name: p.name,
        description: p.summary,
        serviceType: craft(p.service),
        provider: { "@id": ORG_ID(base) },
        areaServed,
        offers: {
          "@type": "Offer",
          url: `${base}/book`,
          price: String(p.price),
          priceCurrency: "INR",
          availability: "https://schema.org/InStock",
        },
      },
    })),
  };
}

/** Where a page sits, for the trail shown under a result. */
export function breadcrumbSchema(base: string, trail: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: `${base}${t.path === "/" ? "" : t.path}`,
    })),
  };
}
