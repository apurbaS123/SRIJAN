import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Join as a creator",
  description: "Create a Srijan creator profile, take paid jobs near you and get paid within 48–72 hours.",
  path: "/join",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
