"use client";
// Where somebody is: a state from the list, and a city they type.
//
// The typed name is looked up on OpenStreetMap's Nominatim so the form can send coordinates with
// it, because matching a job to a creator is a question about distance and a name is not an
// answer to it. The lookup happens in the person's own browser, sends nothing but the city and
// state they just typed, and is allowed to fail: when it does, the form goes on without
// coordinates and the server places them in the middle of their state instead (see
// `domain/place.ts`), which widens the search rather than breaking it.
import { useEffect, useId, useRef, useState } from "react";
import { STATES } from "@/lib/domain/config";

export interface PlaceValue {
  stateId: string;
  city: string;
  /** Filled in by the lookup below. Undefined simply means it did not manage one. */
  lat?: number;
  lng?: number;
}

export const EMPTY_PLACE: PlaceValue = { stateId: "", city: "" };

/** Enough to match on: the server asks for no more than this. */
export const placeReady = (p: PlaceValue) => !!p.stateId && p.city.trim().length >= 2;

type Status = "idle" | "looking" | "found" | "unplaced";

async function locate(city: string, stateName: string, signal: AbortSignal) {
  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in" +
    `&city=${encodeURIComponent(city)}&state=${encodeURIComponent(stateName)}`;
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const hits = (await res.json()) as { lat?: string; lon?: string }[];
  const hit = hits?.[0];
  if (!hit?.lat || !hit?.lon) return null;
  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export function CityField({
  value,
  onChange,
  disabled,
  stateLabel = "State",
  cityLabel = "City or town",
}: {
  value: PlaceValue;
  onChange: (p: PlaceValue) => void;
  disabled?: boolean;
  stateLabel?: string;
  cityLabel?: string;
}) {
  const id = useId();
  const [status, setStatus] = useState<Status>("idle");
  // The latest value, so the debounced lookup below never writes coordinates onto a city the
  // person has since changed.
  const latest = useRef(value);
  latest.current = value;

  const { stateId, city } = value;
  useEffect(() => {
    const name = STATES.find((s) => s.id === stateId)?.name;
    const typed = city.trim();
    if (!name || typed.length < 2) {
      setStatus("idle");
      return;
    }
    const ctrl = new AbortController();
    setStatus("looking");
    const t = setTimeout(async () => {
      try {
        const at = await locate(typed, name, ctrl.signal);
        if (ctrl.signal.aborted) return;
        if (latest.current.city.trim() !== typed || latest.current.stateId !== stateId) return;
        setStatus(at ? "found" : "unplaced");
        onChange({ ...latest.current, lat: at?.lat, lng: at?.lng });
      } catch {
        if (!ctrl.signal.aborted) setStatus("unplaced");
      }
    }, 700);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
    // `onChange` is deliberately left out: parents pass a fresh function each render, and this
    // must run when the place changes, not on every keystroke anywhere in the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateId, city]);

  return (
    <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
      <div className="field grow" style={{ minWidth: 180 }}>
        <label htmlFor={`${id}-state`}>{stateLabel}</label>
        <select
          id={`${id}-state`}
          className="select"
          disabled={disabled}
          value={stateId}
          onChange={(e) => onChange({ ...value, stateId: e.target.value, lat: undefined, lng: undefined })}
        >
          <option value="">Select a state</option>
          {STATES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field grow" style={{ minWidth: 180 }}>
        <label htmlFor={`${id}-city`}>{cityLabel}</label>
        <input
          id={`${id}-city`}
          className="input"
          disabled={disabled}
          value={city}
          autoComplete="address-level2"
          placeholder="e.g. Guwahati"
          onChange={(e) => onChange({ ...value, city: e.target.value, lat: undefined, lng: undefined })}
        />
        <span className="small muted">
          {status === "looking"
            ? "Finding it on the map…"
            : status === "found"
              ? "Found it — jobs will be matched by distance."
              : status === "unplaced"
                ? "We couldn’t find that on the map. Jobs will be matched across the whole state instead."
                : "Type the city or town you work in."}
        </span>
      </div>
    </div>
  );
}
