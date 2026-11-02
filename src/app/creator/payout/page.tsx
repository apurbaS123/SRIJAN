"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { call, useAction } from "@/lib/client/api";
import { ErrorNote, Guard, Loading } from "@/components/ui";
import { useSession } from "@/components/Session";

function PayoutForm() {
  const { session, refresh } = useSession();
  const welcome = useSearchParams().get("welcome") === "1";
  const current = session?.creator?.payout ?? null;
  const act = useAction();
  const [editing, setEditing] = useState(false);
  const [method, setMethod] = useState<"upi" | "bank">("upi");
  const [upiId, setUpiId] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountAgain, setAccountAgain] = useState("");
  const [ifsc, setIfsc] = useState("");

  const showForm = !current || editing;

  async function save() {
    if (method === "bank" && accountNumber !== accountAgain) return act.setError("The two account numbers don’t match");
    const payout = method === "upi" ? { method, upiId } : { method, accountName, accountNumber, ifsc };
    const ok = await act.run(() => call("/api/me/creator", { payout }, "PATCH"));
    if (!ok) return;
    await refresh();
    setEditing(false);
    setAccountNumber("");
    setAccountAgain("");
  }

  return (
    <div className="container page narrow">
      <h1>{welcome ? "One last step: how should we pay you?" : "How you get paid"}</h1>
      <p className="muted">
        {welcome ? "Your profile has been sent for verification. " : ""}
        When a client approves your job, Srijan sends your 80% to the account you link here. Use an account in your own name.
      </p>

      {current && !editing && (
        <section className="card stack">
          <span className="small muted">Your payments go to</span>
          {current.method === "upi" ? (
            <b>UPI · {current.upiId}</b>
          ) : (
            <b>
              {current.accountName} · A/C ending {current.accountLast4} · {current.ifsc}
            </b>
          )}
          <button className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start" }} onClick={() => setEditing(true)}>
            Change
          </button>
        </section>
      )}

      {showForm && (
        <section className="card stack">
          <div className="chips" role="group" aria-label="How you get paid">
            <button aria-pressed={method === "upi"} className={`chip${method === "upi" ? " on" : ""}`} onClick={() => setMethod("upi")}>
              UPI ID
            </button>
            <button aria-pressed={method === "bank"} className={`chip${method === "bank" ? " on" : ""}`} onClick={() => setMethod("bank")}>
              Bank account
            </button>
          </div>
          {method === "upi" ? (
            <div className="field">
              <label htmlFor="upi">UPI ID</label>
              <input id="upi" className="input" autoComplete="off" value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="name@okaxis" />
            </div>
          ) : (
            <>
              <div className="field">
                <label htmlFor="acname">Account holder’s name</label>
                <input id="acname" className="input" autoComplete="off" value={accountName} onChange={(e) => setAccountName(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="acno">Account number</label>
                <input id="acno" className="input" inputMode="numeric" autoComplete="off" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="acno2">Account number again</label>
                <input id="acno2" className="input" inputMode="numeric" autoComplete="off" value={accountAgain} onChange={(e) => setAccountAgain(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="ifsc">IFSC</label>
                <input id="ifsc" className="input" autoComplete="off" value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} placeholder="SBIN0001234" />
              </div>
            </>
          )}
          <ErrorNote error={act.error} />
          <button className="btn btn-primary btn-lg btn-block" disabled={act.busy} onClick={save}>
            {method === "upi" ? "Link UPI ID" : "Link bank account"}
          </button>
        </section>
      )}

      {current && !editing && (
        <Link href="/creator" className="btn btn-accent btn-lg btn-block">
          {welcome ? "Continue" : "Back to jobs"}
        </Link>
      )}
      {!current && <p className="tiny muted">You can’t go online or get job alerts until this is linked.</p>}
    </div>
  );
}

export default function PayoutPage() {
  return (
    <Guard role="creator">
      <Suspense fallback={<Loading />}>
        <PayoutForm />
      </Suspense>
    </Guard>
  );
}
