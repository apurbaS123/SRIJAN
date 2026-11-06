"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Floating help button in the bottom-right corner of every page. Opens the ticket form. */
export function HelpButton() {
  if (usePathname() === "/support") return null;
  return (
    <Link href="/support" className="help-fab" aria-label="Need help? Raise a ticket">
      <span className="help-fab-icon" aria-hidden="true">
        <SupportAgentIcon />
      </span>
      <span className="help-fab-label">Need help?</span>
    </Link>
  );
}

/** A woman with long hair wearing a headset and mic. */
function SupportAgentIcon() {
  return (
    <svg viewBox="0 0 32 32" width="32" height="32" fill="none">
      {/* Long hair behind the head */}
      <path d="M8.5 15c0-5 3.2-8.5 7.5-8.5s7.5 3.5 7.5 8.5v6.5c-1.2.8-2.6 1-4 .8H12.5c-1.4.2-2.8 0-4-.8z" fill="#3b0764" />
      {/* Shoulders */}
      <path d="M6 30c.6-4.6 4.6-7.2 10-7.2s9.4 2.6 10 7.2z" fill="#fff" />
      {/* Neck and face */}
      <rect x="14" y="19" width="4" height="4.5" rx="1.5" fill="#fcd9c4" />
      <ellipse cx="16" cy="14.6" rx="5.4" ry="6" fill="#fcd9c4" />
      {/* Fringe */}
      <path d="M10.6 13.2c.6-3.6 2.8-5.6 5.6-5.6 2.6 0 4.7 1.7 5.3 4.6-2.4-.2-5-1.3-6.6-3-1 1.9-2.4 3.2-4.3 4z" fill="#3b0764" />
      {/* Eyes and smile */}
      <circle cx="13.9" cy="15" r=".7" fill="#3b0764" />
      <circle cx="18.1" cy="15" r=".7" fill="#3b0764" />
      <path d="M14.4 17.6c.9.8 2.3.8 3.2 0" stroke="#c2410c" strokeWidth=".8" strokeLinecap="round" />
      {/* Headset band, ear cups and mic */}
      <path d="M8.6 14.6a7.4 7.4 0 0 1 14.8 0" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="7.2" y="13.2" width="3" height="4.8" rx="1.4" fill="#fff" />
      <rect x="21.8" y="13.2" width="3" height="4.8" rx="1.4" fill="#fff" />
      <path d="M9 18c0 2.4 1.8 3.6 4.6 3.6" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="14.2" cy="21.6" r="1.1" fill="#fff" />
    </svg>
  );
}
