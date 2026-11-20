import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/server/env";
import { CREATOR_PROFILE, INDEXABLE_ROUTES, creatorPath } from "@/lib/seo";
import { withDb } from "@/lib/server/store";

const baseUrl = siteUrl() || "https://srijanclub.in";

/**
 * Built on each request, never cached.
 *
 * `sitemap.ts` is a Route Handler that Next prerenders at build time unless a route segment option
 * says otherwise — and at build time there are no creators at all, so the cached copy would list
 * none of them and a creator verified today would wait for the next deploy. `revalidate` has the
 * same flaw at the start of its window.
 *
 * The cost is one read of the marketplace data per fetch, which is what every page view on Srijan
 * already does (see `lib/server/store.ts`), and a sitemap is fetched by crawlers rather than by
 * people.
 */
export const dynamic = "force-dynamic";

/**
 * The 11 public pages, plus one entry per verified creator.
 *
 * Only verified creators are listed, which is the point: verification is a person on the Srijan
 * team reading an Aadhaar and approving the profile, so it is the gate that keeps duplicates and
 * half-filled test accounts out of Google. An unverified or rejected profile is not in the public
 * directory either, and /api/creators/<id> answers 404 for it.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();
  const pages = INDEXABLE_ROUTES.map(({ path, priority, changeFrequency }) => ({
    url: path === "/" ? baseUrl : `${baseUrl}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));

  // A sitemap is worth having even if the database is unreachable: the pages above never change,
  // so an outage should cost the profiles rather than the whole file.
  let profiles: MetadataRoute.Sitemap = [];
  try {
    const { result } = await withDb((db) =>
      db.creators
        .filter((c) => c.verification === "verified")
        .map((c) => ({ id: c.id, createdAt: c.createdAt })),
    );
    profiles = result.map((c) => ({
      url: `${baseUrl}${creatorPath(c.id)}`,
      lastModified: new Date(c.createdAt),
      changeFrequency: CREATOR_PROFILE.changeFrequency,
      priority: CREATOR_PROFILE.priority,
    }));
  } catch (e) {
    console.error("Sitemap: could not list creators", e);
  }

  return [...pages, ...profiles];
}
