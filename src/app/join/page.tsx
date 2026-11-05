"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { call, useAction } from "@/lib/client/api";
import { ErrorNote, Loading } from "@/components/ui";
import { useMeta } from "@/components/useMeta";
import { useSession } from "@/components/Session";
import { PasswordField } from "@/components/PasswordField";
import { SOCIAL_PLATFORMS } from "@/lib/domain/config";
import type { ServiceKey, SocialPlatform } from "@/lib/domain/types";

/** What a creator might work with, by service. Optional: shown on their profile and to the Srijan team. */
const GEAR: Record<ServiceKey, string[]> = {
  videography: ["Mirrorless / DSLR", "Cinema camera", "4K phone", "Gimbal", "Tripod", "Wireless mic", "Lights", "Drone"],
  photography: ["Mirrorless / DSLR", "Prime lens", "Zoom lens", "Tripod", "Flash", "Softbox", "Reflector", "Drone"],
  video_editing: ["Editing PC / laptop", "Premiere Pro", "DaVinci Resolve", "Final Cut Pro", "After Effects", "CapCut"],
  graphic_design: ["Photoshop", "Illustrator", "Figma", "Canva", "Drawing tablet"],
  content_writing: ["Laptop", "Grammarly", "SEO tool"],
  voice_over: ["Studio microphone", "Audio interface", "Pop filter", "Home booth", "Audio editing software"],
  social_media: ["Scheduling tool", "Meta Business Suite", "Canva", "Analytics tool"],
  influencer: ["4K phone", "Ring light", "Tripod", "Wireless mic"],
};

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
  const [services, setServices] = useState<ServiceKey[]>(["videography"]);
  const [gear, setGear] = useState<string[]>([]);
  const [platform, setPlatform] = useState<SocialPlatform>("instagram");
  const [socialUrl, setSocialUrl] = useState("");
  const [followers, setFollowers] = useState("");
  const [onDemand, setOnDemand] = useState(true);
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [password, setPassword] = useState("");

  if (!meta) return <Loading />;
  const city = meta.cities.find((c) => c.id === cityId)!;
  const toggle = (k: ServiceKey) => setServices((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  // Follows the menu's order, so groups don't jump around as services are ticked.
  const chosen = meta.services.filter((s) => services.includes(s.key));

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
        password,
        cityId,
        zoneId,
        bio,
        services: services.map((key) => ({ key })),
        // Gear picked under a service they later unticked doesn't count.
        gear: gear.filter((g) => services.some((k) => GEAR[k].includes(g))),
        social: { platform, url: socialUrl },
        followers: followers ? Number(followers) : undefined,
        onDemand,
      }),
    );
    if (r) {
      await refresh();
      router.push("/creator/payout?welcome=1");
    }
  }

  return (
    <div className="container page narrow">
      <h1>Join Srijan as a creator</h1>
      <p className="muted">List everything you do. Jobs through Srijan pay 80% of the package price.</p>

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
        <PasswordField id="new-password" label="Choose a password" value={password} onChange={setPassword} autoComplete="new-password" hint="At least 8 characters. Next time, sign in with your email and this password." />
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
              <input type="checkbox" checked={services.includes(s.key)} onChange={() => toggle(s.key)} />
              {s.label.replace(/s$/, "")}
            </label>
          ))}
        </div>
        {(services.includes("videography") || services.includes("video_editing")) && (
          <div className="card card-dark stack">
            <label className="row between strong">
              Get job alerts
              <input type="checkbox" checked={onDemand} onChange={(e) => setOnDemand(e.target.checked)} style={{ width: 22, height: 22, accentColor: "var(--orange)" }} />
            </label>
            <p className="small muted">Get alerts when a client books a job in your field. Fixed Srijan prices — you keep 80%. You have 5 minutes to accept each alert, and the first to accept gets the job.</p>
          </div>
        )}
        {chosen.length > 0 && (
          <div className="stack">
            <span className="label">Your gear (optional)</span>
            {chosen.map((s) => (
              <div key={s.key} className="stack" style={{ gap: 6 }}>
                <span className="small muted">{s.label.replace(/s$/, "")}</span>
                <div className="chips">
                  {GEAR[s.key].map((g) => {
                    const on = gear.includes(g);
                    return (
                      <button key={g} type="button" aria-pressed={on} className={`chip${on ? " on" : ""}`} onClick={() => setGear(on ? gear.filter((x) => x !== g) : [...gear, g])}>
                        {g}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
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

      <ErrorNote error={error} />
      <button className="btn btn-primary btn-lg btn-block" disabled={busy || !code || !password} onClick={submit}>
        Submit for verification
      </button>
      <p className="tiny muted">Next, you’ll link your bank account or UPI ID. The Srijan team reviews your profile before you can go online.</p>
    </div>
  );
}
