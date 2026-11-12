"use client";
import { useState } from "react";
import { call, useAction, useData } from "@/lib/client/api";
import type { CreatorPublic } from "@/lib/domain/views";
import type { KycSummary } from "@/lib/domain/kyc";
import { Avatar, ErrorNote, Guard, PortfolioLink, SocialLink, Stars } from "@/components/ui";
import { when } from "@/lib/client/format";

interface AdminData {
  pendingCreators: (CreatorPublic & { kyc: KycSummary; phone?: string; email?: string })[];
  creators: CreatorPublic[];
}

function Creators() {
  const { data, reload } = useData<AdminData>("/api/admin", 10000);
  const act = useAction();
  if (!data) return null;

  /**
   * Approving is what lets this creator accept paid jobs, so it asks whether the person pressing it
   * actually opened the documents — the answer is what the server requires, not the click.
   * Rejecting asks for a reason, which the creator reads before uploading clearer photos.
   */
  async function decide(creatorId: string, decision: "verified" | "rejected") {
    let note: string | undefined;
    if (decision === "verified") {
      if (!confirm("Have you opened this creator’s Aadhaar and read it against their profile?")) return;
    } else {
      const reason = prompt("Why are you sending this back? The creator reads this.", "The photos were too blurry to read. Please send clearer ones.");
      if (reason === null) return;
      note = reason;
    }
    const ok = await act.run(() => call("/api/admin", { action: "verify", creatorId, decision, kycChecked: decision === "verified", note }));
    if (ok) void reload();
  }

  return (
    <div className="container page">
      <h1>Creators</h1>
      <ErrorNote error={act.error} />
      <section className="stack">
        <h2>Waiting for verification ({data.pendingCreators.length})</h2>
        {data.pendingCreators.length === 0 && <p className="muted small">All caught up.</p>}
        {data.pendingCreators.map((c) => (
          <article key={c.id} className="card stack">
            <div className="row">
              <Avatar name={c.name} />
              <div className="grow stack" style={{ gap: 2 }}>
                <b>{c.name}</b>
                <span className="small muted">
                  {c.area} · {c.phone}{c.email ? ` · ${c.email}` : ""}
                </span>
              </div>
              <span className={`badge ${c.kyc.aadhaar ? "badge-green" : c.kyc.aadhaarDoc ? "badge-amber" : "badge-red"}`}>
                Aadhaar {c.kyc.aadhaar ? "✓" : c.kyc.aadhaarDoc ? "to read" : "missing"}
              </span>
            </div>
            {/* With DigiLocker keys set, most creators never reach this list — it verifies them on
                the spot — and the ones who do either skipped it or came back with a name that
                doesn't match. Without the keys, which is Srijan today, everyone comes through here
                with an uploaded Aadhaar for somebody to read. */}
            {c.kyc.needsReview ? (
              <div className="card card-amber stack" style={{ gap: 2 }}>
                <b className="small">{c.kyc.needsReview.reason === "duplicate" ? "This Aadhaar is already verified on another creator account" : "DigiLocker name doesn’t match the profile"}</b>
                <span className="small">
                  DigiLocker says <b>{c.kyc.needsReview.name}</b>; the profile says <b>{c.name}</b>
                  {c.kyc.needsReview.aadhaarLast4 ? ` · Aadhaar •••• ${c.kyc.needsReview.aadhaarLast4}` : ""}
                </span>
                <span className="tiny muted">
                  {c.kyc.needsReview.reason === "duplicate"
                    ? "Find the other account before approving: one person, one creator account."
                    : "Same person with a middle name or a spelling difference? Approve. Different person? Reject."}
                </span>
              </div>
            ) : c.kyc.digilocker ? (
              <div className="card card-green stack" style={{ gap: 2 }}>
                <b className="small">Verified by DigiLocker {when(c.kyc.digilocker.verifiedAt)}</b>
                <span className="small">
                  {c.kyc.digilocker.name}
                  {c.kyc.digilocker.dob ? ` · born ${c.kyc.digilocker.dob}` : ""}
                  {c.kyc.digilocker.aadhaarLast4 ? ` · Aadhaar •••• ${c.kyc.digilocker.aadhaarLast4}` : ""}
                </span>
              </div>
            ) : c.kyc.aadhaarDoc ? (
              <AadhaarReview doc={c.kyc.aadhaarDoc} profileName={c.name} />
            ) : (
              <span className="small muted">Nothing uploaded yet — there is nothing to check. Leave this one until their Aadhaar arrives.</span>
            )}
            {c.bio && <p className="small">{c.bio}</p>}
            <div className="row">
              {c.portfolio ? <PortfolioLink url={c.portfolio} /> : <span className="small muted">No portfolio linked</span>}
              {c.social ? <SocialLink social={c.social} /> : <span className="small muted">No social media account linked</span>}
            </div>
            <div className="chips">
              {c.services.map((s) => (
                <span key={s.key} className="badge">
                  {s.title}
                </span>
              ))}
              {c.gear.map((g) => (
                <span key={g} className="badge badge-violet">
                  {g}
                </span>
              ))}
            </div>
            <div className="row">
              <button className="btn btn-sm" disabled={act.busy} onClick={() => decide(c.id, "rejected")}>
                {c.kyc.aadhaarDoc ? "Send back" : "Reject"}
              </button>
              <button className="btn btn-sm btn-green" disabled={act.busy || (!c.kyc.aadhaarDoc && !c.kyc.digilocker)} onClick={() => decide(c.id, "verified")}>
                Approve
              </button>
            </div>
          </article>
        ))}
      </section>
      <section className="stack">
        <h2>Verified ({data.creators.length})</h2>
        <div className="table-wrap card">
          <table>
            <thead>
              <tr>
                <th>Creator</th>
                <th>Area</th>
                <th>Services</th>
                <th>Same-day</th>
                <th>Rating</th>
              </tr>
            </thead>
            <tbody>
              {data.creators.map((c) => (
                <tr key={c.id}>
                  <td className="strong">{c.name}</td>
                  <td>{c.area}</td>
                  <td className="small">{c.services.map((s) => s.title).join(", ")}</td>
                  <td>{c.available ? <span className="badge badge-green">Online · {c.maxTravelKm} km</span> : <span className="badge">Offline</span>}</td>
                  <td>
                    <Stars rating={c.rating} count={c.ratingCount} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/**
 * The uploaded Aadhaar, for somebody on the Srijan team to actually read. Both sides are shown
 * right here rather than behind a link, because the whole point of this screen is that a person
 * looked at them before pressing Approve.
 *
 * The two things worth a second look are called out above the photos: a name that doesn't match
 * the profile, and the same card already sitting on another account.
 */
function AadhaarReview({ doc, profileName }: { doc: NonNullable<KycSummary["aadhaarDoc"]>; profileName: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="stack" style={{ gap: 8 }}>
      {doc.duplicate && (
        <div className="card card-amber stack" style={{ gap: 2 }}>
          <b className="small">This Aadhaar is already on another creator account</b>
          <span className="tiny muted">Find the other account before approving: one person, one creator account.</span>
        </div>
      )}
      {doc.nameMismatch && (
        <div className="card card-amber stack" style={{ gap: 2 }}>
          <b className="small">The name on the card doesn’t match the profile</b>
          <span className="small">
            The Aadhaar says <b>{doc.name}</b>; the profile says <b>{profileName}</b>
          </span>
          <span className="tiny muted">Same person with a middle name or a spelling difference? Fine. Different person? Send it back.</span>
        </div>
      )}
      <div className="row between">
        <span className="small">
          <b>{doc.name}</b> · Aadhaar •••• {doc.last4} · sent {when(doc.submittedAt)}
        </span>
        <button className="btn btn-sm" onClick={() => setOpen(!open)}>
          {open ? "Hide documents" : "Show documents"}
        </button>
      </div>
      {doc.rejectedNote && <span className="tiny muted">Last sent back: “{doc.rejectedNote}”</span>}
      {open && (
        <div className="row" style={{ alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          {[
            { id: doc.frontId, label: "Front" },
            { id: doc.backId, label: "Back" },
          ].map((side) => (
            <div key={side.id} className="stack" style={{ gap: 4, flex: "1 1 240px" }}>
              <span className="tiny muted">{side.label}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/kyc/document/${side.id}`}
                alt={`${side.label} of the Aadhaar`}
                style={{ width: "100%", borderRadius: 12, border: "1.5px solid var(--line)", background: "var(--surface)" }}
              />
              <a className="tiny" href={`/api/kyc/document/${side.id}`} target="_blank" rel="noreferrer">
                Open full size
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function OpsCreatorsPage() {
  return (
    <Guard role="ops">
      <Creators />
    </Guard>
  );
}
