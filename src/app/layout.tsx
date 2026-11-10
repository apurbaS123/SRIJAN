import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/Session";
import { Header } from "@/components/Header";
import { SiteFooter } from "@/components/SiteFooter";
import { DemoNotifications } from "@/components/DemoNotifications";
import { ReviewGate } from "@/components/ReviewGate";
import { HelpButton } from "@/components/HelpButton";

export const metadata: Metadata = {
  title: "Srijan — the creator economy of India",
  description: "Hire creators, book a same-day video shoot, or run an influencer campaign.",
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
        <img className="bg-video" src="/bg1.png" alt="" aria-hidden="true" />
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
