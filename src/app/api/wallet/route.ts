import { api, readJson } from "@/lib/server/api";
import { creatorWallet, withdraw } from "@/lib/domain/wallet";
import { PAYOUT } from "@/lib/domain/config";

export async function GET() {
  return api(
    ({ db, user }) => {
      const c = db.creators.find((x) => x.id === user!.creatorId)!;
      return { ...creatorWallet(db, c.id), upiId: c.upiId ?? null, instantFee: PAYOUT.instantFee, minWithdrawal: PAYOUT.minWithdrawal };
    },
    { role: "creator" },
  );
}

export async function POST(req: Request) {
  const { amount, instant } = await readJson<{ amount?: number; instant?: boolean }>(req);
  return api(({ db, now, user }) => withdraw(db, user!.creatorId!, Number(amount), !!instant, now), { role: "creator" });
}
