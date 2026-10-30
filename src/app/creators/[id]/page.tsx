"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useData } from "@/lib/client/api";
import type { CreatorPublic } from "@/lib/domain/views";
import { Avatar, Loading, SocialLink, Stars } from "@/components/ui";
import { inr, when } from "@/lib/client/format";

type Profile = CreatorPublic & { reviews: { rating: number; review?: string; at: number }[] };

export default function CreatorProfile() {
  const { id } = useParams<{ id: string }>();
  const { data: c, error } = useData<Profile>(`/api/creators/${id}`);
  if (error) return <div className="container page"><p className="error">{error.message}</p></div>;
  if (!c) return <Loading />;

  return (
    <div className="container page narrow">
      <Link href="/creators" className="small strong">
        ← All creators
      </Link>
      <div className="row">
        <Avatar name={c.name} large />
        <div className="stack grow" style={{ gap: 4 }}>
          <h1>{c.name}</h1>
          <span className="muted">
            {c.area} · {c.languages.join(", ")}
          </span>
          <div className="chips">
            {c.verified && <span className="badge badge-violet">ID verified</span>}
            {c.onDemand && <span className="badge badge-violet">Same-day shoots</span>}
            {c.available ? <span className="badge badge-green">Online now</span> : <span className="badge">Offline</span>}
          </div>
        </div>
      </div>
      {c.bio && <p>{c.bio}</p>}
      <SocialLink social={c.social} />

      <div className="card" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", textAlign: "center" }}>
        <div>
          <div className="big-num" style={{ fontSize: 24 }}>{c.rating ? `${c.rating} ★` : "New"}</div>
          <div className="tiny muted">{c.ratingCount} reviews</div>
        </div>
        <div>
          <div className="big-num" style={{ fontSize: 24 }}>{c.jobsDone}</div>
          <div className="tiny muted">jobs done</div>
        </div>
        <div>
          <div className="big-num" style={{ fontSize: 24 }}>{c.followers ? `${Math.round(c.followers / 1000)}K` : "—"}</div>
          <div className="tiny muted">{c.instagram ?? "followers"}</div>
        </div>
      </div>

      <section className="stack">
        <h2>Services</h2>
        {c.services.map((s) => (
          <div key={s.key} className={`card stack${s.key === "videography" ? " card-selected" : ""}`}>
            <div className="row between">
              <h3>{s.title}</h3>
              {s.key === "videography" && <span className="tag" style={{ background: "var(--orange)" }}>Same-day</span>}
            </div>
            <p className="small muted">{s.description}</p>
            <div className="row between">
              <b>{s.key === "influencer" ? `${c.followers ? Math.round(c.followers / 1000) + "K followers" : ""}${c.engagementRate ? ` · ${c.engagementRate}% engagement` : ""}` : s.price ? `${s.key === "videography" ? "From " : ""}${inr(s.price)}` : "Quote on request"}</b>
              {s.key === "videography" && c.onDemand ? (
                <Link href={`/book?creator=${c.id}`} className="btn btn-accent btn-sm">
                  Book {c.name.split(" ")[0]}
                </Link>
              ) : s.key === "influencer" ? (
                <Link href="/brands" className="btn btn-violet btn-sm">
                  Enquire
                </Link>
              ) : (
                <span className="tiny muted">Ordering opens soon</span>
              )}
            </div>
          </div>
        ))}
        {c.onDemand && (
          <p className="small muted">
            Booking {c.name.split(" ")[0]} sends the job to them first. If they don’t accept within 5 minutes, every available creator nearby is alerted at the same price.
          </p>
        )}
      </section>

      {c.gear.length > 0 && (
        <section className="stack">
          <h2>Gear</h2>
          <div className="chips">
            {c.gear.map((g) => (
              <span key={g} className="badge">
                {g}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="stack">
        <h2>Recent reviews</h2>
        {c.reviews.length === 0 && <p className="muted small">No reviews on Srijan yet.</p>}
        {c.reviews.map((r, i) => (
          <div key={i} className="card card-tight stack" style={{ gap: 4 }}>
            <Stars rating={r.rating} />
            {r.review && <p>{r.review}</p>}
            <span className="tiny muted">{when(r.at)}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
