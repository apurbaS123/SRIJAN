"use client";
import { useState } from "react";
import Link from "next/link";
import { call, useAction, useData, useTick } from "@/lib/client/api";
import type { BookingView, CreatorPublic } from "@/lib/domain/views";
import type { PayoutDue } from "@/lib/domain/payouts";
import type { RefundDue } from "@/lib/domain/bookings";
import { Guard, StatusBadge } from "@/components/ui";
import { countdown, inr, lakh, time, when } from "@/lib/client/format";

interface Overview {
  kpis: { shootsToday: number; liveNow: number; searching: number; needsOps: number; pipelineValue: number; revenueMonth: number; pendingVerification: number };
  money: { month: string; shootGmv: number; platformFee: number; campaignBilled: number; campaignCommission: number; refunds: number };
  payoutsDue: PayoutDue[];
  refundsDue: RefundDue[];
  dispatch: (BookingView & { candidates: { id: string; name: string; available: boolean; km: number }[] })[];
  pendingCreators: CreatorPublic[];
}

function Row({ b, onChange }: { b: Overview["dispatch"][number]; onChange: () => void }) {
  const act = useAction();
  const now = useTick();
  const [pick, setPick] = useState("");
  const timer =
    b.status === "searching"
      ? `${countdown(b.dispatch.roundEndsAt - now)} left · ${b.dispatch.notified} alerted${b.dispatch.widened ? " · 25 km" : ""}`
      : b.status === "needs_ops"
        ? `${b.dispatch.notified} alerted · nobody accepted`
        : b.status === "delivered"
          ? `Auto-approves ${when(b.autoApproveAt)}`
          : b.status === "disputed"
            ? `Client: “${b.report?.note ?? ""}”`
            : `${b.online ? "Finish by" : "Job"} ${when(b.scheduledAt)}`;

  async function post(body: Record<string, unknown>) {
    const ok = await act.run(() => call(`/api/bookings/${b.id}`, body));
    if (ok) onChange();
  }

  return (
    <tr className={b.status === "needs_ops" ? "alert" : undefined}>
      <td>
        <Link href={`/bookings/${b.id}`} className="strong">
          {b.code}
        </Link>
        <div className="tiny muted">{b.packageName}</div>
      </td>
      <td>
        {b.area}
        <div className="tiny muted">{when(b.scheduledAt)}</div>
      </td>
      <td>{b.creator?.name ?? <span className="muted">—</span>}</td>
      <td>
        <StatusBadge status={b.status} label={b.statusLabel} />
      </td>
      <td className="small">{timer}</td>
      <td>
        {(b.status === "searching" || b.status === "needs_ops") && (
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <label className="sr-only" htmlFor={`pick-${b.id}`}>
              Creator
            </label>
            <select id={`pick-${b.id}`} className="select" style={{ minHeight: 36, minWidth: 170 }} value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Pick creator…</option>
              {b.candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.km} km{c.available ? "" : " · offline"}
                </option>
              ))}
            </select>
            <button className="btn btn-sm btn-primary" disabled={!pick || act.busy} onClick={() => post({ action: "assign", creatorId: pick })}>
              Assign
            </button>
          </div>
        )}
        {b.status === "disputed" && (
          <button className="btn btn-sm btn-primary" style={{ marginTop: 6, marginRight: 6 }} disabled={act.busy} onClick={() => confirm(`Approve ${b.code} so the creator gets paid ${inr(b.creatorPayout)}?`) && post({ action: "release" })}>
            Pay creator
          </button>
        )}
        {!["completed", "refunded", "cancelled"].includes(b.status) && (
          <button className="btn btn-sm btn-ghost" style={{ marginTop: 6 }} disabled={act.busy} onClick={() => confirm(`Stop ${b.code} and refund ${inr(b.total)}? You’ll then send the money from the Razorpay dashboard.`) && post({ action: "refund", reason: "refunded by Srijan team" })}>
            Refund
          </button>
        )}
        {act.error && <div className="tiny" style={{ color: "var(--red)" }}>{act.error}</div>}
      </td>
    </tr>
  );
}

function PayoutRow({ p, onChange }: { p: PayoutDue; onChange: () => void }) {
  const act = useAction();
  const [reference, setReference] = useState("");

  async function markPaid() {
    if (!confirm(`Have you sent ${inr(p.amount)} to ${p.creatorName}?`)) return;
    const ok = await act.run(() => call("/api/admin", { action: "mark_paid", payoutId: p.id, reference }));
    if (ok) onChange();
  }

  return (
    <article className="card card-tight stack" style={{ background: "var(--bg)" }}>
      <div className="row between">
        <b>
          {inr(p.amount)} → {p.creatorName}
        </b>
        <span className="small muted">
          {p.note} · {when(p.at)}
        </span>
      </div>
      <div className="small">
        {p.method === "upi" && (
          <>
            UPI: <b>{p.upiId}</b>
          </>
        )}
        {p.method === "bank" && (
          <>
            {p.bank!.accountName} · A/C <b>{p.bank!.accountNumber}</b> · IFSC <b>{p.bank!.ifsc}</b>
          </>
        )}
        {!p.method && <span style={{ color: "var(--red)" }}>No bank or UPI linked yet. Contact them{p.creatorPhone ? ` on ${p.creatorPhone}` : ""}.</span>}
      </div>
      <div className="row">
        <label className="sr-only" htmlFor={`ref-${p.id}`}>
          Payment reference
        </label>
        <input id={`ref-${p.id}`} className="input grow" style={{ minHeight: 36 }} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR or UPI reference (optional)" />
        <button className="btn btn-sm btn-primary" disabled={act.busy} onClick={markPaid}>
          Mark as paid
        </button>
      </div>
      {act.error && <div className="tiny" style={{ color: "var(--red)" }}>{act.error}</div>}
    </article>
  );
}

function RefundRow({ r, onChange }: { r: RefundDue; onChange: () => void }) {
  const act = useAction();
  const [reference, setReference] = useState("");

  async function markSent() {
    if (!confirm(`Have you sent ${inr(r.amount)} back to the client for ${r.code}?`)) return;
    const ok = await act.run(() => call("/api/admin", { action: "mark_refund_sent", bookingId: r.id, reference }));
    if (ok) onChange();
  }

  return (
    <article className="card card-tight stack" style={{ background: "var(--bg)" }}>
      <div className="row between">
        <b>
          {inr(r.amount)} ·{" "}
          <Link href={`/bookings/${r.id}`} className="strong">
            {r.code}
          </Link>
        </b>
        <span className="small muted">
          {r.reason} · {when(r.at)}
        </span>
      </div>
      <div className="small">
        Client: <b>{r.clientName}</b> · {r.clientPhone ?? "no phone"} · {r.clientEmail ?? "no email"}
      </div>
      <div className="small muted">Razorpay payment: {r.paymentId}</div>
      <div className="row">
        <label className="sr-only" htmlFor={`refund-ref-${r.id}`}>
          Refund reference
        </label>
        <input id={`refund-ref-${r.id}`} className="input grow" style={{ minHeight: 36 }} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UPI or bank reference (optional)" />
        <button className="btn btn-sm btn-primary" disabled={act.busy} onClick={markSent}>
          Mark as sent
        </button>
      </div>
      {act.error && <div className="tiny" style={{ color: "var(--red)" }}>{act.error}</div>}
    </article>
  );
}

function Dashboard() {
  const { data, reload } = useData<Overview>("/api/admin", 3000);
  const now = useTick(30000);
  if (!data) return null;
  const k = data.kpis;
  const m = data.money;

  return (
    <div className="container page" style={{ maxWidth: 1280 }}>
      <div className="row between">
        <div className="stack" style={{ gap: 2 }}>
          <span className="small muted">{when(now)} IST</span>
          <h1>Dispatch</h1>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(170px,100%),1fr))" }}>
        <div className="card stack" style={{ gap: 4 }}>
          <span className="small muted strong">Shoots today</span>
          <span className="big-num">{k.shootsToday}</span>
        </div>
        <div className="card stack" style={{ gap: 4 }}>
          <span className="small muted strong">Live right now</span>
          <span className="big-num">{k.liveNow}</span>
        </div>
        <div className={`card stack${k.needsOps ? " card-orange" : ""}`} style={{ gap: 4 }}>
          <span className="small strong" style={{ color: k.needsOps ? "var(--orange-ink)" : "var(--muted)" }}>Needs a creator</span>
          <span className="big-num">{k.needsOps}</span>
          {k.searching > 0 && <span className="tiny muted">{k.searching} still searching</span>}
        </div>
        <div className="card stack" style={{ gap: 4 }}>
          <span className="small muted strong">Campaign pipeline</span>
          <span className="big-num">{lakh(k.pipelineValue)}</span>
        </div>
        <div className="card stack" style={{ gap: 4 }}>
          <span className="small muted strong">Srijan revenue · {m.month}</span>
          <span className="big-num">{lakh(k.revenueMonth)}</span>
        </div>
      </div>

      <section className="card stack">
        <div className="row between">
          <h2>Live jobs</h2>
          <span className="small muted">Alert everyone in the field within 10 km (online jobs: everywhere) · 5 min to accept · widen to 25 km at minute 3 · then ops</span>
        </div>
        <div className="table-wrap">
          <table style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th>Booking</th>
                <th>Where / when</th>
                <th>Creator</th>
                <th>Status</th>
                <th>Timer</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.dispatch.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    Nothing live right now.
                  </td>
                </tr>
              )}
              {data.dispatch.map((b) => (
                <Row key={b.id} b={b} onChange={reload} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card stack">
        <div className="row between">
          <h2>Creators to pay ({data.payoutsDue.length})</h2>
          <span className="small muted">Send the money from your bank or UPI app, then mark it as paid</span>
        </div>
        {data.payoutsDue.length === 0 && <p className="small muted">Nobody is waiting to be paid.</p>}
        {data.payoutsDue.map((p) => (
          <PayoutRow key={p.id} p={p} onChange={reload} />
        ))}
      </section>

      <section className={`card stack${data.refundsDue.length ? " card-orange" : ""}`}>
        <div className="row between">
          <h2>Refunds to send ({data.refundsDue.length})</h2>
          <span className="small muted">Send the client the amount shown, then mark it as sent. A payment can cover several services, so send only this amount</span>
        </div>
        {data.refundsDue.length === 0 && <p className="small muted">No refunds waiting.</p>}
        {data.refundsDue.map((r) => (
          <RefundRow key={r.id} r={r} onChange={reload} />
        ))}
      </section>

      <div className="grid-2">
        <section className="card stack">
          <h2>Money · {m.month}</h2>
          <div className="row between">
            <span>Jobs billed · Srijan 20%</span>
            <span>
              {inr(m.shootGmv)} → <b>{inr(m.platformFee)}</b>
            </span>
          </div>
          <div className="row between">
            <span>Campaigns billed · Srijan share</span>
            <span>
              {inr(m.campaignBilled)} → <b>{inr(m.campaignCommission)}</b>
            </span>
          </div>
          <div className="row between muted small">
            <span>Refunds</span>
            <span>{inr(m.refunds)}</span>
          </div>
          <hr className="divider" />
          <div className="row between strong">
            <span>Srijan revenue</span>
            <span style={{ color: "var(--violet-ink)" }}>{inr(m.platformFee + m.campaignCommission)}</span>
          </div>
        </section>
        <section className="card stack">
          <div className="row between">
            <h2>Waiting for verification</h2>
            <Link href="/ops/creators" className="small strong">
              All creators
            </Link>
          </div>
          {data.pendingCreators.length === 0 && <p className="small muted">All caught up.</p>}
          {data.pendingCreators.map((c) => (
            <div key={c.id} className="row between">
              <span className="small">
                <b>{c.name}</b> · {c.services.map((s) => s.title).join(", ")}
              </span>
              <Link href="/ops/creators" className="btn btn-sm">
                Review
              </Link>
            </div>
          ))}
          <p className="tiny muted">Last refresh {time(now)}</p>
        </section>
      </div>
    </div>
  );
}

export default function OpsPage() {
  return (
    <Guard role="ops">
      <Dashboard />
    </Guard>
  );
}
