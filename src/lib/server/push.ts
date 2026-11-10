// Real phone notifications through the Web Push protocol (VAPID). Every message the app creates
// goes through notifyUser, so every one of them can arrive on a phone with the site closed.
//
// Needs NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT (a mailto: address).
// With no keys, push is skipped and the in-app pop-up still works. Generate a pair with:
//   node --input-type=module -e "import {generateVAPIDKeys} from 'web-push'; console.log(generateVAPIDKeys())"
// web-push 4 is ESM with named exports only: there is no default export to import.
import { WebPushError, sendNotification, setVapidDetails } from "web-push";
import type { DB, PushSub } from "@/lib/domain/types";

/** One message, already matched to the devices it goes to. */
export interface Push {
  userId: string;
  title: string;
  body: string;
  href: string;
  tag: string;
  subs: PushSub[];
}

export const pushPublicKey = () => process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function configured() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  setVapidDetails(process.env.VAPID_SUBJECT || "mailto:hadescorps123@gmail.com", publicKey, privateKey);
  return true;
}

/**
 * Messages waiting to be pushed, marked as sent so they go out once. Reads the devices from each
 * person's own record. Call it on the database about to be saved, never after.
 */
export function takePushes(db: DB, now: number): Push[] {
  const out: Push[] = [];
  for (const n of db.notifications ?? []) {
    if (n.pushedAt || n.readAt) continue;
    n.pushedAt = now;
    const subs = db.users.find((u) => u.id === n.userId)?.push?.filter((s) => !s.failedAt) ?? [];
    if (subs.length) out.push({ userId: n.userId, title: n.title, body: n.lines.join("\n"), href: n.href, tag: n.offerId ?? n.id, subs });
  }
  return out;
}

/** Endpoints the push service has told us are gone. The next request drops them. */
const dead = new Set<string>();

export function deadEndpoints() {
  if (!dead.size) return [];
  const list = [...dead];
  dead.clear();
  return list;
}

/** Sends one message to every device. Never throws. */
async function sendOne(p: Push) {
  const payload = JSON.stringify({ title: p.title, body: p.body, href: p.href, tag: p.tag });
  await Promise.all(
    p.subs.map(async (s) => {
      try {
        await sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, { TTL: 10 * 60, urgency: "high" });
      } catch (e) {
        // 404/410 mean the person uninstalled or cleared the site: stop trying that device.
        if (e instanceof WebPushError && (e.statusCode === 404 || e.statusCode === 410)) dead.add(s.endpoint);
        else console.error(`Push to …${s.endpoint.slice(-12)} failed`, e instanceof WebPushError ? e.statusCode : e);
      }
    }),
  );
}

/** Fire-and-forget: a push must never hold up a reply or break a request. */
export async function sendPushes(pushes: Push[]) {
  if (!pushes.length || !configured()) return;
  await Promise.all(pushes.map(sendOne));
}

/** Adds a device to this person, replacing the same endpoint if it is already there. */
export function addPushSub(db: DB, userId: string, sub: PushSub) {
  const u = db.users.find((x) => x.id === userId);
  if (!u) return;
  u.push = [...(u.push ?? []).filter((s) => s.endpoint !== sub.endpoint), sub].slice(-10);
}

export function removePushSub(db: DB, userId: string, endpoint: string) {
  const u = db.users.find((x) => x.id === userId);
  if (u?.push) u.push = u.push.filter((s) => s.endpoint !== endpoint);
}

/** Drops the devices the push service rejected, wherever they are. */
export function dropDeadSubs(db: DB, endpoints: string[]) {
  if (!endpoints.length) return;
  const gone = new Set(endpoints);
  for (const u of db.users) if (u.push?.some((s) => gone.has(s.endpoint))) u.push = u.push.filter((s) => !gone.has(s.endpoint));
}
