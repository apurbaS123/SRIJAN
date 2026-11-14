import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your campaigns",
  description: "Track the influencer campaigns you are running with Srijan creators.",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
