"use client";
import Link from "next/link";
import { useData } from "@/lib/client/api";
import type { Wallet } from "@/lib/domain/wallet";
import { Guard, Loading } from "@/components/ui";
import { CREATOR_SHARE, PLATFORM_SHARE } from "@/lib/domain/config";
import { useSession } from "@/components/Session";
import { inr, when } from "@/lib/client/format";

function WalletView() {
  const { session } = useSession();
  const { data, loading } = useData<Wallet>("/api/me/wallet", 20000);
  const payout = session?.creator?.payout ?? null;
  if (loading && !data) return <Loading />;
  if (!data) return null;

  return (
    <div className="container page narrow">
      <h1>Wallet</h1>
      <p className="muted">Everything you’ve earned on Srijan. Each line appears once a client has approved your job.</p>

      <section className="card card-dark stack">
        <span className="small muted">Total earned</span>
        <div className="huge-num">{inr(data.totals.earned)}</div>
        <div className="row between" style={{ fontSize: 14 }}>
          <span className="muted">
            On the way <b style={{ color: "var(--orange)" }}>{inr(data.totals.onTheWay)}</b>
          </span>
          <span className="muted">
            Already sent <b>{inr(data.totals.sent)}</b>
          </span>
        </div>
      </section>

      <div className="card card-orange stack" style={{ gap: 4 }}>
        <b className="small">{data.payoutWindowText}</b>
        <span className="tiny muted">
          Srijan sends the money itself, to the bank account or UPI ID on your profile. There is nothing for you to withdraw
          here, and this wallet never holds your money.
        </span>
      </div>

      <section className="card stack">
        <div className="row between">
          <div className="stack" style={{ gap: 2 }}>
            <h2>Where it goes</h2>
            {payout ? (
              <span className="small muted">{payout.method === "upi" ? `UPI · ${payout.upiId}` : `${payout.accountName} · A/C ending ${payout.accountLast4} · ${payout.ifsc}`}</span>
            ) : (
              <span className="small muted">You haven’t added a payment receive method yet.</span>
            )}
          </div>
          <Link href="/creator/payout" className={`btn btn-sm ${payout ? "" : "btn-accent"}`}>
            {payout ? "Change" : "Add now"}
          </Link>
        </div>
        {!payout && data.totals.onTheWay > 0 && (
          <p className="small" style={{ color: "var(--orange-ink)" }}>
            {inr(data.totals.onTheWay)} is waiting for you. Add your bank account or UPI ID and Srijan sends it within{" "}
            {data.minHours}–{data.maxHours} hours.
          </p>
        )}
      </section>

      <section className="stack">
        <h2>Payments</h2>
        {data.lines.length === 0 && <p className="muted small">Nothing yet. Finish a job and your earnings show up here the moment the client approves it.</p>}
        {data.lines.map((l) => {
          const body = (
            <>
              <div className="stack" style={{ gap: 2 }}>
                <b>{l.title}</b>
                <span className="small muted">
                  {l.code} · approved {when(l.at)}
                </span>
                {l.status === "sent" ? (
                  <span className="tiny muted">
                    Sent {when(l.sentAt)}
                    {l.reference ? ` · ref ${l.reference}` : ""}
                  </span>
                ) : (
                  <span className="tiny muted">Reaches you by {when(l.expectedBy)}</span>
                )}
              </div>
              <div className="stack" style={{ gap: 4, alignItems: "flex-end" }}>
                <b>{inr(l.amount)}</b>
                {l.status === "sent" ? <span className="badge badge-green">Sent</span> : <span className="badge badge-orange">On the way</span>}
              </div>
            </>
          );
          return l.bookingId ? (
            <Link key={l.id} href={`/creator/jobs/${l.bookingId}`} className="card row between" style={{ textDecoration: "none", color: "inherit" }}>
              {body}
            </Link>
          ) : (
            <div key={l.id} className="card row between">
              {body}
            </div>
          );
        })}
      </section>

      <p className="tiny muted">
        Srijan keeps {Math.round(PLATFORM_SHARE * 100)}% of a job’s price; the {Math.round(CREATOR_SHARE * 100)}% you see here is yours. Something missing or wrong? <Link href="/support">Tell us</Link> and we’ll
        look into it.
      </p>
    </div>
  );
}

export default function WalletPage() {
  return (
    <Guard role="creator">
      <WalletView />
    </Guard>
  );
}
