"use client";
import { useState } from "react";
import Link from "next/link";
import { call, useAction, useData, useTick } from "@/lib/client/api";
import type { BookingView, CreatorPublic } from "@/lib/domain/views";
import { ErrorNote, Guard, StatusBadge } from "@/components/ui";
import { countdown, inr, lakh, time, when } from "@/lib/client/format";

interface Overview {
  kpis: { shootsToday: number; liveNow: number; searching: number; needsOps: number; pipelineValue: number; revenueMonth: number; pendingVerification: number };
  money: { month: string; shootGmv: number; platformFee: number; campaignBilled: number; campaignCommission: number; gstCollected: number; refunds: number; queuedPayouts: { count: number; total: number } };
  clockOffsetMin: number;
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
          : b.status === "assigned"
            ? `Shoot ${when(b.scheduledAt)}`
            : `Due ${when(b.deliveryDueAt)}`;

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
        {!["completed", "refunded", "cancelled"].includes(b.status) && (
          <button className="btn btn-sm btn-ghost" style={{ marginTop: 6 }} disabled={act.busy} onClick={() => confirm(`Refund ${inr(b.total)} for ${b.code}?`) && post({ action: "refund", reason: "refunded by Srijan team" })}>
            Refund
          </button>
        )}
        {act.error && <div className="tiny" style={{ color: "var(--red)" }}>{act.error}</div>}
      </td>
    </tr>
  );
}

function Dashboard() {
  const { data, reload } = useData<Overview>("/api/admin", 3000);
  const act = useAction();
  const now = useTick(30000);
  if (!data) return null;
  const k = data.kpis;
  const m = data.money;

  async function admin(body: Record<string, unknown>) {
    const ok = await act.run(() => call("/api/admin", body));
    if (ok !== undefined) void reload();
  }

  return (
    <div className="container page" style={{ maxWidth: 1280 }}>
      <div className="row between">
        <div className="stack" style={{ gap: 2 }}>
          <span className="small muted">{when(now)} IST{data.clockOffsetMin ? ` · demo clock +${data.clockOffsetMin} min` : ""}</span>
          <h1>Dispatch</h1>
        </div>
        <div className="row">
          <span className="small muted">Demo time travel:</span>
          {[
            [1, "+1 min"],
            [5, "+5 min"],
            [60, "+1 h"],
            [60 * 24, "+1 day"],
            [60 * 48, "+2 days"],
          ].map(([min, label]) => (
            <button key={label} className="btn btn-sm btn-ghost" disabled={act.busy} onClick={() => admin({ action: "advance_clock", minutes: min })}>
              {label}
            </button>
          ))}
          <button className="btn btn-sm btn-danger" disabled={act.busy} onClick={() => confirm("Reset all demo data?") && admin({ action: "reset_demo" })}>
            Reset demo data
          </button>
        </div>
      </div>
      <ErrorNote error={act.error} />

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
          <h2>Live shoots</h2>
          <span className="small muted">Alert everyone within 10 km · 5 min to accept · widen to 25 km at minute 3 · then ops</span>
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
                    Nothing live. Sign in as Priya Sharma and book a shoot to see dispatch in action.
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

      <div className="grid-2">
        <section className="card stack">
          <h2>Money · {m.month}</h2>
          <div className="row between">
            <span>Shoots billed (ex-GST) · Srijan 20%</span>
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
            <span>GST collected (to be paid to government)</span>
            <span>{inr(m.gstCollected)}</span>
          </div>
          <div className="row between muted small">
            <span>Refunds and late-delivery credits</span>
            <span>{inr(m.refunds)}</span>
          </div>
          <hr className="divider" />
          <div className="row between strong">
            <span>Srijan revenue</span>
            <span style={{ color: "var(--violet-ink)" }}>{inr(m.platformFee + m.campaignCommission)}</span>
          </div>
          <div className="card card-tight row between" style={{ background: "var(--bg)" }}>
            <span className="small">
              Friday payout run: <b>{inr(m.queuedPayouts.total)}</b> to {m.queuedPayouts.count} creator request{m.queuedPayouts.count === 1 ? "" : "s"}
            </span>
            <button className="btn btn-sm btn-primary" disabled={act.busy || m.queuedPayouts.count === 0} onClick={() => admin({ action: "payout_run" })}>
              Mark as paid
            </button>
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
