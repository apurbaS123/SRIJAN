import { after } from "next/server";
import { api, readJson, setSession } from "@/lib/server/api";
import { normalizeEmail, normalizePhone } from "@/lib/server/env";
import { verifyOtp } from "@/lib/server/auth";
import { campaignAlertLines, sendWhatsAppAlert } from "@/lib/server/whatsapp";
import { limitByIp } from "@/lib/server/rateLimit";
import { campaignView } from "@/lib/domain/views";
import { createCampaign, type NewCampaignInput } from "@/lib/domain/campaigns";
import { assert, cleanText, newId } from "@/lib/domain/util";
import type { User } from "@/lib/domain/types";

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

/**
 * Brand books a strategy call. Signed-in accounts just submit; everyone else verifies their
 * work email with { code } from /api/session/otp, and is signed in to a client account
 * (created on first use) so they can follow the request.
 */
export async function POST(req: Request) {
  // Public form that also pings WhatsApp: keep spam down.
  const limited = await limitByIp("campaign", 5, 60 * 60_000);
  if (limited) return limited;
  const input = await readJson<NewCampaignInput & { code?: string }>(req);
  let alert: string[] | undefined;
  let signIn: string | null = null;
  const res = await api(({ db, now, user }) => {
    let owner = user;
    if (!owner) {
      const email = normalizeEmail(input.email);
      assert(email, "Enter a valid work email");
      verifyOtp(db, email, input.code, now, false);
      owner = db.users.find((u) => normalizeEmail(u.email) === email);
      if (!owner) {
        const name = cleanText(input.contactName, 80, "your name");
        const phone = normalizePhone(input.phone);
        assert(phone, "Enter a valid 10-digit Indian mobile number");
        owner = { id: newId("u"), role: "client", name, email, phone: `+91 ${phone}`, createdAt: now } satisfies User;
        db.users.push(owner);
      }
      if (owner.role === "client") signIn = owner.id;
    }
    const c = createCampaign(db, input, owner.role === "client" ? owner.id : undefined, now);
    // Use the code up only once the request is valid, so a typo elsewhere doesn't cost a new code.
    if (!user) verifyOtp(db, normalizeEmail(input.email), input.code, now);
    alert = campaignAlertLines(c);
    return { id: c.id, code: c.code, callAt: c.callAt };
  });
  if (res.status === 200 && signIn) setSession(res, signIn);
  // Only alert once the request is saved; runs after the response is sent.
  if (res.ok && alert) {
    const lines = alert;
    after(() => sendWhatsAppAlert(lines));
  }
  return res;
}
