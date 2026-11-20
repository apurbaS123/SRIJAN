import type { Metadata } from "next";
import { SITE, creatorPath } from "@/lib/seo";
import { placeName } from "@/lib/domain/views";
import { serviceOne } from "@/lib/domain/config";
import { withDb } from "@/lib/server/store";

/**
 * One profile's own metadata.
 *
 * Two things make this necessary rather than nice. Next merges metadata from the root layout down
 * shallowly, replacing whole keys, so a route that sets no `alternates` inherits the root's
 * `canonical: "/"` — every profile would tell Google the homepage is its canonical and ask to be
 * dropped from the index, which is exactly the bug fixed for the fixed pages in `lib/seo.ts`. And
 * a single hard-coded title would give every creator the same one, which reads as duplicate pages.
 *
 * A profile that isn't there, or isn't verified, is marked `noindex`: the public directory leaves
 * it out and /api/creators/<id> answers 404 for it, so there is nothing for Google to keep.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;

  const { result: c } = await withDb((db) => {
    const x = db.creators.find((y) => y.id === id && y.verification === "verified");
    if (!x) return null;
    return {
      name: x.name,
      bio: x.bio,
      area: placeName(x.cityId, x.zoneId),
      services: x.services.map((s) => serviceOne(s.key)),
      photo: x.photo?.id ?? null,
    };
  }).catch(() => ({ result: null }));

  if (!c) {
    return {
      title: "Creator profile",
      description: "Work, rates, services and availability for a verified Srijan creator.",
      robots: { index: false, follow: true },
    };
  }

  // Said of one person, so the trade is singular: "Videographer in Beltola", never
  // "Videographers in Beltola", which reads as a category page.
  const trade = c.services[0] ?? "creator";
  const Trade = trade.charAt(0).toUpperCase() + trade.slice(1);
  const title = c.area ? `${c.name} — ${Trade} in ${c.area}` : `${c.name} — ${Trade}`;
  // The creator's own words where there are any, since that is what a person searching wants to
  // read. Long bios are cut at a word rather than mid-syllable.
  const bio = c.bio.replace(/\s+/g, " ").trim();
  const description = bio.length > 20 ? clamp(bio, 155) : `Book ${c.name}, a verified Srijan ${trade}${c.area ? ` in ${c.area}` : ""}. Fixed prices, and the work transferred on the spot.`;
  const path = creatorPath(id);

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "profile",
      siteName: SITE,
      locale: "en_IN",
      title: `${title} — ${SITE}`,
      description,
      url: path,
      // Their own photo when they have one; it is public and served from /avatar/<id>.
      ...(c.photo ? { images: [{ url: `/avatar/${c.photo}`, alt: c.name }] } : {}),
    },
    twitter: {
      card: c.photo ? "summary_large_image" : "summary",
      title: `${title} — ${SITE}`,
      description,
    },
  };
}

/** Cuts to `max` characters on a word boundary, with an ellipsis only if something was cut. */
function clamp(text: string, max: number) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
