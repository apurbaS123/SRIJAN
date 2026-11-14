import type { Metadata } from "next";
import { SupportForm } from "./SupportForm";

export const metadata: Metadata = { title: "Help & support", description: "Raise a ticket with the Srijan team, or call us. We reply by email." };

export default function SupportPage() {
  return <SupportForm />;
}
