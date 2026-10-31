"use client";
import Link from "next/link";
import { useData } from "@/lib/client/api";
import type { CampaignView } from "@/lib/domain/views";
import { Avatar, Guard, Loading } from "@/components/ui";
import { inr, when } from "@/lib/client/format";

function Finished({ c }: { c: CampaignView }) {
  return (
    <article className="card stack">
      <div className="row between">
        <div className="stack" style={{ gap: 2 }}>
          <h2>{c.brandName}</h2>
          <span className="small muted">
            {c.code} · completed {when(c.settledAt)}
          </span>
        </div>
        <span className="badge badge-green">Completed</span>
      </div>

      <div className="grid">
        <div className="stack" style={{ gap: 2 }}>
          <span className="label">Goal</span>
          <span>{c.goal}</span>
        </div>
        <div className="stack" style={{ gap: 2 }}>
          <span className="label">Budget</span>
          <span>{inr(c.budget)}</span>
        </div>
        <div className="stack" style={{ gap: 4 }}>
          <span className="label">Regions</span>
          <div className="chips">
            {c.regions.map((r) => (
              <span key={r} className="badge">
                {r}
              </span>
            ))}
          </div>
        </div>
      </div>

      <hr className="divider" />
      <span className="label">Creators ({c.creators.length})</span>
      {c.creators.length === 0 && <p className="small muted">No creators were booked on this campaign.</p>}
      {c.creators.map((x) => (
        <div key={x.creatorId} className="row">
          <Avatar name={x.name} />
          <div className="grow stack" style={{ gap: 2 }}>
            <Link href={`/creators/${x.creatorId}`} className="strong">
              {x.name}
            </Link>
            <span className="small muted">{x.deliverables}</span>
          </div>
        </div>
      ))}
    </article>
  );
}

function List() {
  const { data, error } = useData<CampaignView[]>("/api/campaigns");
  if (error) return <div className="container page"><p className="error">{error.message}</p></div>;
  if (!data) return <Loading />;
  const done = data.filter((c) => c.stage === "closed").sort((a, b) => (b.settledAt ?? 0) - (a.settledAt ?? 0));
  const open = data.filter((c) => c.stage !== "closed");
  return (
    <div className="container page narrow">
      <div className="row between">
        <h1>My campaigns</h1>
        <Link href="/brands" className="btn btn-accent">
          New campaign
        </Link>
      </div>

      <section className="stack">
        <h2>Finished</h2>
        {done.length === 0 && <p className="muted small">No finished campaigns yet. They’ll appear here once the Srijan team closes them.</p>}
        {done.map((c) => (
          <Finished key={c.id} c={c} />
        ))}
      </section>

      {open.length > 0 && (
        <section className="stack">
          <h2>In progress</h2>
          {open.map((c) => (
            <div key={c.id} className="card card-tight row between">
              <span className="small">
                <b>{c.brandName}</b> · {c.code}
              </span>
              <span className="badge badge-violet">{c.stageLabel}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

export default function CampaignsPage() {
  return (
    <Guard role="client">
      <List />
    </Guard>
  );
}
