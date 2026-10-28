"use client";
import Link from "next/link";
import { useData } from "@/lib/client/api";
import type { CreatorPublic } from "@/lib/domain/views";
import { CreatorCard } from "@/components/ui";
import { useMeta } from "@/components/useMeta";
import { inr } from "@/lib/client/format";

export default function Home() {
  const meta = useMeta();
  const { data: nearby } = useData<CreatorPublic[]>("/api/creators?service=videography&available=1&city=guwahati");
  const from = meta ? Math.min(...meta.packages.map((p) => p.price)) : 2500;

  return (
    <div className="container page">
      <h1 style={{ maxWidth: 640 }}>What do you want to create today?</h1>

      <section className="hero">
        <div className="card card-dark stack">
          <span className="tag" style={{ background: "var(--orange)", color: "var(--ink)", alignSelf: "flex-start" }}>
            Same-day · delivered in 24 hrs
          </span>
          <h2 style={{ fontSize: 28 }}>Get a video shot today</h2>
          <p className="muted">
            A verified videographer near you comes to your place, shoots, edits and delivers within a day. Fixed prices, paid safely through Srijan.
          </p>
          <div className="row between" style={{ marginTop: 8 }}>
            <span className="muted small">
              From <b style={{ color: "#fff", fontSize: 20 }}>{inr(from)}</b> + GST
            </span>
            <Link href="/book" className="btn btn-accent">
              Book a shoot
            </Link>
          </div>
        </div>
        <div className="card card-violet stack">
          <span className="tag" style={{ background: "var(--violet)", color: "#fff", alignSelf: "flex-start" }}>
            For brands
          </span>
          <h2 style={{ fontSize: 28 }}>Run an influencer campaign</h2>
          <p style={{ color: "var(--ink-2)" }}>
            Book a free strategy call. Our team shortlists creators across the Northeast, manages every deal and reports the results.
          </p>
          <div style={{ marginTop: 8 }}>
            <Link href="/brands" className="btn btn-violet">
              Book a strategy call
            </Link>
          </div>
        </div>
      </section>

      <section className="stack">
        <div className="row between">
          <h2>Hire by service</h2>
          <Link href="/creators" className="strong small">
            See all creators
          </Link>
        </div>
        <div className="service-grid">
          {meta?.services.map((s) => (
            <Link key={s.key} href={`/creators?service=${s.key}`} className="service-tile">
              {s.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="stack">
        <h2>Available for shoots in Guwahati today</h2>
        <div className="grid">
          {nearby?.slice(0, 3).map((c) => <CreatorCard key={c.id} c={c} />)}
          {nearby && nearby.length === 0 && <p className="muted">No one is online right now — book anyway and we’ll find someone.</p>}
        </div>
      </section>

      <section className="card stack">
        <h2>Are you a creator?</h2>
        <p className="muted">
          Influencers, videographers, editors, designers, writers and voice artists — list your services, get same-day shoot jobs near you and brand campaigns. You keep 80% of every shoot.
        </p>
        <div>
          <Link href="/join" className="btn btn-primary">
            Join Srijan
          </Link>
        </div>
      </section>
    </div>
  );
}
