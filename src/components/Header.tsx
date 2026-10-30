"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "./Session";
import { call } from "@/lib/client/api";

const LINKS = {
  guest: [
    { href: "/creators", label: "Explore" },
    { href: "/book", label: "Book a shoot" },
    { href: "/brands", label: "For brands" },
    { href: "/join", label: "Join as creator" },
  ],
  client: [
    { href: "/creators", label: "Explore" },
    { href: "/book", label: "Book a shoot" },
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
  const role = session?.user?.role ?? "guest";
  const links = LINKS[role];

  async function signOut() {
    await call("/api/session", undefined, "DELETE");
    await refresh();
    router.push("/");
  }

  // The home page draws its own nav on the glass hero.
  if (pathname === "/") return null;

  return (
    <>
      <header className="header">
        <div className="container header-inner">
          <Link href={role === "creator" ? "/creator" : role === "ops" ? "/ops" : "/"} className="logo">
            srijan<span className="logo-dot" />
            {role === "creator" && <small>for creators</small>}
            {role === "ops" && <small>ops</small>}
          </Link>
          <nav className="nav" aria-label="Main">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className={pathname === l.href ? "active" : undefined}>
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="who">
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
      </header>
    </>
  );
}
