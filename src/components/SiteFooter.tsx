"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
    title: "Creators",
    links: [
      { href: "/join", label: "Join as creator" },
      { href: "/creator", label: "Creator dashboard" },
      { href: "/creator/payout", label: "Get paid" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/login", label: "Sign in" },
      { href: "/bookings", label: "My bookings" },
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
              {col.links.map((l) => (
                <Link key={l.href} href={l.href}>
                  {l.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="ft-cta">
          <h2>Need a creator?</h2>
          <Link href="/book" className="ft-cta-box">
            Book a service
            <span className="ft-cta-arrow" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </span>
          </Link>
          <small>Fixed prices, no haggling</small>
        </div>
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
          The creator economy of the Northeast.
        </p>
      </div>
    </footer>
  );
}
