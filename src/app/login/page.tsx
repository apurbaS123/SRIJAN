"use client";
import { Suspense, useState, type FormEvent, type ReactNode, type InputHTMLAttributes } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { call, useAction } from "@/lib/client/api";
import { useSession } from "@/components/Session";
import { ErrorNote, Loading, SessionError } from "@/components/ui";
import type { Role } from "@/lib/domain/types";

const HOME: Record<Role, string> = { client: "/bookings", creator: "/creator", ops: "/ops" };
const ROLE_NAME: Record<Role, string> = { client: "client / brand", creator: "creator", ops: "Srijan team" };
const NEW_PASSWORD_HINT = "At least 8 characters. Next time, sign in with your email and this password.";

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

/* ── Field parts: an underline, a label that floats up, a mark on the right ── */

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
const USER = "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z";
const MAIL = "M4 6h16v12H4zM4 7l8 6 8-6";
const KEY = "M15 7a4 4 0 1 1-3.6 5.7L9 15H7v2H4v-3l5.3-5.3A4 4 0 0 1 15 7Z";
const PHONE = "M7 3h10v18H7zM11 18h2";
const EYE = "M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z";
const EYE_OFF = "M3 3l18 18M10.6 10.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-1.2M6.5 6.9C3.9 8.5 2 12 2 12s3.6 6 10 6c1.8 0 3.4-.5 4.7-1.2M9.9 6.2A9.6 9.6 0 0 1 12 6c6.4 0 10 6 10 6a18 18 0 0 1-2.8 3.4";

type FieldProps = { id: string; label: string; icon?: ReactNode; hint?: string; children?: ReactNode } & InputHTMLAttributes<HTMLInputElement>;

function Field({ id, label, icon, hint, children, ...input }: FieldProps) {
  return (
    <div className="auth-field">
      <input id={id} placeholder=" " {...input} />
      <label htmlFor={id}>{label}</label>
      {icon && <span className="auth-icon">{icon}</span>}
      {children}
      {hint && <span className="auth-hint">{hint}</span>}
    </div>
  );
}

function Password({ id, label, value, onChange, autoComplete, hint }: { id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: "current-password" | "new-password"; hint?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <Field id={id} label={label} hint={hint} type={shown ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)}>
      <button type="button" className="auth-icon" aria-pressed={shown} aria-label={shown ? "Hide password" : "Show password"} onClick={() => setShown(!shown)}>
        <Icon d={shown ? EYE_OFF : EYE} />
      </button>
    </Field>
  );
}

/** The card: the form on one side, the blade and its welcome on the other. */
function AuthCard({ mode, art, children }: { mode: "in" | "up"; art: ReactNode; children: ReactNode }) {
  return (
    <div className="auth-wrap">
      <div className="auth-card" data-mode={mode}>
        <div className="auth-seam" aria-hidden="true" />
        <div className="auth-blade" aria-hidden="true">
          <div className="auth-blade__body">{art}</div>
        </div>
        <div className="auth-panel">{children}</div>
      </div>
    </div>
  );
}

function Welcome({ title, tail, body }: { title: string; tail: string; body: string }) {
  return (
    <div className="auth-fade" key={tail}>
      <span className="auth-eyebrow">Srijan</span>
      <h2 className="auth-welcome">
        {title} <em>{tail}</em>
      </h2>
      <p>{body}</p>
    </div>
  );
}

function SignIn() {
  const { session, error: sessionError, refresh } = useSession();
  const router = useRouter();
  const next = useSearchParams().get("next");
  const { busy, error, setError, run } = useAction();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState<"password" | "code" | "name" | "newPassword">("password");
  const [newRole, setNewRole] = useState<Role>("client");
  if (!session) return sessionError ? <SessionError /> : <Loading />;

  async function finish(role: Role) {
    await refresh();
    router.push(destination(role, next));
  }

  async function sendCode() {
    if (await run(() => call("/api/session/otp", { email }))) {
      setPassword("");
      setStep("code");
    }
  }

  async function signInWithPassword() {
    const r = await run(() => call<{ role: Role }>("/api/session/password", { email, password }));
    if (r) await finish(r.role);
  }

  async function signInWithCode() {
    const r = await run(() =>
      call<{ needsName?: boolean; needsPassword?: boolean; newRole?: Role; role?: Role }>("/api/session", {
        email,
        code,
        ...(password ? { password } : {}),
        ...(step === "name" ? { name, phone } : {}),
      }),
    );
    if (r?.needsName) {
      setNewRole(r.newRole ?? "client");
      setStep("name");
    } else if (r?.needsPassword) {
      setStep("newPassword");
    } else if (r?.role) {
      await finish(r.role);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void (step === "password" ? signInWithPassword() : signInWithCode());
  }

  function startOver() {
    setStep("password");
    setCode("");
    setPassword("");
    setError(null);
  }

  async function signOut() {
    await run(() => call("/api/session", undefined, "DELETE"));
    await refresh();
  }

  const user = session.user;
  if (user)
    return (
      <div className="container page page-no-glass">
        <AuthCard mode="in" art={<Welcome title="Good to see you" tail="again." body="Your bookings, your creators and your campaigns are exactly where you left them." />}>
          <h1 className="auth-title">You’re signed in</h1>
          <p className="auth-note">
            {user.name} · {ROLE_NAME[user.role]} account
          </p>
          <ErrorNote error={error} />
          <Link href={destination(user.role, next)} className="auth-submit auth-submit-link">
            Continue
          </Link>
          <p className="auth-foot">
            Not you?
            <button type="button" className="auth-link" disabled={busy} onClick={signOut}>
              Sign out to switch account
            </button>
          </p>
        </AuthCard>
      </div>
    );

  const needsNewPassword = step === "newPassword" || step === "name";
  const ready =
    step === "password"
      ? !!email && !!password
      : !!code && (step !== "name" || (!!name.trim() && !!phone.trim())) && (!needsNewPassword || !!password);

  const art =
    step === "password" ? (
      <Welcome title="Welcome" tail="back." body="Your bookings, your creators and your campaigns are exactly where you left them." />
    ) : step === "name" ? (
      <Welcome title="Start the" tail="first page." body="One account for every booking, every campaign and every device you own." />
    ) : (
      <Welcome title="Check your" tail="inbox." body="A 6-digit code is on its way. It’s good for a few minutes, so there’s no rush." />
    );

  return (
    <div className="container page page-no-glass">
      <AuthCard mode={step === "password" ? "in" : "up"} art={art}>
        <form onSubmit={submit}>
          <h1 className="auth-title">{step === "name" ? (newRole === "ops" ? "Create team account" : "Create account") : "Sign in"}</h1>
          <p className="auth-note">
            {step === "password"
              ? "Clients, brands, creators and the Srijan team all sign in here. We’ll open the right dashboard for your account."
              : `We’ve emailed a 6-digit code to ${email}.`}
          </p>

          <div className="auth-fields">
            <Field id="email" label="Email address" icon={<Icon d={MAIL} />} type="email" autoComplete="email" value={email} disabled={step !== "password"} onChange={(e) => setEmail(e.target.value)} />

            {step === "password" && <Password id="password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />}

            {step !== "password" && (
              <Field id="code" label="6-digit code" icon={<Icon d={KEY} />} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
            )}

            {step === "code" && <Password id="new-password" label="New password (optional)" value={password} onChange={setPassword} autoComplete="new-password" hint="Forgot your password? Set a new one here. Otherwise leave this blank." />}

            {step === "newPassword" && (
              <>
                <p className="auth-note">Your account doesn’t have a password yet. Add one to finish signing in.</p>
                <Password id="new-password" label="Choose a password" value={password} onChange={setPassword} autoComplete="new-password" hint={NEW_PASSWORD_HINT} />
              </>
            )}

            {step === "name" && (
              <>
                <p className="auth-note">
                  {newRole === "ops" ? (
                    "Welcome to the Srijan team. Add your name and number to finish setting up — you’ll go straight to the ops dashboard."
                  ) : (
                    <>
                      New here? We’ll create a client account for booking services and brand campaigns. Are you a creator? <Link href="/join">Create a creator profile</Link> instead.
                    </>
                  )}
                </p>
                <Field id="name" label="Full name" icon={<Icon d={USER} />} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
                <Field
                  id="phone"
                  label="Mobile number"
                  icon={<Icon d={PHONE} />}
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  hint={newRole === "ops" ? "So creators and clients can reach the team." : "So your creator can reach you on the day of your service."}
                />
                <Password id="new-password" label="Choose a password" value={password} onChange={setPassword} autoComplete="new-password" hint={NEW_PASSWORD_HINT} />
              </>
            )}
          </div>

          <div className="auth-row">
            {step === "password" ? (
              <>
                <span className="muted">First time here, or forgot your password?</span>
                <button type="button" className="auth-link" disabled={busy || !email} onClick={sendCode}>
                  Email me a code
                </button>
              </>
            ) : (
              <button type="button" className="auth-link" disabled={busy} onClick={startOver}>
                Change email
              </button>
            )}
          </div>

          <ErrorNote error={error} />

          <button type="submit" className="auth-submit" disabled={busy || !ready}>
            {step === "name" ? (newRole === "ops" ? "Create team account" : "Create account") : "Sign in"}
          </button>

          <p className="auth-foot">
            New creator?
            <Link href="/join">Create a creator profile</Link>
          </p>
        </form>
      </AuthCard>
    </div>
  );
}
