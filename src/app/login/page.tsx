"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { call, useAction } from "@/lib/client/api";
import { useSession } from "@/components/Session";
import { ErrorNote, Loading } from "@/components/ui";
import type { Role } from "@/lib/domain/types";

const HOME: Record<Role, string> = { client: "/bookings", creator: "/creator", ops: "/ops" };
const ROLE_NAME: Record<Role, string> = { client: "client / brand", creator: "creator", ops: "Srijan team" };

/** Where to go after signing in: the page that sent you here if your role can open it, else your home. */
function destination(role: Role, next: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next === "/login") return HOME[role];
  const under = (p: string) => next === p || next.startsWith(`${p}/`);
  if (under("/ops")) return role === "ops" ? next : HOME[role];
  if (under("/creator")) return role === "creator" ? next : HOME[role];
  if (under("/book") || under("/bookings")) return role === "client" ? next : HOME[role];
  return next;
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SignIn />
    </Suspense>
  );
}

function SignIn() {
  const { session, refresh } = useSession();
  const router = useRouter();
  const next = useSearchParams().get("next");
  const { busy, error, run } = useAction();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [step, setStep] = useState<"phone" | "code" | "name">("phone");
  if (!session) return <Loading />;

  async function sendCode() {
    if (await run(() => call("/api/session/otp", { phone }))) setStep("code");
  }

  async function verify() {
    const r = await run(() =>
      call<{ needsName?: boolean; role?: Role }>("/api/session", { phone, code, ...(step === "name" ? { name } : {}) }),
    );
    if (r?.needsName) setStep("name");
    else if (r?.role) {
      await refresh();
      router.push(destination(r.role, next));
    }
  }

  async function signOut() {
    await run(() => call("/api/session", undefined, "DELETE"));
    await refresh();
  }

  const user = session.user;
  if (user)
    return (
      <div className="container page">
        <section className="card stack" style={{ maxWidth: 420 }}>
          <h1>You’re signed in</h1>
          <p className="muted">
            {user.name} · {ROLE_NAME[user.role]} account
          </p>
          <ErrorNote error={error} />
          <div className="row">
            <Link href={destination(user.role, next)} className="btn btn-primary">
              Continue
            </Link>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={signOut}>
              Sign out to switch account
            </button>
          </div>
        </section>
      </div>
    );

  return (
    <div className="container page">
      <section className="card stack" style={{ maxWidth: 420 }}>
        <h1>Sign in</h1>
        <p className="muted small">
          Clients, brands, creators and the Srijan team all sign in here. We’ll send a 6-digit code to your WhatsApp and open the right dashboard for your account.
        </p>
        <div className="field">
          <label htmlFor="phone">WhatsApp number</label>
          <input id="phone" className="input" type="tel" autoComplete="tel" value={phone} disabled={step !== "phone"} onChange={(e) => setPhone(e.target.value)} placeholder="+91" />
        </div>
        {step !== "phone" && (
          <div className="field">
            <label htmlFor="code">Code sent to your WhatsApp</label>
            <input id="code" className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code" />
          </div>
        )}
        {step === "name" && (
          <>
            <p className="small muted">
              New here? We’ll create a client account for booking shoots and brand campaigns. Are you a creator?{" "}
              <Link href="/join">Create a creator profile</Link> instead.
            </p>
            <div className="field">
              <label htmlFor="name">Your name</label>
              <input id="name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </>
        )}
        <ErrorNote error={error} />
        {step === "phone" ? (
          <button className="btn btn-primary" disabled={busy || !phone} onClick={sendCode}>
            Send code
          </button>
        ) : (
          <div className="row">
            <button className="btn btn-primary" disabled={busy || !code || (step === "name" && !name.trim())} onClick={verify}>
              {step === "name" ? "Create account" : "Sign in"}
            </button>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { setStep("phone"); setCode(""); }}>
              Change number
            </button>
          </div>
        )}
      </section>
      <p className="small muted">
        New creator? <Link href="/join">Create a creator profile</Link>.
      </p>
    </div>
  );
}
