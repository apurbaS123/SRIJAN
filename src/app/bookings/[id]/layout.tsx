import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Booking details",
  description: "The full detail of one Srijan booking: your creator, the schedule, payment and delivery.",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
