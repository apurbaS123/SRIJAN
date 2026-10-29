"use client";
import Link from "next/link";
import { useData } from "@/lib/client/api";
import type { CreatorPublic } from "@/lib/domain/views";
import { CreatorCard } from "@/components/ui";
import { useMeta } from "@/components/useMeta";
import { GlassHero } from "@/components/GlassHero";

export default function Home() {
  const meta = useMeta();
  const { data: nearby } = useData<CreatorPublic[]>("/api/creators?service=videography&available=1&city=guwahati");
  const from = meta ? Math.min(...meta.packages.map((p) => p.price)) : 2500;

  return (
    <>
      <GlassHero fromPrice={from} />
      <div className="container page page-no-glass">
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

        <section className="card card-violet stack">
          <span className="tag" style={{ alignSelf: "flex-start" }}>For brands</span>
          <h2>Run an influencer campaign</h2>
          <p style={{ color: "var(--ink-2)" }}>
            Book a free strategy call. Our team shortlists creators across the Northeast, manages every deal and reports the results.
          </p>
          <div>
            <Link href="/brands" className="btn btn-violet">
              Book a strategy call
            </Link>
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
    </>
  );
}
