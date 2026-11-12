"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { call, callForm, useAction } from "@/lib/client/api";
import { ErrorNote, Guard, Loading } from "@/components/ui";
import { useSession } from "@/components/Session";
import { when } from "@/lib/client/format";
import { AadhaarFields, EMPTY_AADHAAR, aadhaarForm, aadhaarReady, type AadhaarDraft } from "@/components/AadhaarFields";
import type { KycSummary } from "@/lib/domain/kyc";

/** What the callback redirected back with, in the creator's own words. */
const RESULT: Record<string, { tone: "green" | "amber" | "orange"; title: string; body: string }> = {
  verified: {
    tone: "green",
    title: "You’re verified",
    body: "DigiLocker confirmed your Aadhaar. You can go online and start accepting jobs straight away.",
  },
  needs_review: {
    tone: "amber",
    title: "Almost there — the Srijan team is checking",
    body: "The name on your Aadhaar doesn’t match the name on your profile, so we check this one by hand. It usually takes a few hours.",
  },
  already_used: {
    tone: "amber",
    title: "This Aadhaar is already on another Srijan account",
    body: "One person, one creator account. Please contact Srijan support and we’ll sort it out.",
  },
  cancelled: {
    tone: "orange",
    title: "You didn’t finish on DigiLocker",
    body: "Nothing was shared and nothing has changed. You can try again whenever you’re ready.",
  },
  expired: {
    tone: "orange",
    title: "That took too long",
    body: "A DigiLocker sign-in is only good for 15 minutes. Please start again.",
  },
  failed: {
    tone: "orange",
    title: "DigiLocker couldn’t finish",
    body: "Nothing has changed on your profile. Please try again.",
  },
};

function Kyc() {
  const { session, refresh } = useSession();
  const params = useSearchParams();
  const welcome = params.get("welcome") === "1";
  const result = params.get("result") ?? "";
  const message = params.get("message") ?? "";
  const act = useAction();
  const [leaving, setLeaving] = useState(false);
  const me = session?.creator;
  // No DigiLocker partner keys on this server: the Srijan team reads the uploaded Aadhaar instead.
  const digilocker = session?.creatorVerification === "digilocker";

  // Coming back from DigiLocker: pick up the new verification state.
  useEffect(() => {
    if (result) void refresh();
  }, [result, refresh]);

  if (!me) return null;
  const kyc = me.kyc;
  const done = !!kyc.digilocker;
  const outcome = RESULT[result];

  async function start() {
    const r = await act.run(() => call<{ url: string }>("/api/kyc/digilocker", {}, "POST"));
    if (!r) return;
    setLeaving(true);
    window.location.href = r.url;
  }

  if (!digilocker) {
    return <ManualKyc kyc={kyc} verification={me.verification} welcome={welcome} />;
  }

  return (
    <div className="container page narrow">
      <h1>{welcome ? "One last step: verify yourself" : "Verify yourself with DigiLocker"}</h1>
      <p className="muted">
        {welcome ? "Your profile is in. " : ""}
        Srijan verifies every creator before they can take paid jobs. Sign in to DigiLocker, the government’s own document
        wallet, and share your Aadhaar — you’re verified in under a minute, with nobody waiting on the Srijan team.
      </p>

      {outcome && (
        <div className={`card card-${outcome.tone} stack`} style={{ gap: 4 }} role="status">
          <b>{outcome.title}</b>
          <span className="small">{message || outcome.body}</span>
        </div>
      )}

      {done ? (
        <section className="card stack">
          <div className="row between">
            <h2>Aadhaar verified</h2>
            <span className="badge badge-green">DigiLocker ✓</span>
          </div>
          <div className="stack" style={{ gap: 6, fontSize: 14 }}>
            <div className="row between">
              <span className="muted">Name on Aadhaar</span>
              <b>{kyc.digilocker!.name}</b>
            </div>
            {kyc.digilocker!.dob && (
              <div className="row between">
                <span className="muted">Date of birth</span>
                <b>{kyc.digilocker!.dob}</b>
              </div>
            )}
            {kyc.digilocker!.aadhaarLast4 && (
              <div className="row between">
                <span className="muted">Aadhaar</span>
                <b>•••• •••• {kyc.digilocker!.aadhaarLast4}</b>
              </div>
            )}
            <div className="row between">
              <span className="muted">PAN</span>
              <b>{kyc.pan ? "Verified ✓" : "Not in your DigiLocker"}</b>
            </div>
            <div className="row between">
              <span className="muted">Verified on</span>
              <b>{when(kyc.digilocker!.verifiedAt)}</b>
            </div>
          </div>
          <p className="tiny muted">
            Srijan stores your name, date of birth and the last 4 digits of your Aadhaar. Your full Aadhaar number is never
            sent to us and never stored.
          </p>
        </section>
      ) : kyc.needsReview ? (
        <section className="card card-amber stack">
          <b>With the Srijan team</b>
          {kyc.needsReview.reason === "duplicate" ? (
            <>
              <span className="small">
                This Aadhaar is already verified on another Srijan account, and one person can only have one creator
                account.
              </span>
              <span className="tiny muted">
                If that other account isn’t yours, <Link href="/support">tell Srijan support</Link> and we’ll sort it out.
              </span>
            </>
          ) : (
            <>
              <span className="small">
                DigiLocker came back with “{kyc.needsReview.name}”, which doesn’t match the name on your profile. Someone
                from Srijan is checking it by hand — you don’t need to do anything.
              </span>
              <span className="tiny muted">
                If the name on your profile is wrong, <Link href="/support">contact support</Link> and we’ll fix it.
              </span>
            </>
          )}
        </section>
      ) : (
        <section className="card stack">
          <h2>Verify with DigiLocker</h2>
          <ol className="small stack" style={{ gap: 6, paddingLeft: 18 }}>
            <li>You go to DigiLocker and sign in with your Aadhaar number or DigiLocker username.</li>
            <li>DigiLocker asks whether to share your Aadhaar details with Srijan. You say yes.</li>
            <li>You land back here, verified, and can go online.</li>
          </ol>
          <ErrorNote error={act.error} />
          <button className="btn btn-primary btn-lg btn-block" disabled={act.busy || leaving} onClick={start}>
            {leaving ? "Taking you to DigiLocker…" : "Verify with DigiLocker"}
          </button>
          <p className="tiny muted">
            Don’t have a DigiLocker account? Any Indian with an Aadhaar can make one free at digilocker.gov.in in a couple of
            minutes. If you’d rather not use DigiLocker, contact Srijan support and the team will verify you by hand.
          </p>
        </section>
      )}

      {me.verification === "verified" ? (
        <Link href="/creator" className="btn btn-accent btn-lg btn-block">
          {welcome ? "Start taking jobs" : "Back to jobs"}
        </Link>
      ) : (
        <Link href="/creator" className="btn btn-lg btn-block">
          Back to jobs
        </Link>
      )}

      <p className="tiny muted">
        You don’t have to add a payment receive method to work. Add your bank account or UPI ID from{" "}
        <Link href="/creator/payout">how you get paid</Link> whenever you like — Srijan needs it only to send your earnings.
      </p>
    </div>
  );
}

/**
 * Verification as it works today: the creator sends both sides of their Aadhaar and somebody on the
 * Srijan team reads it. Four things can be true here — approved, waiting, sent back for clearer
 * photos, or already on another account — and the only one that asks anything of the creator is the
 * third, so each state says plainly whether there is something to do.
 */
function ManualKyc({ kyc, verification, welcome }: { kyc: KycSummary; verification: string; welcome: boolean }) {
  const { refresh } = useSession();
  const act = useAction();
  const [draft, setDraft] = useState<AadhaarDraft>(EMPTY_AADHAAR);
  const [again, setAgain] = useState(false);
  const doc = kyc.aadhaarDoc;
  const verified = verification === "verified";
  const rejected = verification === "rejected";
  // Nothing on file, sent back, or they chose to replace what they sent: show the form.
  const uploading = !doc || rejected || again;

  async function send() {
    const r = await act.run(() => callForm("/api/kyc/aadhaar", aadhaarForm(draft)));
    if (!r) return;
    setDraft(EMPTY_AADHAAR);
    setAgain(false);
    await refresh();
  }

  return (
    <div className="container page narrow">
      <h1>{verified ? "You’re verified" : welcome && doc ? "Your Aadhaar is with the Srijan team" : "Verify yourself"}</h1>
      <p className="muted">
        Srijan checks every creator before they can take paid work, so a client always knows who is turning up. Someone from the
        team reads your Aadhaar by hand — usually within a day.
      </p>

      {verified ? (
        <section className="card card-green stack" style={{ gap: 4 }}>
          <b>Aadhaar verified{doc?.checkedAt ? ` · ${when(doc.checkedAt)}` : ""}</b>
          <span className="small">You can go online and start accepting jobs.</span>
          {doc && (
            <span className="tiny muted">
              {doc.name} · Aadhaar •••• {doc.last4}
            </span>
          )}
        </section>
      ) : doc?.duplicate ? (
        <section className="card card-amber stack" style={{ gap: 4 }}>
          <b>This Aadhaar is already on another Srijan account</b>
          <span className="small">One person, one creator account.</span>
          <span className="tiny muted">
            If that other account isn’t yours, <Link href="/support">tell Srijan support</Link> and we’ll sort it out.
          </span>
        </section>
      ) : rejected ? (
        <section className="card card-orange stack" style={{ gap: 4 }}>
          <b>The Srijan team sent your Aadhaar back</b>
          <span className="small">{doc?.rejectedNote || "They couldn’t verify you from what was uploaded. Please send it again."}</span>
          <span className="tiny muted">Upload it again below and you go straight back into the queue.</span>
        </section>
      ) : doc ? (
        <section className="card card-amber stack" style={{ gap: 4 }}>
          <b>With the Srijan team</b>
          <span className="small">
            Sent {when(doc.submittedAt)}. There’s nothing more to do — you’ll get an alert as soon as you’re approved, and you
            can finish your profile in the meantime.
          </span>
        </section>
      ) : (
        <section className="card card-orange stack" style={{ gap: 4 }}>
          <b>We still need your Aadhaar</b>
          <span className="small">You can’t go online or accept jobs until the Srijan team has verified you.</span>
        </section>
      )}

      {doc && !doc.duplicate && (
        <section className="card stack">
          <div className="row between">
            <h2>What you sent</h2>
            {verified ? <span className="badge badge-green">Verified ✓</span> : <span className="badge badge-amber">Being checked</span>}
          </div>
          <div className="stack" style={{ gap: 6, fontSize: 14 }}>
            <div className="row between">
              <span className="muted">Name on Aadhaar</span>
              <b>{doc.name}</b>
            </div>
            <div className="row between">
              <span className="muted">Aadhaar</span>
              <b>•••• •••• {doc.last4}</b>
            </div>
            <div className="row between">
              <span className="muted">Sent</span>
              <b>{when(doc.submittedAt)}</b>
            </div>
          </div>
          <div className="row">
            <a className="btn btn-sm" href={`/api/kyc/document/${doc.frontId}`} target="_blank" rel="noreferrer">
              View front
            </a>
            <a className="btn btn-sm" href={`/api/kyc/document/${doc.backId}`} target="_blank" rel="noreferrer">
              View back
            </a>
            {!verified && !uploading && (
              <button className="btn btn-sm" onClick={() => setAgain(true)}>
                Upload again
              </button>
            )}
          </div>
          <p className="tiny muted">
            Srijan keeps your documents privately and only the Srijan team opens them. Only the last 4 digits of your Aadhaar
            number are stored.
          </p>
        </section>
      )}

      {uploading && !doc?.duplicate && !verified && (
        <section className="card stack">
          <h2>{doc ? "Send it again" : "Upload your Aadhaar"}</h2>
          <AadhaarFields value={draft} onChange={setDraft} disabled={act.busy} />
          <ErrorNote error={act.error} />
          <button className="btn btn-primary btn-lg btn-block" disabled={act.busy || !aadhaarReady(draft)} onClick={send}>
            {act.busy ? "Uploading…" : doc ? "Send these instead" : "Send to the Srijan team"}
          </button>
          {again && (
            <button className="btn btn-block" disabled={act.busy} onClick={() => setAgain(false)}>
              Cancel
            </button>
          )}
        </section>
      )}

      <Link href="/creator" className={`btn btn-lg btn-block${verified ? " btn-accent" : ""}`}>
        {welcome && verified ? "Start taking jobs" : "Back to jobs"}
      </Link>

      <p className="tiny muted">
        You don’t have to add a payment receive method to work. Add your bank account or UPI ID from{" "}
        <Link href="/creator/payout">how you get paid</Link> whenever you like — Srijan needs it only to send your earnings.
      </p>
    </div>
  );
}

export default function KycPage() {
  return (
    <Guard role="creator">
      <Suspense fallback={<Loading />}>
        <Kyc />
      </Suspense>
    </Guard>
  );
}
