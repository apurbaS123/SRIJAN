"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { call, useAction, useData, useTick } from "@/lib/client/api";
import type { BookingView } from "@/lib/domain/views";
import { Avatar, ErrorNote, Guard, Loading, Stars, StatusBadge } from "@/components/ui";
import { countdown, duration, inr, time, when } from "@/lib/client/format";
import { useSession } from "@/components/Session";
import { ReviewBody, ReviewSection } from "@/components/Review";

const ORDER = ["searching", "assigned", "shooting", "editing", "delivered", "completed"];

function Progress({ status }: { status: string }) {
  const s = status === "needs_ops" ? "searching" : status === "revision_requested" ? "editing" : status;
  const idx = ORDER.indexOf(s);
  return (
    <div className="steps" style={{ gridTemplateColumns: `repeat(${ORDER.length}, minmax(0,1fr))` }} aria-hidden="true">
      {ORDER.map((k, i) => (
        <span key={k} className={i < idx ? "done" : i === idx ? (s === "completed" ? "done" : "now") : ""} />
      ))}
    </div>
  );
}

function Tracking() {
  const { id } = useParams<{ id: string }>();
  const { session } = useSession();
  const { data: b, error, reload, setData } = useData<BookingView>(`/api/bookings/${id}`, 3000);
  const act = useAction();
  const now = useTick();
  const [note, setNote] = useState("");
  const isClient = session?.user?.role === "client";

  if (error) return <div className="container page"><p className="error">{error.message}</p></div>;
  if (!b) return <Loading />;

  async function post(body: Record<string, unknown>) {
    const r = await act.run(() => call<BookingView>(`/api/bookings/${b!.id}`, body));
    if (r) setData(r);
    else void reload();
  }

  return (
    <div className="container page narrow">
      <Link href={isClient ? "/bookings" : "/ops"} className="small strong">
        ← Back
      </Link>
      <div className="row between">
        <div className="stack" style={{ gap: 2 }}>
          <h1 style={{ fontSize: 28 }}>
            {b.packageName} · {when(b.scheduledAt)}
          </h1>
          <span className="small muted">
            {b.code} · {b.area} · {inr(b.total)} paid
          </span>
        </div>
        <StatusBadge status={b.status} label={b.statusLabel} />
      </div>
      <Progress status={b.status} />

      {b.status === "searching" && (
        <section className="card card-orange stack">
          <div className="row between">
            <div className="stack" style={{ gap: 4 }}>
              <h2>{b.dispatch.phase === "direct" ? "Waiting for your chosen creator" : "Finding your creator"}</h2>
              <span className="small" style={{ color: "var(--orange-ink)" }}>
                {b.dispatch.phase === "direct"
                  ? "They have 5 minutes to accept. If they don’t, everyone available nearby is alerted."
                  : `${b.dispatch.notified} creator${b.dispatch.notified === 1 ? "" : "s"} alerted within ${b.dispatch.radiusKm} km${b.dispatch.widened ? " (search widened)" : " · widens at minute 3"}`}
              </span>
            </div>
            <span className="ring" style={{ background: "#fff", border: "5px solid var(--orange)" }} aria-label="Time left">
              {countdown(b.dispatch.roundEndsAt - now)}
            </span>
          </div>
          {isClient && (
            <button className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start" }} disabled={act.busy} onClick={() => post({ action: "cancel" })}>
              Cancel · full refund
            </button>
          )}
        </section>
      )}

      {b.status === "needs_ops" && (
        <section className="card card-orange stack">
          <h2>Our team is finding you a creator</h2>
          <p className="small">
            No one accepted in the first 5 minutes. A Srijan team member is calling creators now. If we can’t fill it, you get a full refund automatically.
          </p>
          {isClient && (
            <button className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start" }} disabled={act.busy} onClick={() => post({ action: "cancel" })}>
              Cancel · full refund
            </button>
          )}
        </section>
      )}

      {b.creator && (
        <section className="card row">
          <Avatar name={b.creator.name} />
          <div className="grow stack" style={{ gap: 2 }}>
            <b>{b.creator.name}</b>
            <Stars rating={b.creator.rating} count={b.creator.ratingCount} />
            <span className="tiny muted">{b.creator.gear.join(" · ")}</span>
          </div>
          <a className="btn btn-sm btn-ghost" href="#" onClick={(e) => e.preventDefault()} title="Masked calling comes with the telephony integration">
            Call
          </a>
        </section>
      )}

      {b.status === "assigned" && b.otp && (
        <section className="card card-orange stack">
          <b>Start code — share only when the creator arrives</b>
          <div className="huge-num" style={{ letterSpacing: "0.3em" }}>{b.otp}</div>
          <span className="small" style={{ color: "var(--orange-ink)" }}>
            The shoot timer starts when they enter this code at your address.
          </span>
        </section>
      )}

      {(b.status === "shooting" || b.status === "editing" || b.status === "revision_requested") && (
        <section className="card stack">
          <h2>{b.status === "shooting" ? "Shoot in progress" : b.status === "editing" ? "Your video is being edited" : "Revision in progress"}</h2>
          <p className="small muted">
            Guaranteed delivery by <b>{when(b.deliveryDueAt)}</b>
            {b.deliveryDueAt > now ? ` (in ${duration(b.deliveryDueAt - now)})` : " — it’s late; the creator’s payout drops 10% per 6 hours and you get the difference back"}.
          </p>
          {b.revisionNote && b.status === "revision_requested" && <p className="small">Your note: “{b.revisionNote}”</p>}
        </section>
      )}

      {b.status === "delivered" && (
        <section className="card stack">
          <h2>Your video is ready</h2>
          <a href={b.videoUrl} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ alignSelf: "flex-start" }}>
            Open video
          </a>
          {b.latePenaltyPct > 0 && <p className="small">Delivered late — you’ll get {inr(Math.round(b.creatorPayout * b.latePenaltyPct / 100))} back when you approve.</p>}
          {isClient && (
            <>
              <hr className="divider" />
              <button className="btn btn-green btn-lg" disabled={act.busy} onClick={() => post({ action: "approve" })}>
                Approve & release payment
              </button>
              {b.revisionsLeft > 0 && (
                <div className="stack">
                  <div className="field">
                    <label htmlFor="note">Or ask for changes ({b.revisionsLeft} free revision left)</label>
                    <input id="note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Use a brighter colour grade and shorten the intro" />
                  </div>
                  <button className="btn" style={{ alignSelf: "flex-start" }} disabled={act.busy} onClick={() => post({ action: "revision", note })}>
                    Request changes
                  </button>
                </div>
              )}
              {b.autoApproveAt && <p className="tiny muted">Approves automatically on {when(b.autoApproveAt)} if you don’t respond.</p>}
            </>
          )}
        </section>
      )}

      {b.status === "completed" && (
        <section className="card stack">
          <h2>Done{b.autoApproved ? " · auto-approved" : ""}</h2>
          {b.videoUrl && (
            <a href={b.videoUrl} target="_blank" rel="noreferrer">
              Open video
            </a>
          )}
          {b.latePenaltyPct > 0 && <p className="small">Late-delivery credit of {inr(Math.round(b.creatorPayout * b.latePenaltyPct / 100))} refunded to you.</p>}
        </section>
      )}

      {b.status === "completed" && b.creator && isClient && (
        <ReviewSection
          name={b.creator.name.split(" ")[0]!}
          mine={b.rating ? { rating: b.rating, text: b.review, at: b.reviewedAt } : null}
          theirs={b.rating ? b.reviewOfClient : null}
          busy={act.busy}
          onSubmit={(rating, text) => void post({ action: "review", rating, text })}
        />
      )}

      {b.status === "completed" && !isClient && (b.rating || b.reviewOfClient) && (
        <section className="card stack">
          <h2>Reviews</h2>
          {b.rating && (
            <>
              <span className="label">Client on {b.creator?.name ?? "the creator"}</span>
              <ReviewBody r={{ rating: b.rating, text: b.review, at: b.reviewedAt }} />
            </>
          )}
          {b.reviewOfClient && (
            <>
              <span className="label">Creator on {b.clientName}</span>
              <ReviewBody r={b.reviewOfClient} />
            </>
          )}
        </section>
      )}

      <ErrorNote error={act.error} />

      <section className="card stack">
        <h2>Brief</h2>
        <p>{b.brief}</p>
        <p className="small muted">
          {b.aspect} · {b.address}
        </p>
      </section>

      <section className="card stack">
        <h2>Activity</h2>
        <ol className="timeline">
          {b.events.map((e, i) => (
            <li key={i}>
              <span className={`dot${i === b.events.length - 1 && !["completed", "refunded", "cancelled"].includes(b.status) ? " now" : ""}`} />
              <span className="stack" style={{ gap: 0 }}>
                <span className="small strong">{e.text}</span>
                <span className="tiny muted">{time(e.at)}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export default function BookingPage() {
  return (
    <Guard role={["client", "ops"]}>
      <Tracking />
    </Guard>
  );
}
