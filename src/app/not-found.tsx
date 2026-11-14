import type { Metadata } from "next";
import Link from "next/link";
import { SUPPORT_PHONE } from "@/lib/domain/config";

export const metadata: Metadata = {
  title: "Page not found",
  description: "That page doesn’t exist on Srijan. Here’s the way back.",
  robots: { index: false, follow: false },
};

/** Where someone who hit a dead end most likely wanted to go. */
const WAYS_BACK = [
  { href: "/", label: "Home", note: "Start from the top." },
  { href: "/creators", label: "Explore creators", note: "Browse verified creators near you." },
  { href: "/book", label: "Book a service", note: "Pick a service, a time and a city." },
  { href: "/brands", label: "For brands", note: "Run an influencer campaign." },
  { href: "/support", label: "Help & support", note: "Tell us what you were looking for." },
];

export default function NotFound() {
  return (
    <div className="container narrow page">
      <section className="stack-lg">
        <div className="stack">
          <p className="nf-code" aria-hidden="true">
            404
          </p>
          <h1>This page doesn’t exist</h1>
          <p className="muted">
            The link may be old, or we may have moved the page. Nothing is wrong with your account — try one of these instead.
          </p>
        </div>

        <nav className="nf-ways" aria-label="Ways back">
          {WAYS_BACK.map((w) => (
            <Link key={w.href} href={w.href} className="card nf-way">
              <span className="strong">{w.label}</span>
              <span className="small muted">{w.note}</span>
            </Link>
          ))}
        </nav>

        <p className="small muted">
          Still stuck? Call the Srijan team on{" "}
          <a href={`tel:+91${SUPPORT_PHONE}`}>{SUPPORT_PHONE}</a>.
        </p>
      </section>
    </div>
  );
}
