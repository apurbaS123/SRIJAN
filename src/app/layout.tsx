import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/Session";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "Srijan — the creator economy of the Northeast",
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
        {/* Background video */}
        <video className="bg-video" autoPlay muted loop playsInline>
          <source src="/bg-video.mp4" type="video/mp4" />
        </video>
        <SessionProvider>
          <Header />
          <main>{children}</main>
        </SessionProvider>
      </body>
    </html>
  );
}
