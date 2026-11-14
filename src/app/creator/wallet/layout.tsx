import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Wallet",
  description: "What you have earned, what is on its way and what has already been paid out.",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
