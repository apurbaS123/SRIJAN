import { api, readJson } from "@/lib/server/api";
import { addPushSub, removePushSub } from "@/lib/server/push";
import { DomainError } from "@/lib/domain/util";

interface Body {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
  /** Set to stop notifications on this device. */
  off?: unknown;
}

/** Turns phone notifications on or off for the device making the request. */
export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth = typeof body.keys?.auth === "string" ? body.keys.auth : "";
  return api(
    ({ db, now, user }) => {
      if (!/^https:\/\/\S+$/.test(endpoint) || endpoint.length > 1000) throw new DomainError("That isn’t a notification address");
      if (body.off) {
        removePushSub(db, user!.id, endpoint);
        return { on: false };
      }
      if (!p256dh || !auth) throw new DomainError("That notification address is missing its keys");
      addPushSub(db, user!.id, { endpoint, keys: { p256dh, auth }, addedAt: now });
      return { on: true };
    },
    { role: ["creator", "ops", "client"] },
  );
}
