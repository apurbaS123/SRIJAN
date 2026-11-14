import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Campaigns",
  description: "Brand campaigns you have been invited to, and the deliverables you owe.",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
