"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { call, useAction } from "@/lib/client/api";
import { useSession } from "@/components/Session";
import { ErrorNote, Loading } from "@/components/ui";
import type { Role } from "@/lib/domain/types";

const HOME: Record<Role, string> = { client: "/bookings", creator: "/creator", ops: "/ops" };
const GROUPS: { role: Role; title: string; hint: string }[] = [
  { role: "client", title: "Clients & brands", hint: "Book shoots, follow them live, approve videos" },
  { role: "creator", title: "Creators", hint: "Go online, accept jobs, check in, deliver, get paid" },
  { role: "ops", title: "Srijan team", hint: "Dispatch board, campaigns, verification, payouts" },
];

export default function LoginPage() {
  const { session, refresh } = useSession();
  const router = useRouter();
  const { busy, error, run } = useAction();
  if (!session) return <Loading />;

  async function signIn(id: string, role: Role) {
    const ok = await run(() => call("/api/session", { userId: id }));
    if (ok) {
      await refresh();
      router.push(HOME[role]);
    }
  }

  return (
    <div className="container page">
      <div className="stack" style={{ maxWidth: 640 }}>
        <h1>Choose a demo account</h1>
        <p className="muted">
          Real sign-in (phone OTP) comes later. Tip: open a second browser window as a creator to see job alerts arrive while you book as a client.
        </p>
      </div>
      <ErrorNote error={error} />
      {GROUPS.map((g) => (
        <section key={g.role} className="stack">
          <div>
            <h2>{g.title}</h2>
            <p className="small muted">{g.hint}</p>
          </div>
          <div className="grid">
            {session.demoUsers
              .filter((u) => u.role === g.role)
              .map((u) => (
                <button
                  key={u.id}
                  className={`option${session.user?.id === u.id ? " on" : ""}`}
                  disabled={busy}
                  onClick={() => signIn(u.id, u.role)}
                >
                  <span className="stack" style={{ gap: 2 }}>
                    <b>{u.name}</b>
                    <span className="small muted">{u.note}</span>
                  </span>
                </button>
              ))}
          </div>
        </section>
      ))}
      <p className="small muted">
        New creator? <Link href="/join">Create a creator profile</Link>.
      </p>
    </div>
  );
}
