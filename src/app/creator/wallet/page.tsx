"use client";
import { useState } from "react";
import { call, useAction, useData } from "@/lib/client/api";
import type { LedgerEntry } from "@/lib/domain/types";
import { ErrorNote, Guard } from "@/components/ui";
import { useSession } from "@/components/Session";
import { inr, when } from "@/lib/client/format";

interface Wallet {
  available: number;
  onHold: number;
  earned: number;
  withdrawn: number;
  entries: LedgerEntry[];
  upiId: string | null;
  instantFee: number;
  minWithdrawal: number;
}

function WalletView() {
  const { data: w, reload } = useData<Wallet>("/api/wallet", 10000);
  const { refresh } = useSession();
  const act = useAction();
  const [amount, setAmount] = useState("");
  const [upi, setUpi] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  if (!w) return null;

  async function withdraw(instant: boolean) {
    setMsg(null);
    const r = await act.run(() => call<LedgerEntry>("/api/wallet", { amount: Number(amount || w!.available - (instant ? w!.instantFee : 0)), instant }));
    if (r) {
      setMsg(instant ? `${inr(r.amount)} sent to ${w!.upiId}` : `${inr(r.amount)} will be paid on Friday`);
      setAmount("");
      void reload();
    }
  }

  async function saveUpi() {
    const ok = await act.run(() => call("/api/me/creator", { upiId: upi }, "PATCH"));
    if (ok) {
      await refresh();
      void reload();
    }
  }

  return (
    <div className="container page narrow">
      <h1>Wallet</h1>
      <section className="card card-dark stack">
        <span className="small muted">Ready to withdraw</span>
        <div className="huge-num">{inr(w.available)}</div>
        <div className="row between small">
          <span className="muted">In progress or waiting for client approval</span>
          <b>{inr(w.onHold)}</b>
        </div>
        {w.upiId ? (
          <>
            <div className="field">
              <label htmlFor="amt" style={{ color: "#c9cbd3" }}>
                Amount (blank = everything)
              </label>
              <input id="amt" className="input" type="number" min={w.minWithdrawal} value={amount} onChange={(e) => setAmount(e.target.value)} style={{ background: "#1f1f27", color: "#fff", borderColor: "#3a3b45" }} />
            </div>
            <div className="row">
              <button className="btn btn-accent grow" disabled={act.busy || w.available < w.minWithdrawal} onClick={() => withdraw(false)}>
                Friday payout · free
              </button>
              <button className="btn grow" style={{ background: "transparent", color: "#fff", borderColor: "#5b5f6b" }} disabled={act.busy || w.available < w.minWithdrawal + w.instantFee} onClick={() => withdraw(true)}>
                Instant · ₹{w.instantFee} fee
              </button>
            </div>
            <span className="tiny muted">To {w.upiId}</span>
          </>
        ) : (
          <div className="row">
            <label htmlFor="upi" className="sr-only">
              UPI ID
            </label>
            <input id="upi" className="input grow" placeholder="Add UPI ID, e.g. name@okaxis" value={upi} onChange={(e) => setUpi(e.target.value)} />
            <button className="btn btn-accent" disabled={act.busy} onClick={saveUpi}>
              Save
            </button>
          </div>
        )}
      </section>
      {msg && <div className="success">{msg}</div>}
      <ErrorNote error={act.error} />

      <section className="card stack">
        <h2>History</h2>
        {w.entries.length === 0 && <p className="small muted">Nothing yet.</p>}
        {w.entries.map((e) => (
          <div key={e.id} className="row between" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 10 }}>
            <div className="stack" style={{ gap: 0 }}>
              <b className="small">{e.type === "withdrawal" ? "Withdrawal" : e.campaignId ? "Campaign fee" : "Shoot payout"}</b>
              <span className="tiny muted">
                {e.note} · {when(e.at)}
              </span>
            </div>
            <div className="stack" style={{ gap: 0, alignItems: "flex-end" }}>
              <b className="small">{e.type === "withdrawal" ? "−" : "+"}{inr(e.amount)}</b>
              {e.type === "withdrawal" && <span className={`tiny strong ${e.status === "paid" ? "" : "muted"}`}>{e.status === "paid" ? "PAID" : "FRIDAY"}{e.fee ? ` · fee ₹${e.fee}` : ""}</span>}
            </div>
          </div>
        ))}
      </section>
      <p className="tiny muted">Shoot jobs pay 80% of the package price after the client approves. Campaign fees are agreed upfront and paid when the campaign settles. TDS handling comes with the real payout integration.</p>
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
