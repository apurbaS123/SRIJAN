"use client";
import { call, useAction, useData } from "@/lib/client/api";
import type { CreatorPublic } from "@/lib/domain/views";
import { Avatar, ErrorNote, Guard, Stars } from "@/components/ui";

interface AdminData {
  pendingCreators: (CreatorPublic & { kyc: { aadhaar: boolean; pan: boolean }; phone?: string })[];
  creators: CreatorPublic[];
}

function Creators() {
  const { data, reload } = useData<AdminData>("/api/admin", 10000);
  const act = useAction();
  if (!data) return null;

  async function decide(creatorId: string, decision: "verified" | "rejected") {
    const kycChecked = decision === "verified" && confirm("Have you checked this creator’s Aadhaar and PAN documents?");
    if (decision === "verified" && !kycChecked) return;
    const ok = await act.run(() => call("/api/admin", { action: "verify", creatorId, decision, kycChecked }));
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
                  {c.area} · {c.phone}
                </span>
              </div>
              <span className={`badge ${c.kyc.aadhaar ? "badge-green" : "badge-red"}`}>Aadhaar {c.kyc.aadhaar ? "✓" : "missing"}</span>
              <span className={`badge ${c.kyc.pan ? "badge-green" : "badge-red"}`}>PAN {c.kyc.pan ? "✓" : "missing"}</span>
            </div>
            {c.bio && <p className="small">{c.bio}</p>}
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
                Reject
              </button>
              <button className="btn btn-sm btn-green" disabled={act.busy} onClick={() => decide(c.id, "verified")}>
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
                  <td>{c.onDemand ? (c.available ? <span className="badge badge-green">Online · {c.maxTravelKm} km</span> : <span className="badge">Offline</span>) : <span className="muted small">—</span>}</td>
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

export default function OpsCreatorsPage() {
  return (
    <Guard role="ops">
      <Creators />
    </Guard>
  );
}
