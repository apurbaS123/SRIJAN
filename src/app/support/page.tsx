import type { Metadata } from "next";
import { SupportForm } from "./SupportForm";

export const metadata: Metadata = { title: "Help & support — Srijan" };

export default function SupportPage() {
  return <SupportForm />;
}
