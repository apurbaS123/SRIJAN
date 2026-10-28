"use client";
import { call, useAction, useData } from "@/lib/client/api";
import type { CampaignView } from "@/lib/domain/views";
import { ErrorNote, Guard } from "@/components/ui";
import { inr } from "@/lib/client/format";

function Invites() {
  const { data, reload } = useData<CampaignView[]>("/api/campaigns", 10000);
  const act = useAction();

  async function respond(id: string, accept: boolean) {
    const ok = await act.run(() => call(`/api/campaigns/${id}`, { action: "respond", accept }));
    if (ok) void reload();
  }

  return (
    <div className="container page narrow">
      <h1>Brand campaigns</h1>
      <p className="muted">The Srijan team invites you when a brand’s campaign fits your audience. The fee is fixed and paid when the campaign settles.</p>
      <ErrorNote error={act.error} />
      {data?.length === 0 && <p className="muted">No invites yet. Keep your follower count and portfolio up to date.</p>}
      {data?.map((c) =>
        c.creators.map((slot) => (
          <article key={c.id + slot.creatorId} className={`card stack${slot.status === "invited" ? " card-violet" : ""}`}>
            <div className="row between">
              <h2>{c.brandName}</h2>
              <span className="badge">{slot.status === "invited" ? "Invite" : slot.status}</span>
            </div>
            <p className="small">
              {c.goal} · {c.regions.join(", ")}
            </p>
            <p>{slot.deliverables}</p>
            <div className="row between">
              <b style={{ fontSize: 20 }}>{inr(slot.fee)} fee</b>
              {slot.status === "invited" && (
                <div className="row">
                  <button className="btn btn-sm" disabled={act.busy} onClick={() => respond(c.id, false)}>
                    Decline
                  </button>
                  <button className="btn btn-sm btn-violet" disabled={act.busy} onClick={() => respond(c.id, true)}>
                    Accept
                  </button>
                </div>
              )}
            </div>
            <span className="tiny muted">Campaign stage: {c.stageLabel}</span>
          </article>
        )),
      )}
    </div>
  );
}

export default function CreatorCampaignsPage() {
  return (
    <Guard role="creator">
      <Invites />
    </Guard>
  );
}
