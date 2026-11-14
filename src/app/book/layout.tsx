import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Book a service",
  description: "Book a verified creator for a same-day shoot, event coverage or product video. Pick a service, a time and a city.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
