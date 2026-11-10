"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { call, useAction, useData, useTick } from "@/lib/client/api";
import { openCheckout, type CheckoutDetails } from "@/lib/client/razorpay";
import type { BookingView } from "@/lib/domain/views";
import { Avatar, ErrorNote, Guard, Loading, Stars, StatusBadge } from "@/components/ui";
import { JobDetails } from "@/components/JobDetails";
import { countdown, inr, time, when } from "@/lib/client/format";
import { useSession } from "@/components/Session";
import { ReviewBody, ReviewSection } from "@/components/Review";
import { REVIEW_EVENT } from "@/components/ReviewGate";

const ORDER = ["searching", "awaiting_payment", "assigned", "delivered", "completed"];

function Progress({ status }: { status: string }) {
  const s = status === "needs_ops" ? "searching" : status === "disputed" ? "delivered" : status;
  const idx = ORDER.indexOf(s);
  return (
    <div className="steps" style={{ gridTemplateColumns: `repeat(${ORDER.length}, minmax(0,1fr))` }} aria-hidden="true">
      {ORDER.map((k, i) => (
        <span key={k} className={i < idx ? "done" : i === idx ? (s === "completed" ? "done" : "now") : ""} />
      ))}
    </div>
  );
}

/** What became of a job offer sent to one creator, as the client sees it. */
const OFFER_OUTCOME: Record<NonNullable<NonNullable<BookingView["requestedCreator"]>["outcome"]>, string> = {
  waiting: "waiting for them to accept",
  taken: "they accepted",
  declined: "they couldn’t take it, so everyone nearby was alerted",
  missed: "they didn’t accept in time, so everyone nearby was alerted",
  offline: "they weren’t available, so everyone nearby was alerted",
  other_creator: "another creator took the job",
  cancelled: "this booking was cancelled",
};

const REFUND_TEXT = {
  pending: "The Srijan team will contact you and send your refund.",
  sent: "Your refund has been sent. Please contact us if it hasn’t reached you in a few working days.",
};

function Tracking() {
  const { id } = useParams<{ id: string }>();
  const { session } = useSession();
  const { data: b, error, reload, setData } = useData<BookingView>(`/api/bookings/${id}`, 3000);
  const act = useAction();
  const now = useTick();
  const [note, setNote] = useState("");
  const [reporting, setReporting] = useState(false);
  // True from the moment Razorpay says it took the money until our own records agree.
  const [confirming, setConfirming] = useState(false);
  const isClient = session?.user?.role === "client";

  if (error) return <div className="container page"><p className="error">{error.message}</p></div>;
  if (!b) return <Loading />;

  async function post(body: Record<string, unknown>) {
    const r = await act.run(() => call<BookingView>(`/api/bookings/${b!.id}`, body));
    if (r) setData(r);
    else void reload();
    // Approving leaves a review owing: bring the pop-up up now rather than at the next poll.
    if (r && body.action === "approve") window.dispatchEvent(new Event(REVIEW_EVENT));
  }

  /** Pay for the job the creator has accepted. Razorpay's own form takes the card or UPI details. */
  async function pay() {
    const id = b!.id;
    await act.run(async () => {
      const { checkout } = await call<{ checkout: CheckoutDetails }>("/api/payments/order", { bookingId: id });
      const result = await openCheckout(checkout);
      if (!result) return; // closed the form without paying: they can press Pay again
      setConfirming(true);
      // If this call is lost, Razorpay's webhook still confirms it, and this page is polling.
      await call("/api/payments/verify", { bookingId: id, ...result }).catch(() => undefined);
      await reload();
      setConfirming(false);
    });
  }

  return (
    <div className="container page narrow">
      <Link href={isClient ? "/bookings" : "/ops"} className="small strong">
        ← Back
      </Link>
      <div className="row between">
        <div className="stack" style={{ gap: 2 }}>
          <h1 style={{ fontSize: 28 }}>{b.packageName}</h1>
          <span className="small muted">
            {b.code} · {b.area} · {inr(b.total)}
            {b.paid ? " paid" : " to pay"}
          </span>
        </div>
        <StatusBadge status={b.status} label={b.statusLabel} />
      </div>
      <Progress status={b.status} />

      {b.status === "awaiting_payment" && (
        <section className="card card-selected stack">
          <div className="row between">
            <div className="stack" style={{ gap: 4 }}>
              <h2>{b.creator ? `${b.creator.name} accepted — pay to confirm` : "Pay to confirm your job"}</h2>
              <span className="small">
                {b.creator ? b.creator.name.split(" ")[0] : "Your creator"} is holding this slot for you. Pay {inr(b.total)} and you’ll each get the other’s phone number
                {b.online ? "" : " and the exact address"} straight away.
              </span>
            </div>
            {b.paymentDueAt && (
              <span className="ring" style={{ background: "#fff", border: "5px solid var(--violet)" }} aria-label="Time left to pay">
                {countdown(b.paymentDueAt - now)}
              </span>
            )}
          </div>
          {isClient && (
            <>
              <button className="btn btn-accent btn-lg" disabled={act.busy || confirming} onClick={() => void pay()}>
                {confirming ? "Confirming your payment…" : act.busy ? "Opening payment…" : `Pay ${inr(b.total)}`}
              </button>
              <button className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start" }} disabled={act.busy || confirming} onClick={() => confirm("Cancel this job? The creator will be released.") && void post({ action: "cancel" })}>
                Cancel this job
              </button>
            </>
          )}
          <p className="tiny muted">
            {b.paymentDueAt ? `If the payment hasn’t arrived by ${time(b.paymentDueAt)}, the job is dropped and the creator released. ` : ""}
            You haven’t been charged anything yet.
          </p>
        </section>
      )}

      {b.requestedCreator && (
        <section className="card card-violet row between">
          <span className="small">
            Job offer sent to{" "}
            <Link href={`/creators/${b.requestedCreator.id}`} className="strong">
              {b.requestedCreator.name}
            </Link>
            {b.requestedCreator.outcome ? ` · ${OFFER_OUTCOME[b.requestedCreator.outcome]}` : ""}
          </span>
        </section>
      )}

      {b.status === "searching" && (
        <section className="card card-orange stack">
          <div className="row between">
            <div className="stack" style={{ gap: 4 }}>
              <h2>{b.dispatch.phase === "direct" ? `Waiting for ${b.requestedCreator?.name.split(" ")[0] ?? "your chosen creator"}` : "Finding your creator"}</h2>
              <span className="small" style={{ color: "var(--orange-ink)" }}>
                {b.dispatch.phase === "direct"
                  ? "They have 5 minutes to accept. If they don’t, everyone available is alerted."
                  : b.online
                    ? `${b.dispatch.notified} creator${b.dispatch.notified === 1 ? "" : "s"} alerted. The first to accept gets the job.`
                    : `${b.dispatch.notified} creator${b.dispatch.notified === 1 ? "" : "s"} alerted within ${b.dispatch.radiusKm} km${b.dispatch.widened ? " (search widened)" : " · widens at minute 3"}`}
              </span>
            </div>
            <span className="ring" style={{ background: "#fff", border: "5px solid var(--orange)" }} aria-label="Time left">
              {countdown(b.dispatch.roundEndsAt - now)}
            </span>
          </div>
          <p className="tiny" style={{ color: "var(--orange-ink)" }}>Nothing to pay yet — you’re asked for {inr(b.total)} as soon as a creator accepts.</p>
          {isClient && (
            <button className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start" }} disabled={act.busy} onClick={() => post({ action: "cancel" })}>
              Cancel · nothing to pay
            </button>
          )}
        </section>
      )}

      {b.status === "needs_ops" && (
        <section className="card card-orange stack">
          <h2>Our team is finding you a creator</h2>
          <p className="small">No one accepted in the first 5 minutes, so a Srijan team member is calling creators now. Your job is still showing to every creator nearby too, so one of them may take it first. You’re asked to pay {inr(b.total)} only once someone accepts, and nothing is owed if we can’t fill it.</p>
          {isClient && (
            <button className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start" }} disabled={act.busy} onClick={() => post({ action: "cancel" })}>
              Cancel · nothing to pay
            </button>
          )}
        </section>
      )}

      {b.refund && (
        <section className="card card-orange stack">
          <h2>Refund of {inr(b.refund.amount)}</h2>
          <p className="small">{REFUND_TEXT[b.refund.status]}</p>
        </section>
      )}

      {b.creator && b.paid && (
        <section className="card stack">
          <h2>Contact</h2>
          <div className="row">
            <Avatar name={b.creator.name} />
            <div className="grow stack" style={{ gap: 2 }}>
              <b>{b.creator.name}</b>
              <Stars rating={b.creator.rating} count={b.creator.ratingCount} />
            </div>
            {b.creatorPhone && (
              <a className="btn btn-sm btn-primary" href={`tel:${b.creatorPhone.replace(/\s/g, "")}`}>
                Call {b.creatorPhone}
              </a>
            )}
          </div>
          {b.clientPhone && (
            <span className="small muted">
              {isClient ? "Your number" : `${b.clientName}’s number`}, shared with the creator: <b>{b.clientPhone}</b>
              {b.online ? ". They’ll call you about this online job." : ""}
            </span>
          )}
        </section>
      )}

      {b.status === "delivered" && isClient && (
        <section className="card card-selected stack">
          <h2>The creator has finished this job</h2>
          <p className="small">Approve it once you’re happy. The creator then gets paid.</p>
          <button className="btn btn-green btn-lg" disabled={act.busy} onClick={() => confirm("Approve this job? The creator will be paid.") && void post({ action: "approve" })}>
            Mark As Approved
          </button>
          {reporting ? (
            <div className="stack">
              <div className="field">
                <label htmlFor="note">What went wrong?</label>
                <textarea id="note" className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tell the Srijan team what happened" />
              </div>
              <button className="btn" style={{ alignSelf: "flex-start" }} disabled={act.busy} onClick={() => post({ action: "report", note })}>
                Send to the Srijan team
              </button>
            </div>
          ) : (
            <button className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start" }} onClick={() => setReporting(true)}>
              Report a problem
            </button>
          )}
          {b.autoApproveAt && <p className="tiny muted">Approves automatically on {when(b.autoApproveAt)} if you don’t respond.</p>}
        </section>
      )}

      {b.status === "delivered" && !isClient && (
        <section className="card stack">
          <h2>Waiting for the client</h2>
          {b.autoApproveAt && <p className="small muted">Approves automatically on {when(b.autoApproveAt)}.</p>}
        </section>
      )}

      {b.status === "disputed" && (
        <section className="card card-orange stack">
          <h2>Problem reported</h2>
          {b.report && <p className="small">“{b.report.note}”</p>}
          <p className="small">The creator’s payment is on hold while the Srijan team looks into it.</p>
        </section>
      )}

      {b.status === "completed" && (
        <section className="card stack">
          <h2>Done{b.autoApproved ? " · auto-approved" : ""}</h2>
          <p className="small muted">Thank you for using Srijan.</p>
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

      <JobDetails b={b} money={{ label: b.paid ? "Paid" : "To pay", value: inr(b.total) }} />

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
