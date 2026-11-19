import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Book a service",
  description: "Book a verified creator for a same-day shoot, event coverage or product video. Pick a service, a time and a city.",
  path: "/book",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
