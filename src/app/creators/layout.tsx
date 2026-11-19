import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Explore creators",
  description: "Browse verified photographers, videographers and content creators across India, with real rates and availability.",
  path: "/creators",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
