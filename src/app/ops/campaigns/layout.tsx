import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Campaigns — ops",
  description: "Brand campaigns across the platform, and the stage each one is at.",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
