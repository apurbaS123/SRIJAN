"use client";
import Link from "next/link";
import { useData } from "@/lib/client/api";
import type { BookingView, CampaignView } from "@/lib/domain/views";
import { Guard, StatusBadge } from "@/components/ui";
import { inr, when } from "@/lib/client/format";

function List() {
  const { data, loading } = useData<BookingView[]>("/api/bookings", 5000);
  const { data: campaigns } = useData<CampaignView[]>("/api/campaigns");
  return (
    <div className="container page">
      <div className="row between">
        <h1>My bookings</h1>
        <Link href="/book" className="btn btn-accent">
          Book a shoot
        </Link>
      </div>
      {loading && !data && <p className="muted">Loading…</p>}
      {data?.length === 0 && <p className="muted">No bookings yet.</p>}
      <div className="stack">
        {data?.map((b) => (
          <Link key={b.id} href={`/bookings/${b.id}`} className="card row between" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="stack" style={{ gap: 2 }}>
              <b>
                {b.packageName} · {b.code}
              </b>
              <span className="small muted">
                {when(b.scheduledAt)} · {b.area}
                {b.creator ? ` · ${b.creator.name}` : ""}
              </span>
            </div>
            <div className="row">
              <span className="small strong">{inr(b.total)}</span>
              <StatusBadge status={b.status} label={b.statusLabel} />
            </div>
          </Link>
        ))}
      </div>
      {campaigns && campaigns.length > 0 && (
        <section className="stack">
          <h2>Campaign requests</h2>
          {campaigns.map((c) => (
            <div key={c.id} className="card row between">
              <div className="stack" style={{ gap: 2 }}>
                <b>{c.brandName}</b>
                <span className="small muted">
                  {c.code} · strategy call {when(c.callAt)}
                </span>
              </div>
              <span className="badge badge-violet">{c.stageLabel}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

export default function BookingsPage() {
  return (
    <Guard role="client">
      <List />
    </Guard>
  );
}
