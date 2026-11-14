import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dispatch",
  description: "The Srijan ops desk: live jobs, creator dispatch and everything waiting on the team.",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
