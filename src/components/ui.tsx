"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useSession } from "./Session";
import type { Role } from "@/lib/domain/types";
import type { CreatorPublic } from "@/lib/domain/views";
import { initials, inr } from "@/lib/client/format";
import { SOCIAL_PLATFORMS } from "@/lib/domain/config";

/** Shows children only to the given roles; otherwise a sign-in prompt. */
export function Guard({ role, children }: { role: Role | Role[]; children: ReactNode }) {
  const { session, loading, error } = useSession();
  const pathname = usePathname();
  const roles = Array.isArray(role) ? role : [role];
  if (!session && error) return <SessionError />;
  if (loading && !session) return <Loading />;
  if (!session?.user || !roles.includes(session.user.role)) {
    const who = roles.map((r) => (r === "client" ? "a client or brand" : r === "creator" ? "a creator" : "the Srijan team")).join(" or ");
    const next = `?next=${encodeURIComponent(pathname)}`;
    return (
      <div className="container narrow page">
        <div className="card stack">
          <h2>Sign in as {who}</h2>
          <p className="muted">
            {session?.user ? `You’re signed in as ${session.user.name}, whose account can’t open this page.` : `This page is for ${who}. Sign in with your email to continue.`}
          </p>
          <div>
            <Link href={`/login${next}`} className="btn btn-primary">
              {session?.user ? "Switch account" : "Sign in"}
            </Link>
          </div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

/** Shown when the server can't say who is signed in, instead of loading forever. */
export function SessionError() {
  const { error, refresh } = useSession();
  return (
    <div className="container narrow page">
      <div className="card stack">
        <h2>Can’t reach Srijan right now</h2>
        <p className="muted">{error}</p>
        <div>
          <button className="btn btn-primary" onClick={() => void refresh()}>
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

/** The creator's main social media account, opened in a new tab. */
export function SocialLink({ social }: { social?: CreatorPublic["social"] }) {
  if (!social) return null;
  const label = SOCIAL_PLATFORMS.find((p) => p.key === social.platform)?.label ?? "Profile";
  return (
    <a href={social.url} target="_blank" rel="noopener noreferrer nofollow" className="small strong">
      {label} ↗
    </a>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="container page">
      <p className="muted">{label}</p>
    </div>
  );
}

export function ErrorNote({ error }: { error?: string | null }) {
  if (!error) return null;
  return (
    <div className="error" role="alert">
      {error}
    </div>
  );
}

const AVATAR_TINTS = [
  ["#DCD6FF", "#2E1C8F"],
  ["#FFE1CC", "#7A2E05"],
  ["#D4F0DD", "#0E5A2B"],
  ["#E0E7F5", "#1E3A6B"],
];

export function Avatar({ name, large }: { name: string; large?: boolean }) {
  const i = [...name].reduce((s, ch) => s + ch.charCodeAt(0), 0) % AVATAR_TINTS.length;
  const [bg, fg] = AVATAR_TINTS[i]!;
  return (
    <span className={`avatar${large ? " avatar-lg" : ""}`} style={{ background: bg, color: fg }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function Stars({ rating, count }: { rating: number | null; count?: number }) {
  if (!rating) return <span className="small muted">New on Srijan</span>;
  return (
    <span className="small strong">
      {rating.toFixed(1)} ★{count ? <span className="muted"> ({count})</span> : null}
    </span>
  );
}

export function CreatorCard({ c, km }: { c: CreatorPublic; km?: number }) {
  const from = c.services.filter((s) => s.price).map((s) => s.price!) as number[];
  return (
    <article className="card stack">
      <div className="row">
        <Avatar name={c.name} />
        <div className="grow stack" style={{ gap: 2 }}>
          <span className="strong">
            {c.name} {c.verified && <span className="badge badge-violet">Verified</span>}
          </span>
          <span className="small muted">
            {c.area}
            {km !== undefined ? ` · ${km} km` : ""}
          </span>
          <Stars rating={c.rating} count={c.ratingCount} />
        </div>
      </div>
      <div className="chips">
        {c.services.map((s) => (
          <span key={s.key} className="badge">
            {s.title}
          </span>
        ))}
        {c.onDemand && c.available && <span className="badge badge-orange">Available today</span>}
      </div>
      <div className="row between">
        <span className="small muted">{from.length ? <>From <b style={{ color: "var(--ink)", fontSize: 16 }}>{inr(Math.min(...from))}</b></> : "Quote on request"}</span>
        <Link href={`/creators/${c.id}`} className="btn btn-sm btn-primary">
          View profile
        </Link>
      </div>
    </article>
  );
}

export function StatusBadge({ status, label }: { status: string; label: string }) {
  const tone =
    status === "needs_ops" || status === "refunded" || status === "cancelled"
      ? "badge-red"
      : status === "searching" || status === "revision_requested"
        ? "badge-orange"
        : status === "completed" || status === "delivered"
          ? "badge-green"
          : "badge-violet";
  return <span className={`badge ${tone}`}>{label}</span>;
}
