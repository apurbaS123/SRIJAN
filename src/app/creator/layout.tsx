import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Jobs",
  description: "Paid jobs near you, offers waiting on your answer, and the work you have accepted.",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
