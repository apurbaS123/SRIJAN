"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "./Session";
import { call } from "@/lib/client/api";
import { ThemeToggle } from "./ThemeToggle";

const LINKS = {
  guest: [
    { href: "/creators", label: "Explore" },
    { href: "/book", label: "Book a service" },
    { href: "/brands", label: "For brands" },
    { href: "/join", label: "Join as creator" },
  ],
  client: [
    { href: "/creators", label: "Explore" },
    { href: "/book", label: "Book a service" },
    { href: "/bookings", label: "My bookings" },
    { href: "/brands", label: "For brands" },
  ],
  creator: [
    { href: "/creator", label: "Jobs" },
    { href: "/creator/wallet", label: "Wallet" },
    { href: "/creator/campaigns", label: "Campaigns" },
  ],
  ops: [
    { href: "/ops", label: "Dispatch" },
    { href: "/ops/campaigns", label: "Campaigns" },
    { href: "/ops/creators", label: "Creators" },
  ],
};

export function Header() {
  const { session, refresh } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const role = session?.user?.role ?? "guest";
  const links = LINKS[role];

  // Following a link should close the menu, so the drawer never covers the page you just opened.
  useEffect(() => setOpen(false), [pathname]);

  // Escape closes it, and the page behind it shouldn't scroll while it's open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  async function signOut() {
    await call("/api/session", undefined, "DELETE");
    await refresh();
    router.push("/");
  }

  // The home page draws its own nav on the glass hero.
  if (pathname === "/") return null;

  return (
    <header className="header">
      <div className="container header-inner">
        <Link href={role === "creator" ? "/creator" : role === "ops" ? "/ops" : "/"} className="logo" aria-label="Srijan home">
          srijan<span className="logo-dot" />
          {role === "creator" && <small>for creators</small>}
          {role === "ops" && <small>ops</small>}
        </Link>

        <button
          type="button"
          className="nav-toggle"
          aria-expanded={open}
          aria-controls="site-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          <span className={`burger${open ? " burger-open" : ""}`} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>

        {/* Click-off sheet behind the drawer. */}
        {open && <button type="button" className="nav-scrim" aria-hidden="true" tabIndex={-1} onClick={() => setOpen(false)} />}

        <div id="site-nav" className={`nav-group${open ? " nav-open" : ""}`}>
          <nav className="nav" aria-label="Main">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className={pathname === l.href ? "active" : undefined} aria-current={pathname === l.href ? "page" : undefined}>
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="who">
            <ThemeToggle />
            {session?.user ? (
              <>
                <span>
                  {session.user.name} · <span className="strong">{session.user.role}</span>
                </span>
                <button className="btn btn-sm btn-ghost" onClick={signOut}>
                  Sign out
                </button>
              </>
            ) : (
              <Link href="/login" className="btn btn-sm btn-primary">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
