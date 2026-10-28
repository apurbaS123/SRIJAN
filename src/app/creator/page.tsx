"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { call, useAction, useData, useTick } from "@/lib/client/api";
import type { BookingView, OfferView } from "@/lib/domain/views";
import { ErrorNote, Guard, StatusBadge } from "@/components/ui";
import { useSession } from "@/components/Session";
import { countdown, inr, when } from "@/lib/client/format";

/** Short beep so creators don't miss an alert (works after the first tap on the page). */
function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.value = 0.15;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.25);
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    /* sound is best-effort */
  }
}

function Alert({ o, onDone }: { o: OfferView; onDone: () => void }) {
  const router = useRouter();
  const now = useTick();
  const act = useAction();
  const left = o.expiresAt - now;
  const pct = Math.max(0, Math.min(1, left / (o.expiresAt - o.sentAt)));

  async function respond(action: "accept" | "decline") {
    const r = await act.run(() => call<{ accepted: boolean; bookingId?: string }>(`/api/offers/${o.id}`, { action }));
    if (r?.accepted && r.bookingId) router.push(`/creator/jobs/${r.bookingId}`);
    else onDone();
  }

  return (
    <article className="card card-dark stack" aria-live="assertive">
      <div className="row between">
        <span className="tag" style={{ background: "var(--orange)", color: "var(--ink)" }}>
          {o.kind === "direct" ? "Client picked you" : "New shoot near you"}
        </span>
        <span
          className="ring"
          style={{ background: `conic-gradient(var(--orange) ${pct * 360}deg, #3a3b45 0)`, color: "#fff" }}
          aria-label={`${countdown(left)} left to accept`}
        >
          <span style={{ background: "var(--ink)", borderRadius: "50%", width: 58, height: 58, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{countdown(left)}</span>
        </span>
      </div>
      <div>
        <span className="small muted">You earn</span>
        <div className="huge-num">{inr(o.payout)}</div>
        <span className="small muted">Client paid {inr(o.price)} · Srijan fee 20%</span>
      </div>
      <div className="stack" style={{ gap: 6, fontSize: 14 }}>
        <div className="row between"><span className="muted">Package</span><b>{o.packageName}</b></div>
        <div className="row between"><span className="muted">When</span><b>{when(o.scheduledAt)}</b></div>
        <div className="row between"><span className="muted">Where</span><b>{o.area} · {o.distanceKm} km away</b></div>
        <div className="row between"><span className="muted">Deliver by</span><b>{when(o.deliveryDueAt)}</b></div>
      </div>
      <p className="small">{o.brief}</p>
      <p className="tiny muted">
        {o.kind === "direct" ? "Only you have this job for now." : `Sent to ${o.alerted} creator${o.alerted === 1 ? "" : "s"} nearby. First to accept gets it.`} Exact address after you accept.
      </p>
      <ErrorNote error={act.error} />
      <div className="row">
        <button className="btn btn-lg grow" style={{ background: "transparent", color: "#fff", borderColor: "#5b5f6b" }} disabled={act.busy} onClick={() => respond("decline")}>
          Decline
        </button>
        <button className="btn btn-accent btn-lg grow" style={{ flexGrow: 2 }} disabled={act.busy} onClick={() => respond("accept")}>
          Accept job
        </button>
      </div>
    </article>
  );
}

function Home() {
  const { session, refresh } = useSession();
  const me = session?.creator;
  const offers = useData<OfferView[]>("/api/offers", 2000);
  const jobs = useData<BookingView[]>("/api/bookings", 5000);
  const act = useAction();
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    const fresh = offers.data?.filter((o) => !seen.current.has(o.id)) ?? [];
    if (fresh.length) beep();
    for (const o of fresh) seen.current.add(o.id);
    document.title = offers.data?.length ? `(${offers.data.length}) New job · Srijan` : "Srijan for creators";
  }, [offers.data]);

  async function patch(body: Record<string, unknown>) {
    const ok = await act.run(() => call("/api/me/creator", body, "PATCH"));
    if (ok) await refresh();
  }

  function shareLocation() {
    if (!navigator.geolocation) return act.setError("This device can’t share location");
    navigator.geolocation.getCurrentPosition(
      (p) => void patch({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => act.setError("Location permission was denied"),
    );
  }

  if (!me) return null;
  const active = jobs.data?.filter((b) => !["completed", "refunded", "cancelled"].includes(b.status)) ?? [];
  const past = jobs.data?.filter((b) => ["completed", "refunded", "cancelled"].includes(b.status)) ?? [];

  return (
    <div className="container page narrow">
      <div className="row between">
        <h1>Hi, {me.name.split(" ")[0]}</h1>
        {me.verification === "verified" ? <span className="badge badge-violet">Verified</span> : <span className="badge badge-amber">Verification {me.verification}</span>}
      </div>

      {me.verification !== "verified" && (
        <div className="card card-orange small">
          {me.verification === "pending"
            ? "Your profile is with the Srijan team for review. You can go online once it’s approved."
            : "Your profile wasn’t approved. Contact Srijan support."}
        </div>
      )}

      {me.onDemand && (
        <section className={`card stack${me.available ? " card-dark" : ""}`}>
          <div className="row between">
            <div className="stack" style={{ gap: 2 }}>
              <h2>{me.available ? "You’re online" : "You’re offline"}</h2>
              <span className="small muted">
                {me.available ? `Getting shoot alerts within ${me.maxTravelKm} km of ${me.area.split(",")[0]}` : "Go online to get same-day shoot alerts"}
              </span>
            </div>
            <button className={`btn btn-lg ${me.available ? "" : "btn-accent"}`} disabled={act.busy || me.verification !== "verified"} onClick={() => patch({ available: !me.available })}>
              {me.available ? "Go offline" : "Go online"}
            </button>
          </div>
          <div className="row">
            <span className="small muted">Travel up to</span>
            {[5, 10, 15, 20, 25].map((k) => (
              <button key={k} className={`chip${k === me.maxTravelKm ? " on" : ""}`} style={me.available && k === me.maxTravelKm ? { background: "var(--orange)", color: "var(--ink)", borderColor: "var(--orange)" } : undefined} onClick={() => patch({ maxTravelKm: k })}>
                {k} km
              </button>
            ))}
            <button className="chip" onClick={shareLocation}>
              Update my location
            </button>
          </div>
        </section>
      )}

      <ErrorNote error={act.error} />

      {offers.data && offers.data.length > 0 && (
        <section className="stack">
          <h2>Job alerts</h2>
          {offers.data.map((o) => (
            <Alert key={o.id} o={o} onDone={() => void offers.reload()} />
          ))}
        </section>
      )}

      <section className="stack">
        <h2>My jobs</h2>
        {active.length === 0 && <p className="muted small">No active jobs. {me.available ? "Alerts will appear here." : ""}</p>}
        {active.map((b) => (
          <Link key={b.id} href={`/creator/jobs/${b.id}`} className="card row between" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="stack" style={{ gap: 2 }}>
              <b>
                {b.packageName} · {when(b.scheduledAt)}
              </b>
              <span className="small muted">{b.area}</span>
            </div>
            <div className="row">
              <b>{inr(b.creatorPayout)}</b>
              <StatusBadge status={b.status} label={b.statusLabel} />
            </div>
          </Link>
        ))}
        {past.length > 0 && (
          <details>
            <summary className="small strong" style={{ cursor: "pointer" }}>
              Past jobs ({past.length})
            </summary>
            <div className="stack" style={{ marginTop: 10 }}>
              {past.map((b) => (
                <Link key={b.id} href={`/creator/jobs/${b.id}`} className="card card-tight row between" style={{ textDecoration: "none", color: "inherit" }}>
                  <span className="small">
                    {b.code} · {b.packageName} · {when(b.scheduledAt)}
                  </span>
                  <StatusBadge status={b.status} label={b.statusLabel} />
                </Link>
              ))}
            </div>
          </details>
        )}
      </section>
    </div>
  );
}

export default function CreatorHome() {
  return (
    <Guard role="creator">
      <Home />
    </Guard>
  );
}
