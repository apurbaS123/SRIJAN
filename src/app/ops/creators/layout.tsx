import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Creators — ops",
  description: "Every creator on Srijan, their verification state and their payout details.",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
