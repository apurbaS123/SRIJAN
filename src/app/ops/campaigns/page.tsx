"use client";
import { useEffect, useState } from "react";
import { call, useAction, useData } from "@/lib/client/api";
import type { CampaignView, CreatorPublic } from "@/lib/domain/views";
import type { CampaignStage } from "@/lib/domain/types";
import { ErrorNote, Guard } from "@/components/ui";
import { useMeta } from "@/components/useMeta";
import { inr, when } from "@/lib/client/format";

function Editor({ c, creators, onSaved }: { c: CampaignView; creators: CreatorPublic[]; onSaved: (c: CampaignView) => void }) {
  const meta = useMeta();
  const act = useAction();
  const [budget, setBudget] = useState(c.budget ? String(c.budget) : "");
  const [rate, setRate] = useState(String(Math.round((c.commissionRate ?? 0.3) * 100)));
  const [notes, setNotes] = useState(c.notes ?? "");
  const [inv, setInv] = useState({ creatorId: "", deliverables: "", fee: "" });

  useEffect(() => {
    setBudget(c.budget ? String(c.budget) : "");
    setRate(String(Math.round((c.commissionRate ?? 0.3) * 100)));
    setNotes(c.notes ?? "");
  }, [c.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function post(body: Record<string, unknown>) {
    const r = await act.run(() => call<CampaignView>(`/api/campaigns/${c.id}`, body));
    if (r) onSaved(r);
    return r;
  }

  const m = c.math!;
  const closed = c.stage === "closed";
  const used = new Set(c.creators.filter((x) => x.status !== "declined").map((x) => x.creatorId));

  return (
    <section className="card stack">
      <div className="row between">
        <div className="stack" style={{ gap: 2 }}>
          <h2>{c.brandName}</h2>
          <span className="small muted">
            {c.code} · {c.contactName} · {c.phone} · {c.email}
          </span>
          <span className="small muted">
            {c.goal} · {c.regions.join(", ")} · asked {c.budgetRange} · call {when(c.callAt)} ({c.callMode})
          </span>
        </div>
        <span className="badge badge-violet">{c.stageLabel}</span>
      </div>

      <div className="grid-2">
        <div className="stack">
          <div className="row">
            <div className="field grow">
              <label htmlFor="budget">Agreed budget (₹)</label>
              <input id="budget" className="input" type="number" disabled={closed} value={budget} onChange={(e) => setBudget(e.target.value)} />
            </div>
            <div className="field" style={{ width: 130 }}>
              <label htmlFor="rate">Commission %</label>
              <select id="rate" className="select" disabled={closed} value={rate} onChange={(e) => setRate(e.target.value)}>
                {[30, 31, 32, 33, 34, 35].map((r) => (
                  <option key={r} value={r}>
                    {r}%
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="notes">Notes</label>
            <textarea id="notes" className="textarea" disabled={closed} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <button className="btn btn-primary" style={{ alignSelf: "flex-start" }} disabled={act.busy || closed} onClick={() => post({ action: "update", budget: budget ? Number(budget) : null, commissionRate: Number(rate) / 100, notes })}>
            Save
          </button>
          <div className="row">
            <label className="check">
              <input type="checkbox" disabled={closed || act.busy} checked={c.advancePaid} onChange={(e) => post({ action: "update", advancePaid: e.target.checked })} />
              50% advance received
            </label>
            <label className="check">
              <input type="checkbox" disabled={closed || act.busy} checked={c.balancePaid} onChange={(e) => post({ action: "update", balancePaid: e.target.checked })} />
              Balance received
            </label>
          </div>
          <div className="field">
            <label htmlFor="stage">Stage</label>
            <select id="stage" className="select" disabled={closed || act.busy} value={c.stage} onChange={(e) => post({ action: "update", stage: e.target.value as CampaignStage })}>
              {meta?.campaignStages
                .filter((s) => s.key !== "closed" || closed)
                .map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div className="stack">
          <div className="card card-tight stack" style={{ background: "var(--bg)", gap: 6 }}>
            <div className="row between"><span>Budget</span><b>{inr(m.budget)}</b></div>
            <div className="row between"><span>Srijan commission ({Math.round((c.commissionRate ?? 0) * 100)}%)</span><b style={{ color: "var(--violet-ink)" }}>{inr(m.commission)}</b></div>
            <div className="row between"><span>Creator pool</span><b>{inr(m.creatorPool)}</b></div>
            <div className="row between"><span>Committed to creators</span><b>{inr(m.committed)}</b></div>
            <div className="row between"><span>Left in pool</span><b style={{ color: m.remaining < 0 ? "var(--red)" : undefined }}>{inr(m.remaining)}</b></div>
            <span className="tiny muted">Anything left in the pool at settlement stays with Srijan.</span>
          </div>
          <h3>Creators</h3>
          {c.creators.length === 0 && <p className="small muted">No one invited yet.</p>}
          {c.creators.map((x) => (
            <div key={x.creatorId} className="row between small">
              <span>
                <b>{x.name}</b> · {x.deliverables}
              </span>
              <span>
                {inr(x.fee)} <span className={`badge ${x.status === "accepted" || x.status === "paid" ? "badge-green" : x.status === "declined" ? "badge-red" : ""}`}>{x.status}</span>
              </span>
            </div>
          ))}
          {!closed && (
            <div className="stack" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
              <div className="field">
                <label htmlFor="inv-c">Invite creator</label>
                <select id="inv-c" className="select" value={inv.creatorId} onChange={(e) => setInv({ ...inv, creatorId: e.target.value })}>
                  <option value="">Pick a creator…</option>
                  {creators
                    .filter((cr) => !used.has(cr.id))
                    .map((cr) => (
                      <option key={cr.id} value={cr.id}>
                        {cr.name} · {cr.area}
                        {cr.followers ? ` · ${Math.round(cr.followers / 1000)}K` : ""}
                      </option>
                    ))}
                </select>
              </div>
              <div className="row">
                <div className="field grow">
                  <label htmlFor="inv-d">Deliverables</label>
                  <input id="inv-d" className="input" value={inv.deliverables} onChange={(e) => setInv({ ...inv, deliverables: e.target.value })} placeholder="1 reel + 3 stories" />
                </div>
                <div className="field" style={{ width: 140 }}>
                  <label htmlFor="inv-f">Fee (₹)</label>
                  <input id="inv-f" className="input" type="number" value={inv.fee} onChange={(e) => setInv({ ...inv, fee: e.target.value })} />
                </div>
              </div>
              <button
                className="btn btn-violet"
                style={{ alignSelf: "flex-start" }}
                disabled={act.busy || !inv.creatorId}
                onClick={async () => {
                  const r = await post({ action: "invite", creatorId: inv.creatorId, deliverables: inv.deliverables, fee: Number(inv.fee) });
                  if (r) setInv({ creatorId: "", deliverables: "", fee: "" });
                }}
              >
                Send invite
              </button>
            </div>
          )}
          {c.stage === "report_settle" && (
            <button className="btn btn-green" disabled={act.busy} onClick={() => confirm("Pay all accepted creators and close this campaign?") && post({ action: "settle" })}>
              Settle & close · pay creators
            </button>
          )}
        </div>
      </div>
      <ErrorNote error={act.error} />
    </section>
  );
}

function Pipeline() {
  const meta = useMeta();
  const { data, setData } = useData<CampaignView[]>("/api/campaigns", 15000);
  const { data: admin } = useData<{ creators: CreatorPublic[] }>("/api/admin");
  const [openId, setOpenId] = useState<string | null>(null);
  if (!data || !meta) return null;
  const open = data.find((c) => c.id === openId);

  return (
    <div className="container page" style={{ maxWidth: 1280 }}>
      <h1>Campaign pipeline</h1>
      <div className="kanban">
        {meta.campaignStages.map((s) => {
          const list = data.filter((c) => c.stage === s.key);
          return (
            <div key={s.key} className="kanban-col">
              <b className="small">
                {s.label} <span className="muted">({list.length})</span>
              </b>
              {list.map((c) => (
                <button key={c.id} className={`option${c.id === openId ? " on" : ""}`} style={{ flexDirection: "column", gap: 4 }} onClick={() => setOpenId(c.id)}>
                  <b>{c.brandName}</b>
                  <span className="tiny muted">{c.budget ? `${inr(c.budget)} · ${Math.round((c.commissionRate ?? 0) * 100)}%` : c.budgetRange}</span>
                  {c.math && c.budget ? <span className="tiny strong" style={{ color: "var(--violet-ink)" }}>Srijan {inr(c.math.commission)}</span> : null}
                </button>
              ))}
            </div>
          );
        })}
      </div>
      {open ? (
        <Editor c={open} creators={admin?.creators ?? []} onSaved={(c) => setData(data.map((x) => (x.id === c.id ? c : x)))} />
      ) : (
        <p className="muted">Pick a campaign to manage it.</p>
      )}
    </div>
  );
}

export default function OpsCampaignsPage() {
  return (
    <Guard role="ops">
      <Pipeline />
    </Guard>
  );
}
