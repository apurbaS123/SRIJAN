import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Creator profile",
  description: "Work, rates, services and availability for a verified Srijan creator.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
