"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { call, useAction } from "@/lib/client/api";
import { ErrorNote, Loading } from "@/components/ui";
import { useMeta } from "@/components/useMeta";
import { useSession } from "@/components/Session";
import { SOCIAL_PLATFORMS } from "@/lib/domain/config";
import type { ServiceKey, SocialPlatform } from "@/lib/domain/types";

const GEAR = ["Mirrorless / DSLR", "4K phone", "Gimbal", "Wireless mic", "Lights", "Drone"];

export default function JoinPage() {
  const meta = useMeta();
  const router = useRouter();
  const { refresh } = useSession();
  const { busy, error, run } = useAction();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cityId, setCityId] = useState("guwahati");
  const [zoneId, setZoneId] = useState("zoo-road");
  const [bio, setBio] = useState("");
  const [services, setServices] = useState<Partial<Record<ServiceKey, string>>>({ videography: "" });
  const [gear, setGear] = useState<string[]>([]);
  const [platform, setPlatform] = useState<SocialPlatform>("instagram");
  const [socialUrl, setSocialUrl] = useState("");
  const [followers, setFollowers] = useState("");
  const [onDemand, setOnDemand] = useState(true);
  const [maxTravelKm, setMaxTravelKm] = useState(10);
  const [upiId, setUpiId] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);

  if (!meta) return <Loading />;
  const city = meta.cities.find((c) => c.id === cityId)!;
  const toggle = (k: ServiceKey) =>
    setServices((s) => {
      const next = { ...s };
      if (k in next) delete next[k];
      else next[k] = "";
      return next;
    });

  async function sendCode() {
    if (await run(() => call("/api/session/otp", { email }))) setCodeSent(true);
  }

  async function submit() {
    const r = await run(() =>
      call("/api/creators", {
        name,
        email,
        phone,
        code,
        cityId,
        zoneId,
        bio,
        services: Object.entries(services).map(([key, price]) => ({ key, price: price ? Number(price) : null })),
        gear,
        social: { platform, url: socialUrl },
        followers: followers ? Number(followers) : undefined,
        onDemand,
        maxTravelKm,
        upiId,
      }),
    );
    if (r) {
      await refresh();
      router.push("/creator");
    }
  }

  return (
    <div className="container page narrow">
      <h1>Join Srijan as a creator</h1>
      <p className="muted">List everything you do. Each service gets its own price on your profile. Same-day shoots pay 80% of the package price.</p>

      <section className="card stack">
        <h2>You</h2>
        <div className="field">
          <label htmlFor="name">Full name</label>
          <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <div className="row">
            <input id="email" className="input grow" type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setCodeSent(false); setCode(""); }} placeholder="you@example.com" />
            <button className="btn btn-sm" disabled={busy || !email} onClick={sendCode}>
              {codeSent ? "Resend code" : "Send code"}
            </button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="code">Code sent to your email</label>
          <input id="code" className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code" />
        </div>
        <div className="field">
          <label htmlFor="phone">Mobile number</label>
          <input id="phone" className="input" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91" />
          <span className="small muted">Clients and the Srijan team use it to reach you about jobs.</span>
        </div>
        <div className="row">
          <div className="field grow">
            <label htmlFor="city">City</label>
            <select
              id="city"
              className="select"
              value={cityId}
              onChange={(e) => {
                setCityId(e.target.value);
                setZoneId(meta.cities.find((c) => c.id === e.target.value)!.zones[0]!.id);
              }}
            >
              {meta.cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field grow">
            <label htmlFor="zone">Base area</label>
            <select id="zone" className="select" value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
              {city.zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="bio">Short bio</label>
          <textarea id="bio" className="textarea" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="What you’re great at, in one or two lines" />
        </div>
      </section>

      <section className="card stack">
        <h2>What do you offer?</h2>
        <div className="grid">
          {meta.services.map((s) => (
            <label key={s.key} className="check">
              <input type="checkbox" checked={s.key in services} onChange={() => toggle(s.key)} />
              {s.label.replace(/s$/, "")}
            </label>
          ))}
        </div>
        {Object.keys(services)
          .filter((k) => k !== "videography" && k !== "influencer")
          .map((k) => (
            <div key={k} className="field">
              <label htmlFor={`price-${k}`}>{meta.services.find((s) => s.key === k)?.label.replace(/s$/, "")} · your price (₹, blank = quote on request)</label>
              <input id={`price-${k}`} className="input" type="number" min={0} value={services[k as ServiceKey]} onChange={(e) => setServices((s) => ({ ...s, [k]: e.target.value }))} />
            </div>
          ))}
        {"videography" in services && (
          <div className="card card-dark stack">
            <label className="row between strong">
              Take same-day shoot jobs
              <input type="checkbox" checked={onDemand} onChange={(e) => setOnDemand(e.target.checked)} style={{ width: 22, height: 22, accentColor: "var(--orange)" }} />
            </label>
            <p className="small muted">Get alerts when a client near you books a shoot. Fixed Srijan prices — you keep 80%. You have 5 minutes to accept each alert.</p>
            <span className="label" style={{ color: "#c9cbd3" }}>How far will you travel?</span>
            <div className="chips">
              {[5, 10, 15, 20, 25].map((k) => (
                <button key={k} className="chip" style={k === maxTravelKm ? { background: "var(--orange)", borderColor: "var(--orange)", color: "#fff" } : undefined} onClick={() => setMaxTravelKm(k)}>
                  {k} km
                </button>
              ))}
            </div>
          </div>
        )}
        <span className="label">Your gear</span>
        <div className="chips">
          {GEAR.map((g) => {
            const on = gear.includes(g);
            return (
              <button key={g} aria-pressed={on} className={`chip${on ? " on" : ""}`} onClick={() => setGear(on ? gear.filter((x) => x !== g) : [...gear, g])}>
                {g}
              </button>
            );
          })}
        </div>
      </section>

      <section className="card stack">
        <h2>Your main social media account</h2>
        <p className="small muted">Link the account that best shows your work. It appears on your public profile, and the Srijan team checks it when reviewing your profile.</p>
        <div className="chips" role="group" aria-label="Site">
          {SOCIAL_PLATFORMS.map((p) => (
            <button key={p.key} aria-pressed={platform === p.key} className={`chip${platform === p.key ? " on" : ""}`} onClick={() => setPlatform(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="row">
          <div className="field grow">
            <label htmlFor="social">{SOCIAL_PLATFORMS.find((p) => p.key === platform)?.label} profile link</label>
            <input id="social" className="input" type="url" inputMode="url" value={socialUrl} onChange={(e) => setSocialUrl(e.target.value)} placeholder={SOCIAL_PLATFORMS.find((p) => p.key === platform)?.example} />
          </div>
          <div className="field" style={{ maxWidth: 160 }}>
            <label htmlFor="followers">Followers</label>
            <input id="followers" className="input" type="number" min={0} value={followers} onChange={(e) => setFollowers(e.target.value)} placeholder="Optional" />
          </div>
        </div>
      </section>

      <section className="card stack">
        <h2>Verify & get paid</h2>
        <p className="small muted">After you submit, the Srijan team will contact you to check your Aadhaar and PAN before your profile goes live.</p>
        <div className="field">
          <label htmlFor="upi">UPI ID for payouts</label>
          <input id="upi" className="input" value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="name@okaxis" />
        </div>
      </section>

      <ErrorNote error={error} />
      <button className="btn btn-primary btn-lg btn-block" disabled={busy || !code} onClick={submit}>
        Submit for verification
      </button>
      <p className="tiny muted">The Srijan team reviews your profile before you can go online.</p>
    </div>
  );
}
