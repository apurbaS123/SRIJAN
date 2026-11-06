"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Floating help button in the bottom-right corner of every page. Opens the ticket form. */
export function HelpButton() {
  if (usePathname() === "/support") return null;
  return (
    <Link href="/support" className="help-fab" aria-label="Need help? Raise a ticket">
      <span className="help-fab-icon" aria-hidden="true">?</span>
      <span className="help-fab-label">Need help?</span>
    </Link>
  );
}
