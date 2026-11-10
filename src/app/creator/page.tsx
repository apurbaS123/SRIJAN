"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { call, useAction, useData, useTick } from "@/lib/client/api";
import type { BookingView, CreatorPublic, OfferView, SentOfferView } from "@/lib/domain/views";
import { ErrorNote, Guard, SocialLink, StatusBadge } from "@/components/ui";
import { SOCIAL_PLATFORMS } from "@/lib/domain/config";
import type { SocialPlatform } from "@/lib/domain/types";
import { useSession } from "@/components/Session";
import { countdown, inr, when } from "@/lib/client/format";
import { PushToggle } from "@/components/PushToggle";

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
          {o.kind === "direct" ? "Client picked you" : o.online ? "New online job" : "New job near you"}
        </span>
        {left > 0 ? (
          <span
            className="ring"
            style={{ background: `conic-gradient(var(--orange) ${pct * 360}deg, #3a3b45 0)`, color: "#fff" }}
            aria-label={`${countdown(left)} left to accept`}
          >
            <span style={{ background: "var(--ink)", borderRadius: "50%", width: 58, height: 58, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{countdown(left)}</span>
          </span>
        ) : (
          // Nobody took it in the first 5 minutes, so it is still going. Only the start time ends it.
          <span className="tag" style={{ background: "var(--violet)", color: "#fff" }}>Still open</span>
        )}
      </div>
      <div>
        <span className="small muted">You earn</span>
        <div className="huge-num">{inr(o.payout)}</div>
        <span className="small muted">Client pays {inr(o.price)} · Srijan fee 20%</span>
      </div>
      <div className="stack" style={{ gap: 6, fontSize: 14 }}>
        <div className="row between"><span className="muted">Package</span><b>{o.packageName}</b></div>
        <div className="row between"><span className="muted">{o.online ? "Finish by" : "When"}</span><b>{when(o.scheduledAt)}</b></div>
        <div className="row between"><span className="muted">Where</span><b>{o.online ? "Online" : `${o.area} · ${o.distanceKm} km away`}</b></div>
      </div>
      <p className="small">{o.brief}</p>
      <p className="tiny muted">
        {o.kind === "direct" ? "Only you have this job for now." : `Sent to ${o.alerted} creator${o.alerted === 1 ? "" : "s"}. First to accept gets it.`} Accepting asks the client to pay:
        the job is yours, with their number{o.online ? "" : " and the exact address"}, as soon as the money lands.
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
  const sent = useData<SentOfferView[]>("/api/offers/sent", 15000);
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
  const directOffers = offers.data?.filter((o) => o.kind === "direct") ?? [];
  const otherAlerts = offers.data?.filter((o) => o.kind !== "direct") ?? [];
  const active = jobs.data?.filter((b) => !["completed", "refunded", "cancelled"].includes(b.status)) ?? [];
  const past = jobs.data?.filter((b) => ["completed", "refunded", "cancelled"].includes(b.status)) ?? [];
  const toReview = past.filter((b) => b.status === "completed" && !b.reviewOfClient).length;

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

      {!me.payout && (
        <div className="card card-orange row between">
          <span className="small">Link your bank account or UPI ID so you can go online and get paid.</span>
          <Link href="/creator/payout" className="btn btn-sm btn-accent">
            Link now
          </Link>
        </div>
      )}

      <section className={`card stack${me.available ? " card-dark" : ""}`}>
          <div className="row between">
            <div className="stack" style={{ gap: 2 }}>
              <h2>{me.available ? "You’re online" : "You’re offline"}</h2>
              <span className="small muted">
                {me.available ? "Getting alerts for jobs in your field" : "Go online to get job alerts"}
              </span>
            </div>
            <button className={`btn btn-lg ${me.available ? "" : "btn-accent"}`} disabled={act.busy || me.verification !== "verified" || !me.payout} onClick={() => patch({ available: !me.available })}>
              {me.available ? "Go offline" : "Go online"}
            </button>
          </div>
          {/* Every kind of service has jobs at the client's place, so everyone sets a distance. */}
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

      <PushToggle what="job alerts" />

      <ErrorNote error={act.error} />

      <PortfolioCard url={me.portfolio} />
      <SocialCard social={me.social} followers={me.followers} />

      {directOffers.length > 0 && (
        <section className="stack">
          <h2>Job offers for you</h2>
          <p className="small muted">A client sent {directOffers.length === 1 ? "this job" : "these jobs"} to you from your profile. Nobody else can take {directOffers.length === 1 ? "it" : "them"} until the timer runs out.</p>
          {directOffers.map((o) => (
            <Alert key={o.id} o={o} onDone={() => { void offers.reload(); void sent.reload(); }} />
          ))}
        </section>
      )}

      {otherAlerts.length > 0 && (
        <section className="stack">
          <h2>Job alerts</h2>
          {otherAlerts.map((o) => (
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
              Past jobs ({past.length}){toReview ? ` · ${toReview} to review` : ""}
            </summary>
            <div className="stack" style={{ marginTop: 10 }}>
              {past.map((b) => (
                <Link key={b.id} href={`/creator/jobs/${b.id}`} className="card card-tight row between" style={{ textDecoration: "none", color: "inherit" }}>
                  <span className="small">
                    {b.code} · {b.packageName} · {when(b.scheduledAt)}
                  </span>
                  {b.status === "completed" && !b.reviewOfClient ? (
                    <span className="badge badge-orange">★ Review client</span>
                  ) : (
                    <StatusBadge status={b.status} label={b.statusLabel} />
                  )}
                </Link>
              ))}
            </div>
          </details>
        )}
      </section>

      {sent.data && sent.data.length > 0 && <SentOffers list={sent.data} />}
    </div>
  );
}

const OUTCOME: Record<SentOfferView["outcome"], { label: string; badge: string }> = {
  waiting: { label: "Waiting for you", badge: "badge-orange" },
  taken: { label: "You took it", badge: "badge-green" },
  declined: { label: "You declined", badge: "" },
  missed: { label: "Missed · sent to everyone", badge: "badge-amber" },
  offline: { label: "You were offline", badge: "badge-amber" },
  other_creator: { label: "Another creator took it", badge: "" },
  cancelled: { label: "Cancelled by the client", badge: "" },
};

/** Every job a client sent to this creator from their profile, including ones they missed or were offline for. */
function SentOffers({ list }: { list: SentOfferView[] }) {
  return (
    <section className="stack">
      <h2>Job offers sent to you</h2>
      {list.map((o) => {
        const out = OUTCOME[o.outcome];
        const body = (
          <>
            <div className="stack" style={{ gap: 2 }}>
              <b>
                {o.packageName} · {when(o.scheduledAt)}
              </b>
              <span className="small muted">
                {o.area} · you earn {inr(o.payout)} · sent {when(o.sentAt)}
              </span>
            </div>
            <span className={`badge ${out.badge}`}>{out.label}</span>
          </>
        );
        return o.outcome === "taken" ? (
          <Link key={o.bookingId} href={`/creator/jobs/${o.bookingId}`} className="card card-tight row between" style={{ textDecoration: "none", color: "inherit" }}>
            {body}
          </Link>
        ) : (
          <div key={o.bookingId} className="card card-tight row between">
            {body}
          </div>
        );
      })}
    </section>
  );
}

/** Add, change or remove the portfolio link shown on the public profile. */
function PortfolioCard({ url }: { url?: string }) {
  const { refresh } = useSession();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(url ?? "");
  const { busy, error, run } = useAction();

  async function save(next: string) {
    if (await run(() => call("/api/me/creator", { portfolio: next }, "PATCH"))) {
      await refresh();
      setEditing(false);
    }
  }

  return (
    <section className="card stack">
      <h2>Portfolio</h2>
      {editing ? (
        <>
          <div className="field">
            <label htmlFor="portfolio">Portfolio link</label>
            <input id="portfolio" className="input" type="url" inputMode="url" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <ErrorNote error={error} />
          <div className="row">
            <button className="btn btn-sm btn-primary" disabled={busy || !value.trim()} onClick={() => void save(value)}>
              Save
            </button>
            <button className="btn btn-sm" disabled={busy} onClick={() => { setValue(url ?? ""); setEditing(false); }}>
              Cancel
            </button>
          </div>
        </>
      ) : url ? (
        <div className="row between">
          <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="small strong" style={{ overflowWrap: "anywhere" }}>
            {url} ↗
          </a>
          <div className="row">
            <button className="btn btn-sm" onClick={() => { setValue(url); setEditing(true); }}>
              Change
            </button>
            <button className="btn btn-sm" disabled={busy} onClick={() => void save("")}>
              Remove
            </button>
          </div>
          <ErrorNote error={error} />
        </div>
      ) : (
        <div className="row between">
          <span className="small muted">No portfolio linked yet.</span>
          <button className="btn btn-sm btn-accent" onClick={() => { setValue(""); setEditing(true); }}>
            Add portfolio link
          </button>
        </div>
      )}
    </section>
  );
}

/** Add, change or remove the main social media account shown on the public profile. */
function SocialCard({ social, followers }: { social?: CreatorPublic["social"]; followers?: number }) {
  const { refresh } = useSession();
  const offered = (p?: string) => SOCIAL_PLATFORMS.find((x) => x.key === p)?.key ?? SOCIAL_PLATFORMS[0]!.key;
  const [editing, setEditing] = useState(false);
  const [platform, setPlatform] = useState<SocialPlatform>(offered(social?.platform));
  const [value, setValue] = useState("");
  const [count, setCount] = useState("");
  const { busy, error, run } = useAction();
  const label = SOCIAL_PLATFORMS.find((p) => p.key === platform)?.label;

  function start() {
    setPlatform(offered(social?.platform));
    // A link on a site that's no longer offered (Website) can't be kept as is.
    setValue(social && SOCIAL_PLATFORMS.some((p) => p.key === social.platform) ? social.url : "");
    setCount(followers ? String(followers) : "");
    setEditing(true);
  }

  async function save(url: string, withCount: boolean) {
    const body = withCount ? { social: { platform, url }, followers: count.trim() ? Number(count) : null } : { social: { platform, url } };
    if (await run(() => call("/api/me/creator", body, "PATCH"))) {
      await refresh();
      setEditing(false);
    }
  }

  return (
    <section className="card stack">
      <h2>Social media account</h2>
      {editing ? (
        <>
          <div className="chips" role="group" aria-label="Site">
            {SOCIAL_PLATFORMS.map((p) => (
              <button key={p.key} type="button" aria-pressed={platform === p.key} className={`chip${platform === p.key ? " on" : ""}`} onClick={() => setPlatform(p.key)}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="row">
            <div className="field grow">
              <label htmlFor="social">{label} profile link</label>
              <input id="social" className="input" type="url" inputMode="url" value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
            <div className="field" style={{ maxWidth: 160 }}>
              <label htmlFor="followers">Followers</label>
              <input id="followers" className="input" type="number" min={0} step={1} value={count} onChange={(e) => setCount(e.target.value)} />
            </div>
          </div>
          <ErrorNote error={error} />
          <div className="row">
            <button className="btn btn-sm btn-primary" disabled={busy || !value.trim()} onClick={() => void save(value, true)}>
              Save
            </button>
            <button className="btn btn-sm" disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </>
      ) : social ? (
        <div className="row between">
          <span className="row">
            <SocialLink social={social} />
            {followers ? <span className="small muted">{followers.toLocaleString("en-IN")} followers</span> : null}
          </span>
          <div className="row">
            <button className="btn btn-sm" onClick={start}>
              Change
            </button>
            <button className="btn btn-sm" disabled={busy} onClick={() => void save("", false)}>
              Remove
            </button>
          </div>
          <ErrorNote error={error} />
        </div>
      ) : (
        <div className="row between">
          <span className="small muted">No social media account linked yet.</span>
          <button className="btn btn-sm btn-accent" onClick={start}>
            Add social media link
          </button>
        </div>
      )}
    </section>
  );
}

export default function CreatorHome() {
  return (
    <Guard role="creator">
      <Home />
    </Guard>
  );
}
