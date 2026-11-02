import { api, readJson } from "@/lib/server/api";
import { creatorPublic } from "@/lib/domain/views";
import { payoutSummary, updateOwnCreator, type CreatorPatch } from "@/lib/domain/creators";

export async function PATCH(req: Request) {
  const patch = await readJson<CreatorPatch>(req);
  return api(
    ({ db, user }) => {
      const c = updateOwnCreator(db, user!.creatorId!, patch);
      return { ...creatorPublic(c), payout: payoutSummary(c), kyc: c.kyc };
    },
    { role: "creator" },
  );
}
