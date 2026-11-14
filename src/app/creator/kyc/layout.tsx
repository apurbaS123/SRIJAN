import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verify your identity",
  description: "Upload your Aadhaar so the Srijan team can verify you and unlock payouts.",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
