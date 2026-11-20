import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/Session";
import { Header } from "@/components/Header";
import { SiteFooter } from "@/components/SiteFooter";
import { DemoNotifications } from "@/components/DemoNotifications";
import { ReviewGate } from "@/components/ReviewGate";
import { HelpButton } from "@/components/HelpButton";
import { siteUrl } from "@/lib/server/env";
import { ThemeToggle, THEME_SCRIPT } from "@/components/ThemeToggle";
import { body, display } from "@/lib/fonts";

const SITE = "Srijan";
const TAGLINE = "Srijan — the creator economy of India";
const DESCRIPTION = "Hire verified Indian creators, book a same-day video shoot, or run an influencer campaign — at a fixed price, with payouts in 48–72 hours.";

/** Falls back to the production domain so canonical and social URLs still resolve in preview builds. */
const baseUrl = siteUrl() || "https://srijanclub.in";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  // Every page sets a short title; this wraps it, so "Book a service" renders as "Book a service — Srijan".
  title: { default: TAGLINE, template: `%s — ${SITE}` },
  description: DESCRIPTION,
  applicationName: SITE,
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: SITE, title: TAGLINE, description: DESCRIPTION, url: "/", locale: "en_IN" },
  twitter: { card: "summary_large_image", title: TAGLINE, description: DESCRIPTION },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#7c3aed" };

/** Dark is the site's default, so <html> ships with it; the head script below swaps in light for
 *  someone who has chosen it, before first paint. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={`${display.variable} ${body.variable}`}>
      <head>
        {/* Applies the saved theme before first paint, so there's no flash of the wrong one. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <SessionProvider>
          <Header />
          <ThemeToggle floating />
          <DemoNotifications />
          <main>{children}</main>
          <SiteFooter />
          <HelpButton />
          <ReviewGate />
        </SessionProvider>
      </body>
    </html>
  );
}
