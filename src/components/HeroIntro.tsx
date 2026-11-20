import Link from "next/link";
import { COPY } from "./glass/layout";

/**
 * The hero's words as ordinary DOM.
 *
 * The glass hero prints its text into a WebGL canvas, positioned from geometry it can only know
 * once it has measured the page and loaded the fonts — so until then it renders nothing at all,
 * and the homepage's HTML had no `<h1>` and barely a sentence in it. Google runs JavaScript and
 * would eventually see the canvas layer's copy, but the HTML is what every other reader gets:
 * crawlers that do not run scripts, a browser with scripting off, a slow phone mid-load, and the
 * preview in a chat app.
 *
 * So this is the same copy, in plain elements, rendered on the server. `GlassHero` swaps it out
 * the moment it has a layout, which is why it must be the same words and not a summary: nobody
 * should see one headline replaced by a different one.
 *
 * Kept deliberately simple. It is on screen for a few hundred milliseconds in the normal case, and
 * permanently only when the hero cannot run at all.
 */
export function HeroIntro({ navLinks, account }: { navLinks: { label: string; href: string }[]; account: { label: string; href: string } }) {
  return (
    <div className="gh-intro">
      <nav className="gh-intro-nav" aria-label="Main">
        <Link href="/" className="gh-intro-brand">
          srijan<span aria-hidden="true">.</span>
        </Link>
        <span className="gh-intro-links">
          {navLinks.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
          <Link href={account.href}>{account.label}</Link>
        </span>
      </nav>
      <div className="gh-intro-copy">
        <p className="gh-intro-eyebrow">{COPY.eyebrow}</p>
        <h1 className="gh-intro-h1">{COPY.h1.join(" ")}</h1>
        {COPY.sub.map((line) => (
          <p key={line} className="gh-intro-sub">
            {line}
          </p>
        ))}
        <p className="gh-intro-cta">
          <Link href={COPY.cta.href} className="btn btn-accent">
            {COPY.cta.label}
          </Link>
          <Link href={COPY.cta2.href} className="btn">
            {COPY.cta2.label}
          </Link>
        </p>
      </div>
      <p className="gh-intro-foot">{COPY.footL}</p>
    </div>
  );
}
