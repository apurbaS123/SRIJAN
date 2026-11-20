// The site's two typefaces, self-hosted.
//
// They used to arrive twice over from Google: a `<link rel="stylesheet">` in the root layout and
// an `@import` at the top of globals.css. Both are render-blocking requests to another origin,
// and the `@import` is the worse of the two because the browser cannot even discover it until the
// stylesheet itself has arrived. `next/font` fetches both families at build time and serves them
// from this origin, so there is no third-party request and no flash of a fallback face.
//
// Each is exposed as a CSS variable, which globals.css folds into its own `--display` and
// `--body`; the generated family name is also read directly by the hero, which prints text into a
// canvas and so needs a family string rather than a variable.
import { Space_Grotesk, Syne } from "next/font/google";

export const display = Syne({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
  // Measured against the metrics of the face the browser would otherwise show, so swapping in the
  // real one moves the text as little as possible.
  adjustFontFallback: true,
});

export const body = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-body",
  adjustFontFallback: true,
});
