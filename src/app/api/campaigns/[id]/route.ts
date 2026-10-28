import { api, readJson } from "@/lib/server/api";
import { campaignView } from "@/lib/domain/views";
import { inviteCreator, respondToInvite, settleCampaign, updateCampaign, type CampaignUpdate } from "@/lib/domain/campaigns";
import { DomainError, assert } from "@/lib/domain/util";

type Action =
  | ({ action: "update" } & CampaignUpdate)
  | { action: "invite"; creatorId: string; deliverables: string; fee: number }
  | { action: "settle" }
  | { action: "respond"; accept: boolean };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson<Action>(req);
  return api(
    ({ db, now, user, viewer }) => {
      const u = user!;
      const opsOnly = () => assert(u.role === "ops", "Your account can’t do that", 403);
      switch (body.action) {
        case "update": {
          opsOnly();
          const { action: _a, ...patch } = body;
          updateCampaign(db, id, patch);
          break;
        }
        case "invite":
          opsOnly();
          inviteCreator(db, id, body.creatorId, body.deliverables, body.fee, now);
          break;
        case "settle":
          opsOnly();
          settleCampaign(db, id, now);
          break;
        case "respond":
          assert(u.role === "creator", "Your account can’t do that", 403);
          respondToInvite(db, id, u.creatorId!, !!body.accept);
          break;
        default:
          throw new DomainError("Unknown action");
      }
      const c = db.campaigns.find((x) => x.id === id)!;
      return campaignView(db, c, viewer);
    },
    { role: ["creator", "ops"] },
  );
}
