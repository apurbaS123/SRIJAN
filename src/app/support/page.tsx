import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { SupportForm } from "./SupportForm";

export const metadata: Metadata = pageMeta({
  title: "Help & support",
  description: "Raise a ticket with the Srijan team, or call us. We reply by email.",
  path: "/support",
});

export default function SupportPage() {
  return <SupportForm />;
}
