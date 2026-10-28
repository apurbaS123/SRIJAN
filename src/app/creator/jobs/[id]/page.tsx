"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { call, useAction, useData, useTick } from "@/lib/client/api";
import type { BookingView } from "@/lib/domain/views";
import { ErrorNote, Guard, Loading, Stars, StatusBadge } from "@/components/ui";
import { duration, inr, time, when } from "@/lib/client/format";

function Step({ n, title, state, children }: { n: number; title: string; state: "done" | "now" | "later"; children?: React.ReactNode }) {
  return (
    <section className={`card stack${state === "now" ? " card-selected" : ""}`} style={state === "later" ? { opacity: 0.6 } : undefined}>
      <div className="row">
        <span
          className="avatar"
          style={{ width: 28, height: 28, fontSize: 13, background: state === "done" ? "var(--green)" : state === "now" ? "var(--ink)" : "#d5d6dc", color: "#fff" }}
          aria-hidden="true"
        >
          {state === "done" ? "✓" : n}
        </span>
        <h3>{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Job() {
  const { id } = useParams<{ id: string }>();
  const { data: b, error, setData, reload } = useData<BookingView>(`/api/bookings/${id}`, 4000);
  const act = useAction();
  const now = useTick(5000);
  const [otp, setOtp] = useState("");
  const [videoUrl, setVideoUrl] = useState("");

  if (error) return <div className="container page"><p className="error">{error.message}</p></div>;
  if (!b) return <Loading />;

  async function post(body: Record<string, unknown>) {
    const r = await act.run(() => call<BookingView>(`/api/bookings/${b!.id}`, body));
    if (r) setData(r);
    else void reload();
  }

  function checkInWithGps() {
    if (!navigator.geolocation) return act.setError("This device can’t share location");
    navigator.geolocation.getCurrentPosition(
      (p) => void post({ action: "checkin", otp, lat: p.coords.latitude, lng: p.coords.longitude }),
      () => act.setError("Location permission was denied"),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  const order = ["assigned", "shooting", "editing", "delivered", "completed"];
  const at = order.indexOf(b.status === "revision_requested" ? "editing" : b.status);
  const st = (i: number) => (at > i ? "done" : at === i ? "now" : "later") as "done" | "now" | "later";
  const late = b.deliveryDueAt < now;

  return (
    <div className="container page narrow">
      <Link href="/creator" className="small strong">
        ← Jobs
      </Link>
      <div className="row between">
        <div className="stack" style={{ gap: 2 }}>
          <h1 style={{ fontSize: 28 }}>
            {b.packageName} · {when(b.scheduledAt)}
          </h1>
          <span className="small muted">
            {b.code} · you earn {inr(b.creatorPayout)}
            {b.latePenaltyPct ? ` − ${b.latePenaltyPct}% late` : ""}
          </span>
        </div>
        <StatusBadge status={b.status} label={b.statusLabel} />
      </div>

      <section className="card card-violet stack">
        <b>Brief</b>
        <p>{b.brief}</p>
        <span className="small" style={{ color: "var(--ink-2)" }}>
          {b.aspect}
          {b.referenceUrl && (
            <>
              {" "}· <a href={b.referenceUrl} target="_blank" rel="noreferrer">reference</a>
            </>
          )}
        </span>
      </section>

      {["refunded", "cancelled"].includes(b.status) ? (
        <div className="card">This booking was {b.status}.</div>
      ) : (
        <>
          <Step n={1} title="Travel to the client" state={st(0) === "now" ? "now" : "done"}>
            <p className="small">
              <b>{b.address}</b>
              <br />
              {b.area} · client: {b.clientName} {b.clientPhone && `· ${b.clientPhone}`}
            </p>
            <a className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start" }} href={`https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}`} target="_blank" rel="noreferrer">
              Open in Maps
            </a>
          </Step>

          <Step n={2} title="Check in at the location" state={st(0)}>
            {b.status === "assigned" && (
              <>
                <p className="small muted">Ask the client for the 4-digit start code in their app. It only works within 200 m of the address.</p>
                <label htmlFor="otp" className="label">
                  Client’s start code
                </label>
                <input id="otp" className="input otp-input" inputMode="numeric" maxLength={4} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} />
                <div className="row">
                  <button className="btn btn-accent" disabled={act.busy || otp.length !== 4} onClick={checkInWithGps}>
                    Check in with my GPS
                  </button>
                  <button className="btn btn-ghost btn-sm" disabled={act.busy || otp.length !== 4} onClick={() => post({ action: "checkin", otp, lat: b.lat, lng: b.lng })} title="Demo only — sends the booking’s own location">
                    Demo: I’m at the address
                  </button>
                </div>
              </>
            )}
            {b.checkInAt && <span className="small muted">Checked in at {time(b.checkInAt)}</span>}
          </Step>

          <Step n={3} title={`Shoot · up to ${b.packageHours} hours`} state={st(1)}>
            {b.status === "shooting" && (
              <>
                <p className="small muted">Started {time(b.checkInAt)} · {duration(now - (b.checkInAt ?? now))} so far</p>
                <button className="btn btn-primary" style={{ alignSelf: "flex-start" }} disabled={act.busy} onClick={() => post({ action: "finish" })}>
                  Finish shoot
                </button>
              </>
            )}
            {b.shootEndAt && <span className="small muted">Finished at {time(b.shootEndAt)}</span>}
          </Step>

          <Step n={4} title="Edit & deliver" state={st(2)}>
            <span className={`badge ${late ? "badge-red" : "badge-orange"}`} style={{ alignSelf: "flex-start" }}>
              Due {when(b.deliveryDueAt)}
              {!b.deliveredAt && (late ? " · late" : ` · ${duration(b.deliveryDueAt - now)} left`)}
            </span>
            {(b.status === "editing" || b.status === "revision_requested") && (
              <>
                {b.status === "revision_requested" && <p className="small strong">Client asked for changes: “{b.revisionNote}”</p>}
                <div className="field">
                  <label htmlFor="url">Link to the final video</label>
                  <input id="url" className="input" type="url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="Google Drive, YouTube unlisted, Dropbox…" />
                  <span className="hint">Direct upload to Srijan storage comes later. Late delivery cuts your payout 10% per 6 hours.</span>
                </div>
                <button className="btn btn-accent" style={{ alignSelf: "flex-start" }} disabled={act.busy} onClick={() => post({ action: "deliver", videoUrl })}>
                  Deliver to client
                </button>
              </>
            )}
            {b.deliveredAt && (
              <span className="small muted">
                Delivered {when(b.deliveredAt)} · <a href={b.videoUrl} target="_blank" rel="noreferrer">video</a>
              </span>
            )}
          </Step>

          <Step n={5} title="Client approves · you get paid" state={st(3)}>
            {b.status === "delivered" && b.autoApproveAt && <p className="small muted">Waiting for the client. Auto-approves {when(b.autoApproveAt)}.</p>}
            {b.status === "completed" && (
              <p className="small">
                {inr(Math.round(b.creatorPayout * (1 - b.latePenaltyPct / 100)))} added to your <Link href="/creator/wallet">wallet</Link>
                {b.rating ? <> · <Stars rating={b.rating} /></> : null}
              </p>
            )}
          </Step>
        </>
      )}
      <ErrorNote error={act.error} />
    </div>
  );
}

export default function CreatorJobPage() {
  return (
    <Guard role="creator">
      <Job />
    </Guard>
  );
}
