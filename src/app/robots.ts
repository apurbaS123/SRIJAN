import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/server/env";

const baseUrl = siteUrl() || "https://srijanclub.in";

/**
 * Only /api is disallowed, and only because its responses are JSON that could never carry a
 * meta tag.
 *
 * The signed-in and staff surfaces (/ops, /creator, /bookings, /campaigns, /login) are
 * deliberately NOT disallowed: each already sets `robots: { index: false }` in its layout, and
 * a crawler has to be allowed to fetch a page before it can read that. Disallowing them here
 * would hide the noindex and let the bare URLs get indexed anyway.
 *
 * AI training crawlers are left allowed, as a choice rather than an accident: a pre-launch
 * marketplace gains more from being described by assistants than it loses. To change that, add
 * the crawler as its own `userAgent` rule with `disallow: "/"`.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: "/api/",
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
