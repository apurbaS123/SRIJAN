"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { call, serverNow, useAction, useData } from "@/lib/client/api";
import type { BookingView, CreatorPublic } from "@/lib/domain/views";
import { ErrorNote, Guard, Loading } from "@/components/ui";
import { useMeta, type Meta } from "@/components/useMeta";
import { inr } from "@/lib/client/format";
import dynamic from "next/dynamic";

const LocationPickerModal = dynamic(
  () => import("@/components/LocationPickerModal"),
  { ssr: false }
);

const IST = 5.5 * 3600_000;

/** Bookable start times for a date, as "HH:mm", respecting notice and hours. */
function slotsFor(date: string, meta: Meta) {
  const out: string[] = [];
  for (let h = meta.dispatch.firstStartHour; h <= meta.dispatch.lastStartHour; h++) {
    for (const m of [0, 30]) {
      if (h === meta.dispatch.lastStartHour && m === 30) continue;
      const hh = `${String(h).padStart(2, "0")}:${m ? "30" : "00"}`;
      const ms = Date.parse(`${date}T${hh}:00Z`) - IST;
      if (ms >= serverNow() + meta.dispatch.minNoticeMs) out.push(hh);
    }
  }
  return out;
}

function istDate(offsetDays: number) {
  return new Date(serverNow() + IST + offsetDays * 86400_000).toISOString().slice(0, 10);
}

function BookForm({ meta }: { meta: Meta }) {
  const router = useRouter();
  const params = useSearchParams();
  const [creatorId, setCreatorId] = useState(params.get("creator") ?? "");
  const { data: chosen } = useData<CreatorPublic>(creatorId ? `/api/creators/${creatorId}` : null);

  const [packageId, setPackageId] = useState(meta.packages[0]!.id);
  const [cityId, setCityId] = useState(chosen?.cityId ?? "guwahati");
  const city = meta.cities.find((c) => c.id === cityId)!;
  const [zoneId, setZoneId] = useState(city.zones[0]!.id);
  const [address, setAddress] = useState("");
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [date, setDate] = useState(() => (slotsFor(istDate(0), meta).length ? istDate(0) : istDate(1)));
  const slots = useMemo(() => slotsFor(date, meta), [date, meta]);
  const [slot, setSlot] = useState("");
  const [brief, setBrief] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [aspect, setAspect] = useState<"9:16" | "16:9" | "1:1">("9:16");
  const { busy, error, run } = useAction();

  useEffect(() => {
    if (chosen) {
      setCityId(chosen.cityId);
      setZoneId(chosen.zoneId);
    }
  }, [chosen]);
  useEffect(() => {
    if (!slots.includes(slot)) setSlot(slots[0] ?? "");
  }, [slots, slot]);

  const pkg = meta.packages.find((p) => p.id === packageId)!;
  const gst = Math.round(pkg.price * meta.gstRate);
  const total = pkg.price + gst;
  const days = [0, 1, 2, 3, 4, 5, 6].map((d) => istDate(d)).filter((d) => slotsFor(d, meta).length);

  async function pay() {
    const b = await run(() =>
      call<BookingView>("/api/bookings", {
        packageId,
        cityId,
        zoneId,
        address,
        scheduledAt: `${date}T${slot}`,
        brief,
        aspect,
        referenceUrl,
        requestedCreatorId: creatorId || undefined,
      }),
    );
    if (b) router.push(`/bookings/${b.id}`);
  }

  return (
    <div className="container page narrow">
      <h1>Book a 1-day shoot</h1>
      {chosen && (
        <div className="card card-violet row between">
          <span>
            <b>{chosen.name}</b> gets this job first, for 5 minutes. Then everyone nearby is alerted.
          </span>
          <button className="btn btn-sm btn-ghost" onClick={() => setCreatorId("")}>
            Any creator
          </button>
        </div>
      )}

      <section className="stack">
        <h2>1. Package</h2>
        {meta.packages.map((p) => (
          <button key={p.id} className={`option${p.id === packageId ? " on" : ""}`} aria-pressed={p.id === packageId} onClick={() => setPackageId(p.id)}>
            <span className="grow stack" style={{ gap: 2 }}>
              <b>{p.name}</b>
              <span className="small muted">{p.summary}</span>
            </span>
            <b>{inr(p.price)}</b>
          </button>
        ))}
      </section>

      <section className="stack">
        <h2>2. Where</h2>
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
                  {c.name}, {c.state}
                </option>
              ))}
            </select>
          </div>
          <div className="field grow">
            <label htmlFor="zone">Area</label>
            <select id="zone" className="select" value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
              {city.zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {/* Address field ------------------------------------------------ */}
        <div className="field">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <label htmlFor="address">Full address</label>
          </div>

          {/* Map pin trigger — Rapido style */}
          <button
            id="pin-on-map"
            type="button"
            onClick={() => setShowMapPicker(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              background: "var(--violet-soft)",
              border: "1.5px dashed var(--violet)",
              borderRadius: 12,
              padding: "12px 14px",
              cursor: "pointer",
              color: "var(--violet-ink)",
              fontWeight: 700,
              fontSize: 14,
              textAlign: "left",
              transition: "background 0.15s",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="var(--violet)" />
              <circle cx="12" cy="9" r="2.5" fill="#fff" />
            </svg>
            <span>
              {address
                ? <span style={{ color: "var(--ink)" }}>{address}</span>
                : <span style={{ color: "var(--violet)" }}>📍 Pin on map</span>}
            </span>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ marginLeft: "auto", flexShrink: 0 }}>
              <path d="M6 12l4-4-4-4" stroke="var(--violet)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Editable text input below for manual tweaks */}
          <input
            id="address"
            className="input"
            placeholder="Or type: Shop / house, street, landmark"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            style={{ marginTop: 4 }}
          />
          <span className="hint">The creator sees the exact address only after accepting.</span>
        </div>

        {/* Map picker modal */}
        {showMapPicker && (
          <LocationPickerModal
            onConfirm={(addr) => setAddress(addr)}
            onClose={() => setShowMapPicker(false)}
          />
        )}
      </section>

      <section className="stack">
        <h2>3. When</h2>
        <div className="chips" role="group" aria-label="Date">
          {days.map((d, i) => (
            <button key={d} className={`chip${d === date ? " on" : ""}`} onClick={() => setDate(d)}>
              {i === 0 && d === istDate(0) ? "Today" : new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
            </button>
          ))}
        </div>
        <div className="chips" role="group" aria-label="Start time">
          {slots.map((s) => (
            <button key={s} className={`chip${s === slot ? " on" : ""}`} onClick={() => setSlot(s)}>
              {s}
            </button>
          ))}
        </div>
        <span className="hint">
          Same-day shoots need {meta.dispatch.minNoticeMs / 3600_000} hours’ notice. Start times {meta.dispatch.firstStartHour}:00–{meta.dispatch.lastStartHour}:00.
        </span>
      </section>

      <section className="stack">
        <h2>4. Brief</h2>
        <div className="field">
          <label htmlFor="brief">What should the video show?</label>
          <textarea id="brief" className="textarea" value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="e.g. Opening-week reel for our café: interiors, coffee being made, happy customers. Warm look." />
        </div>
        <div className="field">
          <label htmlFor="ref">Reference video link (optional)</label>
          <input id="ref" className="input" type="url" value={referenceUrl} onChange={(e) => setReferenceUrl(e.target.value)} placeholder="Instagram or YouTube link" />
        </div>
        <div className="chips" role="group" aria-label="Format">
          {(["9:16", "16:9", "1:1"] as const).map((a) => (
            <button key={a} className={`chip${a === aspect ? " on" : ""}`} onClick={() => setAspect(a)}>
              {a === "9:16" ? "9:16 Reel" : a === "16:9" ? "16:9 YouTube" : "1:1 Post"}
            </button>
          ))}
        </div>
      </section>

      <section className="card stack">
        <div className="row between">
          <span>{pkg.name}</span>
          <span>{inr(pkg.price)}</span>
        </div>
        <div className="row between muted">
          <span>GST ({Math.round(meta.gstRate * 100)}%)</span>
          <span>{inr(gst)}</span>
        </div>
        <hr className="divider" />
        <div className="row between strong" style={{ fontSize: 18 }}>
          <span>Total</span>
          <span>{inr(total)}</span>
        </div>
        <p className="small" style={{ color: "var(--ink-2)" }}>
          Your money is held by Srijan and released to the creator only after you approve the video. Full refund if no creator is found or you cancel before one accepts.
        </p>
      </section>

      <ErrorNote error={error} />
      <button className="btn btn-accent btn-lg btn-block" disabled={busy || !slot} onClick={pay}>
        {busy ? "Processing…" : `Pay ${inr(total)} · UPI or card (simulated)`}
      </button>
    </div>
  );
}

export default function BookPage() {
  const meta = useMeta();
  return (
    <Guard role="client">
      {meta ? (
        <Suspense fallback={<Loading />}>
          <BookForm meta={meta} />
        </Suspense>
      ) : (
        <Loading />
      )}
    </Guard>
  );
}
