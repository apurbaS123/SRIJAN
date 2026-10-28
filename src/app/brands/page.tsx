"use client";
import { useEffect, useState } from "react";
import { call, serverNow, useAction } from "@/lib/client/api";
import { ErrorNote, Loading } from "@/components/ui";
import { when } from "@/lib/client/format";
import { useSession } from "@/components/Session";

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

export default function BrandsPage() {
  const { session } = useSession();
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
  const { busy, error, run } = useAction();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const set =<K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
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
      }),
    );
    if (r) setDone(r);
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
        </div>
      </div>
    );

  return (
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
          <input id="brand" className="input" value={form.brandName} onChange={(e) => set("brandName", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="cname">Your name</label>
          <input id="cname" className="input" value={form.contactName} onChange={(e) => set("contactName", e.target.value)} />
        </div>
        <div className="row">
          <div className="field grow">
            <label htmlFor="email">Work email</label>
            <input id="email" className="input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div className="field grow">
            <label htmlFor="phone">WhatsApp number</label>
            <input id="phone" className="input" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
        </div>
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

      <ErrorNote error={error} />
      <button className="btn btn-violet btn-lg btn-block" disabled={busy} onClick={submit}>
        Book strategy call
      </button>
    </div>
  );
}
