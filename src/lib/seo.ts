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

type PageMeta = {
  /** Short title; the root layout's template wraps it as "<title> — Srijan". */
  title: string;
  description: string;
  /** Route path, leading slash, no trailing slash (the homepage is "/"). */
  path: string;
};

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
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} — ${SITE}`,
      description,
    },
  };
}
