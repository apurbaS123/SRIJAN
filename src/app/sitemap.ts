import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/server/env";
import { INDEXABLE_ROUTES } from "@/lib/seo";

const baseUrl = siteUrl() || "https://srijanclub.in";

/**
 * The 11 public, indexable routes.
 *
 * Creator profiles (/creators/[id]) are deliberately left out for now: the public directory
 * still holds duplicate and placeholder entries, and listing those would invite Google to index
 * them. Add them here once the directory is cleaned and the profile pages render server-side —
 * at that point map over the creator list and emit one entry each.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return INDEXABLE_ROUTES.map(({ path, priority, changeFrequency }) => ({
    url: path === "/" ? baseUrl : `${baseUrl}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
