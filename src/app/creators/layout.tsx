import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Explore creators",
  description: "Browse verified photographers, videographers and content creators across India, with real rates and availability.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
