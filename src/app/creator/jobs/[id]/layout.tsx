import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Job details",
  description: "Everything about one job: the client, the brief, the schedule and what it pays.",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
