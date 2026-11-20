"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SUPPORT_EMAIL, SUPPORT_PHONE } from "@/lib/domain/config";
import { SOCIAL_PROFILES } from "@/lib/schema";

const COLUMNS = [
  {
    title: "Services",
    links: [
      { href: "/book", label: "Book a service" },
      { href: "/creators", label: "Explore creators" },
      { href: "/brands", label: "For brands" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About us" },
      { href: "/terms", label: "Terms & conditions" },
      { href: "/privacy", label: "Privacy policy" },
      { href: "/faqs", label: "FAQs" },
      { href: "/how-it-works", label: "How it works" },
    ],
  },
  {
    title: "Contact us",
    links: [
      { href: `tel:+91${SUPPORT_PHONE}`, label: SUPPORT_PHONE },
      { href: `mailto:${SUPPORT_EMAIL}`, label: SUPPORT_EMAIL },
      { href: "/support", label: "Raise a ticket" },
      // The one outbound link on the site that says who Srijan is elsewhere. It backs the `sameAs`
      // in the Organization schema: a claim a search engine can follow and see confirmed.
      ...SOCIAL_PROFILES.map((url) => ({ href: url, label: "Instagram" })),
    ],
  },
];

/** The site footer. Left out of the ops and creator work screens, where it would only get in the way. */
export function SiteFooter() {
  const pathname = usePathname();
  if (/^\/(ops|creator)(\/|$)/.test(pathname)) return null;

  return (
    <footer className="site-footer">
      <div className="ft-top">
        <div className="ft-brand">
          <Link href="/" className="ft-logo" aria-label="Srijan home">
            <span className="ft-mark" aria-hidden="true" />
            srijan
          </Link>
          <p>Hire verified creators, book a same-day service, or run an influencer campaign.</p>
        </div>

        <nav className="ft-columns" aria-label="Footer">
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h2>{col.title}</h2>
              {col.links.map((l) =>
                // A phone number isn't a page, so it stays a plain link.
                l.href.startsWith("tel:") || l.href.startsWith("mailto:") ? (
                  <a key={l.href} href={l.href}>
                    {l.label}
                  </a>
                ) : l.href.startsWith("http") ? (
                  <a key={l.href} href={l.href} target="_blank" rel="me noopener noreferrer">
                    {l.label} ↗
                  </a>
                ) : (
                  <Link key={l.href} href={l.href}>
                    {l.label}
                  </Link>
                ),
              )}
            </div>
          ))}
        </nav>
      </div>

      <div className="ft-stage">
        <span className="ft-wordmark" aria-hidden="true">
          srijan
        </span>
        {/* Hands from Michelangelo's The Creation of Adam (public domain). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="ft-hand ft-hand-left" src="/footer/hand-left.webp" alt="" width={996} height={400} loading="lazy" decoding="async" draggable={false} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="ft-hand ft-hand-right" src="/footer/hand-right.webp" alt="" width={652} height={372} loading="lazy" decoding="async" draggable={false} />
        <p className="ft-copy">
          © {new Date().getFullYear()}
          <br />
          Srijan
          <br />
          The creator economy of India.
        </p>
      </div>
    </footer>
  );
}
