"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { call, useAction, useData, useTick } from "@/lib/client/api";
import type { BookingView } from "@/lib/domain/views";
import { ErrorNote, Guard, Loading, Stars, StatusBadge } from "@/components/ui";
import { JobDetails } from "@/components/JobDetails";
import { countdown, inr, when } from "@/lib/client/format";
import { ReviewSection } from "@/components/Review";

function Job() {
  const { id } = useParams<{ id: string }>();
  const { data: b, error, setData, reload } = useData<BookingView>(`/api/bookings/${id}`, 4000);
  const act = useAction();
  const now = useTick(1000);

  if (error) return <div className="container page"><p className="error">{error.message}</p></div>;
  if (!b) return <Loading />;

  async function post(body: Record<string, unknown>) {
    const r = await act.run(() => call<BookingView>(`/api/bookings/${b!.id}`, body));
    if (r) setData(r);
    else void reload();
  }

  const tooEarly = !b.online && now < b.scheduledAt;

  return (
    <div className="container page narrow">
      <Link href="/creator" className="small strong">
        ← Jobs
      </Link>
      <div className="row between">
        <div className="stack" style={{ gap: 2 }}>
          <h1 style={{ fontSize: 28 }}>{b.packageName}</h1>
          <span className="small muted">{b.code} · you earn {inr(b.creatorPayout)}</span>
        </div>
        <StatusBadge status={b.status} label={b.statusLabel} />
      </div>

      {["refunded", "cancelled"].includes(b.status) ? (
        <div className="card">This booking was {b.status}.</div>
      ) : (
        <>
          {b.status === "awaiting_payment" && (
            <section className="card card-selected stack">
              <div className="row between">
                <div className="stack" style={{ gap: 4 }}>
                  <h2>Waiting for the client to pay</h2>
                  <span className="small">
                    This job is yours the moment their payment lands. You then get their name and phone number
                    {b.online ? "" : ", and the exact address"} right here, and we’ll alert you.
                  </span>
                </div>
                {b.paymentDueAt && (
                  <span className="ring" style={{ background: "#fff", border: "5px solid var(--violet)" }} aria-label="Time the client has left to pay">
                    {countdown(b.paymentDueAt - now)}
                  </span>
                )}
              </div>
              <p className="tiny muted">
                We’re holding this slot in your day until then. If the money doesn’t arrive, the job is dropped, your time is free again and you lose nothing.
              </p>
            </section>
          )}

          {b.paid && (
          <section className="card stack" style={{ gap: 6 }}>
            <h2>Client</h2>
            <b>{b.clientName}</b>
            {b.clientPhone && (
              <a className="btn btn-sm btn-primary" style={{ alignSelf: "flex-start" }} href={`tel:${b.clientPhone.replace(/\s/g, "")}`}>
                Call {b.clientPhone}
              </a>
            )}
            {b.online && <span className="small muted">This is an online job. Call the client to get their files and agree the details.</span>}
            {b.clientRating && <Stars rating={b.clientRating.rating} count={b.clientRating.count} />}
            {!b.online && (
              <a className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start" }} href={`https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}`} target="_blank" rel="noreferrer">
                Open in Maps
              </a>
            )}
          </section>
          )}

          <JobDetails b={b} money={{ label: "You earn", value: inr(b.creatorPayout) }} />

          {b.status === "assigned" && (
            <section className="card card-selected stack">
              <h2>Submit your proof of work</h2>
              <ol className="small stack" style={{ gap: 4, paddingLeft: 18 }}>
                <li>Open the Srijan Drive folder and upload your finished work. Name it {b.code}.</li>
                <li>Come back here and press Mark As Finished.</li>
              </ol>
              {b.proofUploadUrl ? (
                <a className="btn btn-accent" style={{ alignSelf: "flex-start" }} href={b.proofUploadUrl} target="_blank" rel="noreferrer">
                  Open Srijan Drive folder
                </a>
              ) : (
                <p className="small" style={{ color: "var(--red)" }}>The upload folder isn’t set up yet. Please contact the Srijan team.</p>
              )}
              <button
                className="btn btn-green btn-lg"
                disabled={act.busy || tooEarly}
                onClick={() => confirm("Have you uploaded your proof of work? The client will be asked to approve the job.") && void post({ action: "finish" })}
              >
                Mark As Finished
              </button>
              {tooEarly && <span className="tiny muted">You can press this from {when(b.scheduledAt)}, when the job starts.</span>}
            </section>
          )}

          {b.status === "delivered" && (
            <section className="card stack">
              <h2>Waiting for the client to approve</h2>
              {b.autoApproveAt && <p className="small muted">If the client doesn’t respond, this job is approved automatically on {when(b.autoApproveAt)}.</p>}
            </section>
          )}

          {b.status === "disputed" && (
            <section className="card card-orange stack">
              <h2>The client reported a problem</h2>
              {b.report && <p className="small">“{b.report.note}”</p>}
              <p className="small">The Srijan team will look into it and contact you. Your payment is on hold until then.</p>
            </section>
          )}

          {b.status === "completed" && (
            <section className="card stack">
              <h2>{b.payoutStatus === "paid" ? "Payment sent" : "Job approved"}</h2>
              <p className="small">
                {b.payoutStatus === "paid"
                  ? `Srijan has sent ${inr(b.creatorPayout)} to your bank or UPI.`
                  : b.payoutStatus === "owed"
                    ? `Srijan will send ${inr(b.creatorPayout)} to your bank or UPI.`
                    : "This job is complete."}
              </p>
            </section>
          )}

          {b.status === "completed" && (
            <ReviewSection
              name={b.clientName.split(" ")[0]!}
              mine={b.reviewOfClient}
              theirs={b.reviewOfClient && b.rating ? { rating: b.rating, text: b.review, at: b.reviewedAt } : null}
              busy={act.busy}
              onSubmit={(rating, text) => void post({ action: "review", rating, text })}
            />
          )}
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
