import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/Session";
import { Header } from "@/components/Header";
import { SiteFooter } from "@/components/SiteFooter";
import { DemoNotifications } from "@/components/DemoNotifications";
import { ReviewGate } from "@/components/ReviewGate";
import { HelpButton } from "@/components/HelpButton";
import { siteUrl } from "@/lib/server/env";

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {/* Background image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="bg-video" src="/bg.webp" alt="" aria-hidden="true" />
        <SessionProvider>
          <Header />
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
