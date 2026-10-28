import { api, readJson } from "@/lib/server/api";
import { campaignView } from "@/lib/domain/views";
import { createCampaign, type NewCampaignInput } from "@/lib/domain/campaigns";

/** Ops: all campaigns. Creators: ones they're invited to. Brands: their own requests. */
export async function GET() {
  return api(
    ({ db, user, viewer }) => {
      const u = user!;
      const list =
        u.role === "ops"
          ? db.campaigns
          : u.role === "creator"
            ? db.campaigns.filter((c) => c.creators.some((x) => x.creatorId === u.creatorId))
            : db.campaigns.filter((c) => c.userId === u.id);
      return [...list].sort((a, b) => b.createdAt - a.createdAt).map((c) => campaignView(db, c, viewer));
    },
    { role: ["client", "creator", "ops"] },
  );
}

/** Brand books a strategy call. Works without signing in. */
export async function POST(req: Request) {
  const input = await readJson<NewCampaignInput>(req);
  return api(({ db, now, user }) => {
    const c = createCampaign(db, input, user?.role === "client" ? user.id : undefined, now);
    return { id: c.id, code: c.code, callAt: c.callAt };
  });
}
