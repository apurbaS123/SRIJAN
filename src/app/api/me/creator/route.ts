import { api, readJson } from "@/lib/server/api";
import { creatorPublic } from "@/lib/domain/views";
import { updateOwnCreator, type CreatorPatch } from "@/lib/domain/creators";

export async function PATCH(req: Request) {
  const patch = await readJson<CreatorPatch>(req);
  return api(
    ({ db, user }) => {
      const c = updateOwnCreator(db, user!.creatorId!, patch);
      return { ...creatorPublic(c), upiId: c.upiId, kyc: c.kyc };
    },
    { role: "creator" },
  );
}
