"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { call, useAction } from "@/lib/client/api";
import { ErrorNote, Loading } from "@/components/ui";
import { useMeta } from "@/components/useMeta";
import { useSession } from "@/components/Session";
import type { ServiceKey } from "@/lib/domain/types";

const GEAR = ["Mirrorless / DSLR", "4K phone", "Gimbal", "Wireless mic", "Lights", "Drone"];

export default function JoinPage() {
  const meta = useMeta();
  const router = useRouter();
  const { refresh } = useSession();
  const { busy, error, run } = useAction();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cityId, setCityId] = useState("guwahati");
  const [zoneId, setZoneId] = useState("zoo-road");
  const [bio, setBio] = useState("");
  const [services, setServices] = useState<Partial<Record<ServiceKey, string>>>({ videography: "" });
  const [gear, setGear] = useState<string[]>([]);
  const [instagram, setInstagram] = useState("");
  const [followers, setFollowers] = useState("");
  const [onDemand, setOnDemand] = useState(true);
  const [maxTravelKm, setMaxTravelKm] = useState(10);
  const [upiId, setUpiId] = useState("");
  const [aadhaarDone, setAadhaar] = useState(false);
  const [panDone, setPan] = useState(false);

  if (!meta) return <Loading />;
  const city = meta.cities.find((c) => c.id === cityId)!;
  const toggle = (k: ServiceKey) =>
    setServices((s) => {
      const next = { ...s };
      if (k in next) delete next[k];
      else next[k] = "";
      return next;
    });

  async function submit() {
    const r = await run(() =>
      call("/api/creators", {
        name,
        phone,
        cityId,
        zoneId,
        bio,
        services: Object.entries(services).map(([key, price]) => ({ key, price: price ? Number(price) : null })),
        gear,
        instagram,
        followers: followers ? Number(followers) : undefined,
        onDemand,
        maxTravelKm,
        upiId,
        aadhaarDone,
        panDone,
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
          <label htmlFor="phone">Mobile number</label>
          <input id="phone" className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91" />
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
                <button key={k} className="chip" style={k === maxTravelKm ? { background: "var(--orange)", borderColor: "var(--orange)" } : undefined} onClick={() => setMaxTravelKm(k)}>
                  {k} km
                </button>
              ))}
            </div>
          </div>
        )}
        {"influencer" in services && (
          <div className="row">
            <div className="field grow">
              <label htmlFor="ig">Instagram handle</label>
              <input id="ig" className="input" value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@" />
            </div>
            <div className="field grow">
              <label htmlFor="followers">Followers</label>
              <input id="followers" className="input" type="number" value={followers} onChange={(e) => setFollowers(e.target.value)} />
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
        <h2>Verify & get paid</h2>
        <p className="small muted">In the real app these open DigiLocker and PAN verification. Here they’re simulated.</p>
        <label className="check">
          <input type="checkbox" checked={aadhaarDone} onChange={(e) => setAadhaar(e.target.checked)} />
          Aadhaar e-KYC completed
        </label>
        <label className="check">
          <input type="checkbox" checked={panDone} onChange={(e) => setPan(e.target.checked)} />
          PAN verified
        </label>
        <div className="field">
          <label htmlFor="upi">UPI ID for payouts</label>
          <input id="upi" className="input" value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="name@okaxis" />
        </div>
      </section>

      <ErrorNote error={error} />
      <button className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={submit}>
        Submit for verification
      </button>
      <p className="tiny muted">The Srijan team reviews your profile before you can go online. Sign in as Srijan Ops to approve it in the demo.</p>
    </div>
  );
}
