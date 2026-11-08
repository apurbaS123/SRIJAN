"use client";
import { useEffect, useState } from "react";
import { call, serverNow, useAction } from "@/lib/client/api";
import { BrandLogos } from "@/components/BrandLogos";
import { ErrorNote, Loading } from "@/components/ui";
import { when } from "@/lib/client/format";
import { useSession } from "@/components/Session";
import Link from "next/link";

const GOALS = ["Product launch", "Brand awareness", "Store footfall", "Online sales", "App installs", "Event promotion"];
const REGIONS = ["Assam", "Meghalaya", "Arunachal Pradesh", "Nagaland", "Manipur", "Mizoram", "Tripura", "Sikkim", "All 8 NE states", "Pan-India"];
const BUDGETS = ["₹1 – 3 lakh", "₹3 – 10 lakh", "₹10 lakh +", "Not sure yet"];
const SLOTS = ["11:00", "14:30", "17:00"];
const IST = 5.5 * 3600_000;

function nextWorkdays(n: number) {
  const out: string[] = [];
  for (let d = 1; out.length < n && d < 14; d++) {
    const day = new Date(serverNow() + IST + d * 86400_000);
    if (day.getUTCDay() !== 0) out.push(day.toISOString().slice(0, 10));
  }
  return out;
}

function Reminder({ id, text }: { id: string; text: string }) {
  return text ? <p id={`${id}-reminder`} className="field-reminder">{text}</p> : null;
}

export default function BrandsPage() {
  const { session, refresh } = useSession();
  const signedIn = !!session?.user;
  const days = nextWorkdays(5);
  const [form, setForm] = useState({
    brandName: "",
    contactName: session?.user?.role === "client" ? session.user.name : "",
    email: session?.user?.email ?? "",
    phone: session?.user?.phone ?? "",
    goal: GOALS[0]!,
    regions: ["Assam"],
    budgetRange: BUDGETS[1]!,
    day: days[0]!,
    slot: SLOTS[1]!,
    callMode: "video" as "video" | "phone" | "office",
  });
  const [done, setDone] = useState<{ code: string; callAt: number } | null>(null);
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  // Reminders stay hidden until someone tries to book (or asks for a code with no email).
  const [remind, setRemind] = useState(false);
  const [remindEmail, setRemindEmail] = useState(false);
  const { busy, error, setError, run } = useAction();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const set =<K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const blank = {
    brand: form.brandName.trim() ? "" : "Please enter your brand or company name.",
    cname: form.contactName.trim() ? "" : "Please enter your name.",
    email: form.email.trim() ? "" : "Please enter your work email.",
    phone: form.phone.trim() ? "" : "Please enter your mobile number.",
    otp: signedIn || otp.trim() ? "" : otpSent ? "Please enter the 6-digit code we emailed you." : "Verify your email first. Tap Send code above, then enter the 6-digit code here.",
  };
  type Box = keyof typeof blank;
  const firstBlank = (Object.keys(blank) as Box[]).find((k) => blank[k]);
  const reminder = (k: Box) => (remind || (k === "email" && remindEmail) ? blank[k] : "");
  const box = (k: Box, cls = "input") => ({
    className: reminder(k) ? `${cls} invalid` : cls,
    "aria-invalid": !!reminder(k),
    "aria-describedby": reminder(k) ? `${k}-reminder` : undefined,
  });

  function showBox(id: string) {
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus({ preventScroll: true });
  }

  async function sendCode() {
    if (blank.email) {
      setRemindEmail(true);
      showBox("email");
      return;
    }
    if (await run(() => call("/api/session/otp", { email: form.email }))) setOtpSent(true);
  }

  async function submit() {
    if (firstBlank) {
      setError(null);
      setRemind(true);
      // Before a code is sent the code box is locked, so point at the button that sends one.
      showBox(firstBlank === "otp" && !otpSent ? "send-code" : firstBlank);
      return;
    }
    const r = await run(() =>
      call<{ code: string; callAt: number }>("/api/campaigns", {
        brandName: form.brandName,
        contactName: form.contactName,
        email: form.email,
        phone: form.phone,
        goal: form.goal,
        regions: form.regions,
        budgetRange: form.budgetRange,
        callAt: `${form.day}T${form.slot}`,
        callMode: form.callMode,
        ...(signedIn ? {} : { code: otp }),
      }),
    );
    if (r) {
      setDone(r);
      if (!signedIn) void refresh();
    }
  }

  // Dates depend on the current time, so render only in the browser.
  if (!mounted) return <Loading />;

  if (done)
    return (
      <div className="container page narrow">
        <div className="card stack">
          <h1>Call booked</h1>
          <p>
            Your campaign manager will call you on <b>{when(done.callAt)}</b>. Reference <b>{done.code}</b>.
          </p>
          <p className="muted small">What happens next: proposal and creator shortlist within 3 working days → sign online and pay 50% → approve every post → results report.</p>
          <p className="small">
            Follow your request any time in <Link href="/bookings">My bookings</Link>.
          </p>
        </div>
      </div>
    );

  return (
    <>
    <div className="container page narrow">
      <span className="tag" style={{ background: "var(--violet)", color: "#fff", alignSelf: "flex-start" }}>
        For brands
      </span>
      <h1>Plan an influencer campaign with us</h1>
      <p className="muted">Book a free 30-minute call. A campaign manager handles everything after that — creator shortlist, contracts, content checks and the final report.</p>

      <section className="card stack">
        <h2>About your brand</h2>
        <div className="field">
          <label htmlFor="brand">Brand or company name</label>
          <input id="brand" {...box("brand")} value={form.brandName} onChange={(e) => set("brandName", e.target.value)} />
          <Reminder id="brand" text={reminder("brand")} />
        </div>
        <div className="field">
          <label htmlFor="cname">Your name</label>
          <input id="cname" {...box("cname")} value={form.contactName} onChange={(e) => set("contactName", e.target.value)} />
          <Reminder id="cname" text={reminder("cname")} />
        </div>
        <div className="row contact-row">
          <div className="field grow">
            <label htmlFor="email">Work email</label>
            {signedIn ? (
              <input id="email" {...box("email")} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            ) : (
              <div className="row">
                <input id="email" {...box("email", "input grow")} type="email" autoComplete="email" placeholder="you@brand.com" value={form.email} onChange={(e) => { set("email", e.target.value); setOtpSent(false); setOtp(""); }} />
                <button id="send-code" className="btn btn-sm" disabled={busy} onClick={sendCode}>
                  {otpSent ? "Resend code" : "Send code"}
                </button>
              </div>
            )}
            <Reminder id="email" text={reminder("email")} />
          </div>
          <div className="field grow">
            <label htmlFor="phone">Mobile number</label>
            <input id="phone" {...box("phone")} type="tel" autoComplete="tel" placeholder="+91" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            <Reminder id="phone" text={reminder("phone")} />
          </div>
        </div>
        {!signedIn && (otpSent || remind) && (
          <div className="field">
            <label htmlFor="otp">{otpSent ? "Code sent to your email" : "Email verification code"}</label>
            <input id="otp" {...box("otp")} disabled={!otpSent} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6-digit code" value={otp} onChange={(e) => setOtp(e.target.value)} />
            <Reminder id="otp" text={reminder("otp")} />
          </div>
        )}
        {!signedIn && (
          <p className="small muted">
            We email you a code to verify your address and create your brand account with it. Already have one? <Link href="/login?next=/brands">Sign in</Link>.
          </p>
        )}
      </section>

      <section className="card stack">
        <h2>Campaign</h2>
        <span className="label">Goal</span>
        <div className="chips" role="group" aria-label="Goal">
          {GOALS.map((g) => (
            <button key={g} className={`chip${form.goal === g ? " on-violet" : ""}`} onClick={() => set("goal", g)}>
              {g}
            </button>
          ))}
        </div>
        <span className="label">Where are your customers?</span>
        <div className="chips" role="group" aria-label="Regions">
          {REGIONS.map((r) => {
            const on = form.regions.includes(r);
            return (
              <button key={r} aria-pressed={on} className={`chip${on ? " on-violet" : ""}`} onClick={() => set("regions", on ? form.regions.filter((x) => x !== r) : [...form.regions, r])}>
                {r}
              </button>
            );
          })}
        </div>
        <div className="field">
          <label htmlFor="budget">Budget</label>
          <select id="budget" className="select" value={form.budgetRange} onChange={(e) => set("budgetRange", e.target.value)}>
            {BUDGETS.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </div>
      </section>

      <section className="card stack">
        <h2>Pick a time for the call</h2>
        <div className="chips" role="group" aria-label="Day">
          {days.map((d) => (
            <button key={d} className={`chip${form.day === d ? " on-violet" : ""}`} onClick={() => set("day", d)}>
              {new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
            </button>
          ))}
        </div>
        <div className="chips" role="group" aria-label="Time">
          {SLOTS.map((s) => (
            <button key={s} className={`chip${form.slot === s ? " on-violet" : ""}`} onClick={() => set("slot", s)}>
              {s}
            </button>
          ))}
        </div>
        <div className="chips" role="group" aria-label="Call type">
          {(["video", "phone", "office"] as const).map((m) => (
            <button key={m} className={`chip${form.callMode === m ? " on" : ""}`} onClick={() => set("callMode", m)}>
              {m === "video" ? "Video call" : m === "phone" ? "Phone" : "Office visit"}
            </button>
          ))}
        </div>
      </section>

      <ErrorNote error={error ?? (remind && firstBlank ? (firstBlank === "otp" ? "Please verify your email with the code before booking your call." : "Please fill in the boxes marked in red.") : null)} />
      <button className="btn btn-violet btn-lg btn-block" disabled={busy} onClick={submit}>
        Book strategy call
      </button>
    </div>
    <BrandLogos heading={false} />
    </>
  );
}
