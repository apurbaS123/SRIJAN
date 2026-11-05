"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { call, serverNow, useAction, useData } from "@/lib/client/api";
import type { ShootPackage } from "@/lib/domain/config";
import type { ServiceKey } from "@/lib/domain/types";
import type { BookingView, CreatorPublic } from "@/lib/domain/views";
import { openCheckout, type CheckoutDetails } from "@/lib/client/razorpay";
import { useSession } from "@/components/Session";
import { ErrorNote, Loading } from "@/components/ui";
import { TimeWheel } from "@/components/TimeWheel";
import { useMeta, type Meta } from "@/components/useMeta";
import { inr } from "@/lib/client/format";
import dynamic from "next/dynamic";

const LocationPickerModal = dynamic(
  () => import("@/components/LocationPickerModal"),
  { ssr: false }
);

const IST = 5.5 * 3600_000;
const SLOT_MINUTES = 5;
/** Where the wheel starts, so nobody books midnight just by not touching it. */
const DEFAULT_SLOT = "10:00";

/** Bookable start times for a date, as "HH:mm", respecting notice and hours. */
function slotsFor(date: string, meta: Meta, noticeMs: number) {
  const out: string[] = [];
  for (let h = meta.dispatch.firstStartHour; h <= meta.dispatch.lastStartHour; h++) {
    for (let m = 0; m < 60; m += SLOT_MINUTES) {
      const hh = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const ms = Date.parse(`${date}T${hh}:00Z`) - IST;
      if (ms >= serverNow() + noticeMs) out.push(hh);
    }
  }
  return out;
}

function istDate(offsetDays: number) {
  return new Date(serverNow() + IST + offsetDays * 86400_000).toISOString().slice(0, 10);
}

/** What a guest filled in, kept for this tab while they sign in, so they come back to the same order. */
const DRAFT_KEY = "srijan.book.draft";
interface Draft {
  creatorId: string;
  cityId: string;
  zoneId: string;
  address: string;
  packageIds: string[];
  date: string;
  slot: string;
  brief: string;
  referenceUrl: string;
  aspect: "9:16" | "16:9" | "1:1";
}

/** The saved order, if there is one that still makes sense. */
function readDraft(meta: Meta): Draft | null {
  try {
    const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "null") as Draft | null;
    if (!draft) return null;
    const city = meta.cities.find((c) => c.id === draft.cityId);
    if (!city?.zones.some((z) => z.id === draft.zoneId)) return null;
    return draft;
  } catch {
    return null;
  }
}

/** The services as a menu: one drop-down per kind of creator, with the deliverable under each name. Tap to add or remove. */
function ServiceMenu({ meta, selected, onToggle }: { meta: Meta; selected: ShootPackage[]; onToggle: (id: string) => void }) {
  const sections = [...new Set(meta.packages.map((p) => p.service))];
  const [open, setOpen] = useState<ServiceKey[]>(sections.slice(0, 1));

  return (
    <div className="stack" style={{ gap: 10 }}>
      {sections.map((service) => {
        const items = meta.packages.filter((p) => p.service === service);
        const isOpen = open.includes(service);
        const picked = selected.filter((p) => p.service === service);
        return (
          <details key={service} className="menu-section" open={isOpen}>
            <summary
              onClick={(e) => {
                e.preventDefault();
                setOpen(isOpen ? open.filter((s) => s !== service) : [...open, service]);
              }}
            >
              <span className="grow stack" style={{ gap: 2 }}>
                <b>{meta.services.find((s) => s.key === service)?.label ?? service}</b>
                <span className="small muted">{picked.length ? `Selected: ${picked.map((p) => p.name).join(", ")}` : `${items.length} services`}</span>
              </span>
              <svg className="menu-chevron" width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>
            <div className="stack menu-items">
              {items.map((p) => (
                <button key={p.id} className={`option${picked.includes(p) ? " on" : ""}`} aria-pressed={picked.includes(p)} onClick={() => onToggle(p.id)}>
                  <span className="grow stack" style={{ gap: 4 }}>
                    <span className="row" style={{ gap: 8 }}>
                      <b>{p.name}</b>
                      <span className={`badge ${p.online ? "badge-green" : "badge-violet"}`}>{p.online ? "Online" : "On-site"}</span>
                    </span>
                    <span className="small muted">{p.summary}</span>
                  </span>
                  <b>{inr(p.price)}</b>
                </button>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}

function BookForm({ meta }: { meta: Meta }) {
  const router = useRouter();
  const params = useSearchParams();
  const { session, loading: sessionLoading, error: sessionError, refresh } = useSession();
  const user = session?.user;
  const [draft] = useState(() => readDraft(meta));
  useEffect(() => sessionStorage.removeItem(DRAFT_KEY), []);
  const [creatorId, setCreatorId] = useState(draft?.creatorId ?? params.get("creator") ?? "");
  const { data: chosen } = useData<CreatorPublic>(creatorId ? `/api/creators/${creatorId}` : null);

  const [cityId, setCityId] = useState(draft?.cityId ?? chosen?.cityId ?? "guwahati");
  const city = meta.cities.find((c) => c.id === cityId)!;
  const [zoneId, setZoneId] = useState(draft?.zoneId ?? city.zones[0]!.id);
  const [address, setAddress] = useState(draft?.address ?? "");
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [packageIds, setPackageIds] = useState<string[]>(draft?.packageIds ?? []);
  const selected = meta.packages.filter((p) => packageIds.includes(p.id));
  const online = selected.length > 0 && selected.every((p) => p.online);
  const onSite = selected.some((p) => !p.online);
  // Everything in an order shares one time, so one on-site service sets the notice for all of it.
  const noticeMs = onSite ? meta.dispatch.onSiteNoticeMs : 0;
  const [date, setDate] = useState(() => (draft && draft.date >= istDate(0) ? draft.date : slotsFor(istDate(0), meta, 0).length ? istDate(0) : istDate(1)));
  const slots = useMemo(() => slotsFor(date, meta, noticeMs), [date, meta, noticeMs]);
  const [slot, setSlot] = useState(draft?.slot ?? "");
  const [brief, setBrief] = useState(draft?.brief ?? "");
  const [referenceUrl, setReferenceUrl] = useState(draft?.referenceUrl ?? "");
  const [aspect, setAspect] = useState<Draft["aspect"]>(draft?.aspect ?? "9:16");
  const { busy, error, run } = useAction();

  useEffect(() => {
    // A saved order keeps the place the guest chose.
    if (chosen && !draft) {
      setCityId(chosen.cityId);
      setZoneId(chosen.zoneId);
    }
  }, [chosen, draft]);
  useEffect(() => {
    if (!slots.includes(slot)) setSlot(slots.includes(DEFAULT_SLOT) ? DEFAULT_SLOT : (slots[0] ?? ""));
  }, [slots, slot]);

  const total = selected.reduce((sum, p) => sum + p.price, 0);
  const days = [0, 1, 2, 3, 4, 5, 6].map((d) => istDate(d)).filter((d) => slotsFor(d, meta, noticeMs).length);

  function saveDraft() {
    const next: Draft = { creatorId, cityId, zoneId, address, packageIds, date, slot, brief, referenceUrl, aspect };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next));
  }

  async function pay() {
    const paidPage = await run(async () => {
      const { bookings, checkout } = await call<{ bookings: BookingView[]; checkout: CheckoutDetails }>("/api/bookings", {
        packageIds,
        cityId,
        zoneId,
        address,
        scheduledAt: `${date}T${slot}`,
        brief,
        aspect,
        referenceUrl,
        requestedCreatorId: creatorId || undefined,
      });
      const paid = await openCheckout(checkout);
      if (!paid) return undefined; // closed without paying; they can simply try again
      // If this call is lost, Razorpay's webhook still confirms the payment.
      await call("/api/payments/verify", { bookingId: bookings[0]!.id, ...paid }).catch(() => undefined);
      return bookings.length === 1 ? `/bookings/${bookings[0]!.id}` : "/bookings";
    });
    if (paidPage) router.push(paidPage);
  }

  return (
    <div className="container page narrow">
      <h1>Book a service</h1>
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
        <h2>1. Service</h2>
        <ServiceMenu
          meta={meta}
          selected={selected}
          onToggle={(id) => setPackageIds(packageIds.includes(id) ? packageIds.filter((x) => x !== id) : [...packageIds, id])}
        />
        <span className="hint">Pick as many as you need. Each service goes to its own creator, at the same date and time, and you pay once for all of them. Online services include 1 standard revision.</span>
      </section>

      {!online && (
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
                ? <span style={{ color: "var(--violet-ink)" }}>{address}</span>
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
      )}

      <section className="stack">
        <h2>{online ? "2. Finish by" : "3. When"}</h2>
        <div className="chips" role="group" aria-label="Date">
          {days.map((d, i) => (
            <button key={d} className={`chip${d === date ? " on" : ""}`} onClick={() => setDate(d)}>
              {i === 0 && d === istDate(0) ? "Today" : new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
            </button>
          ))}
        </div>
        <div className="field">
          <label htmlFor="other-date">Or pick another date</label>
          <input
            id="other-date"
            className="input"
            type="date"
            min={istDate(0)}
            max={istDate(meta.dispatch.maxDaysAhead - 1)}
            value={date}
            onChange={(e) => {
              if (e.target.value) setDate(e.target.value);
            }}
          />
        </div>
        {slot ? <TimeWheel slots={slots} value={slot} onChange={setSlot} /> : <span className="small">No times left on this date. Please pick another.</span>}
        <span className="hint">Scroll to set the time (24-hour clock).{onSite && " On-site jobs need 1 hour’s notice, so the creator can reach you on time."}</span>
      </section>

      <section className="stack">
        <h2>{online ? "3. Brief" : "4. Brief"}</h2>
        <div className="field">
          <label htmlFor="brief">What do you need done?</label>
          <textarea id="brief" className="textarea" value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="e.g. Opening week at our café: interiors, coffee being made, happy customers. Warm look." />
        </div>
        <div className="field">
          <label htmlFor="ref">Reference link (optional)</label>
          <input id="ref" className="input" type="url" value={referenceUrl} onChange={(e) => setReferenceUrl(e.target.value)} placeholder="Instagram or YouTube link" />
        </div>
        {selected.some((p) => p.service === "videography" || p.service === "video_editing") && (
          <div className="chips" role="group" aria-label="Format">
            {(["9:16", "16:9", "1:1"] as const).map((a) => (
              <button key={a} className={`chip${a === aspect ? " on" : ""}`} onClick={() => setAspect(a)}>
                {a === "9:16" ? "9:16 Reel" : a === "16:9" ? "16:9 YouTube" : "1:1 Post"}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="card stack">
        {selected.length === 0 && <span className="muted">Pick at least one service.</span>}
        {selected.map((p) => (
          <div key={p.id} className="row between">
            <span>{p.name}</span>
            <span>{inr(p.price)}</span>
          </div>
        ))}
        <hr className="divider" />
        <div className="row between strong" style={{ fontSize: 18 }}>
          <span>Total</span>
          <span>{inr(total)}</span>
        </div>
        <p className="small" style={{ color: "var(--ink-2)" }}>
          You pay Srijan now, and the creator is paid after you approve the finished job. Full refund if no creator is found or you cancel before one accepts.
        </p>
      </section>

      <ErrorNote error={error} />
      {!session && sessionError ? (
        <div className="stack">
          <p className="small">Can’t check whether you’re signed in. {sessionError}</p>
          <button className="btn btn-ghost btn-block" onClick={() => void refresh()}>
            Try again
          </button>
        </div>
      ) : sessionLoading && !session ? (
        <button className="btn btn-accent btn-lg btn-block" disabled>
          Loading…
        </button>
      ) : !user ? (
        <div className="stack">
          <p className="strong" style={{ textAlign: "center", margin: 0 }}>
            Sign in to pay
          </p>
          <Link href="/login?next=/book" className="btn btn-accent btn-lg btn-block" onClick={saveDraft}>
            Sign in
          </Link>
        </div>
      ) : user.role !== "client" ? (
        <div className="stack">
          <p className="small" style={{ margin: 0 }}>
            You’re signed in as {user.name}, whose account can’t book services. Switch to a client account to pay.
          </p>
          <Link href="/login?next=/book" className="btn btn-accent btn-lg btn-block" onClick={saveDraft}>
            Switch account
          </Link>
        </div>
      ) : (
        <button className="btn btn-accent btn-lg btn-block" disabled={busy || !slot || selected.length === 0} onClick={pay}>
          {busy ? "Processing…" : `Pay ${inr(total)}`}
        </button>
      )}
    </div>
  );
}

export default function BookPage() {
  const meta = useMeta();
  return meta ? (
    <Suspense fallback={<Loading />}>
      <BookForm meta={meta} />
    </Suspense>
  ) : (
    <Loading />
  );
}
