import type { ReactNode } from "react";
import Link from "next/link";
import { SUPPORT_EMAIL, SUPPORT_PHONE } from "@/lib/domain/config";

/** The support number, always dialable. */
export function Phone({ className }: { className?: string }) {
  return (
    <a href={`tel:+91${SUPPORT_PHONE}`} className={className}>
      {SUPPORT_PHONE}
    </a>
  );
}

/** The support address, always a mail link. */
export function Email({ className }: { className?: string }) {
  return (
    <a href={`mailto:${SUPPORT_EMAIL}`} className={className}>
      {SUPPORT_EMAIL}
    </a>
  );
}

const PHONE_OR_PATH = new RegExp(`(${SUPPORT_PHONE}|/[a-z-]+(?:/[a-z-]+)*)`, "g");

/**
 * Turns the support number and any in-text route (" /support ") inside a plain string into real
 * links. Body copy is written as prose in these pages, so this keeps the writing readable while
 * still giving a phone that dials and a path that navigates.
 */
export function Linkify({ text }: { text: string }): ReactNode {
  const parts = text.split(PHONE_OR_PATH);
  return (
    <>
      {parts.map((part, i) => {
        if (part === SUPPORT_PHONE) return <Phone key={i} />;
        if (part.startsWith("/")) return <Link key={i} href={part}>{part}</Link>;
        return part;
      })}
    </>
  );
}
