import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "For brands",
  description: "Run an influencer campaign with verified Indian creators. Brief, shortlist, approve and pay in one place.",
  path: "/brands",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
