import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Payout details",
  description: "Where Srijan sends your money, and how quickly it arrives.",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
