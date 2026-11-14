import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My bookings",
  description: "Track your Srijan bookings — what is confirmed, what is awaiting payment and what has been delivered.",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
