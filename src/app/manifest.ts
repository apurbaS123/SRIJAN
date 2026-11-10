import type { MetadataRoute } from "next";

/**
 * Lets people install Srijan on their phone. On iPhone that is not a nicety: iOS only delivers push
 * notifications to a site that has been added to the home screen, so creators on iPhone must install
 * it before job alerts can reach them.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Srijan — creators on demand",
    short_name: "Srijan",
    description: "Book a videographer, photographer, editor or influencer at a fixed price.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1a002e",
    icons: [{ src: "/icon-180.png", sizes: "180x180", type: "image/png", purpose: "any" }],
  };
}
