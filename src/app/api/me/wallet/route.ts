import { api } from "@/lib/server/api";
import { walletFor } from "@/lib/domain/wallet";

/** The creator's own earnings statement. Read-only: the wallet holds no money and pays nothing out. */
export async function GET() {
  return api(({ db, user }) => walletFor(db, user!.creatorId!), { role: "creator" });
}
