import type { Metadata } from "next";

/**
 * Per-route metadata.
 *
 * Next.js merges metadata from the root layout down **shallowly**, replacing whole keys.
 * So a route that sets neither `alternates` nor `openGraph` inherits the root's values
 * verbatim — including `canonical: "/"` and `openGraph.url: "/"`. Left alone, every page
 * declares the homepage as its canonical, which tells Google to drop it from the index.
 *
 * Every indexable route therefore has to override both keys, and because the merge replaces
 * the whole `openGraph` object rather than merging into it, the override has to restate the
 * shared fields. This helper does that in one place so a new route cannot get it wrong.
 */
export const SITE = "Srijan";
export const SITE_TAGLINE = "Srijan — the creator economy of India";
export const SITE_DESCRIPTION =
  "Hire verified Indian creators, book a same-day video shoot, or run an influencer campaign — at a fixed price, with payouts in 48–72 hours.";

/** Public, indexable routes, and the lastModified date the sitemap reports for each. */
export const INDEXABLE_ROUTES = [
  { path: "/", priority: 1.0, changeFrequency: "weekly" as const },
  { path: "/book", priority: 0.9, changeFrequency: "weekly" as const },
  { path: "/creators", priority: 0.9, changeFrequency: "daily" as const },
  { path: "/brands", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/join", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/how-it-works", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/about", priority: 0.6, changeFrequency: "monthly" as const },
  { path: "/faqs", priority: 0.6, changeFrequency: "monthly" as const },
  { path: "/support", priority: 0.4, changeFrequency: "yearly" as const },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" as const },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" as const },
];

/**
 * Creator profiles, which are listed in the sitemap one per verified creator rather than written
 * out here. Below the hub pages on purpose: a profile is worth less than /creators itself, and it
 * changes when the creator goes online or finishes a job.
 */
export const CREATOR_PROFILE = { priority: 0.5, changeFrequency: "weekly" as const };

export const creatorPath = (id: string) => `/creators/${id}`;

type PageMeta = {
  /** Short title; the root layout's template wraps it as "<title> — Srijan". */
  title: string;
  description: string;
  /** Route path, leading slash, no trailing slash (the homepage is "/"). */
  path: string;
};

/**
 * The picture shown when a link to one of these routes is shared.
 *
 * It has to be named here. `app/opengraph-image.tsx` attaches the image to the root layout's
 * `openGraph`, and the same shallow merge described above then throws it away for any route that
 * sets `openGraph` of its own — which is every route built by this helper. /book, /creators and
 * /brands are unaffected because each has an image file of its own; everything else lost it
 * silently, which is how seven pages ended up declaring `summary_large_image` with nothing behind
 * it even after the images were added.
 */
const OG_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: SITE_TAGLINE };

/** Builds a route's metadata with a self-referential canonical and a matching og:url. */
export function pageMeta({ title, description, path }: PageMeta): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: SITE,
      locale: "en_IN",
      title: `${title} — ${SITE}`,
      description,
      url: path,
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} — ${SITE}`,
      description,
      images: [OG_IMAGE.url],
    },
  };
}
