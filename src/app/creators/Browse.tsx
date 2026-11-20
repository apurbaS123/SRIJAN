"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useData } from "@/lib/client/api";
import type { CreatorPublic } from "@/lib/domain/views";
import { CreatorCard, LaunchSticker } from "@/components/ui";
import { useMeta } from "@/components/useMeta";

/**
 * `initial` is the list the server already rendered into the HTML. `useData` starts with nothing,
 * so without it the first paint of this component — server and client alike — is the word
 * "Loading…" under a full set of filters, which is what /creators used to serve.
 *
 * It is only trusted while no filter has been touched: once someone narrows the list, showing the
 * unfiltered one would be worse than showing nothing.
 */
export function Browse({ initial }: { initial: CreatorPublic[] }) {
  const meta = useMeta();
  const params = useSearchParams();
  const [service, setService] = useState(params.get("service") ?? "");
  const [city, setCity] = useState("");
  const [available, setAvailable] = useState(false);
  const [q, setQ] = useState("");
  const qs = new URLSearchParams();
  if (service) qs.set("service", service);
  if (city) qs.set("city", city);
  if (available) qs.set("available", "1");
  if (q.trim()) qs.set("q", q.trim());
  const { data } = useData<CreatorPublic[]>(`/api/creators?${qs.toString()}`);
  const title = meta?.services.find((s) => s.key === service)?.label ?? "All creators";
  const pristine = !service && !city && !available && !q.trim();
  const list = data ?? (pristine ? initial : undefined);

  return (
    <>
      <div className="row between">
        <h2 className="browse-heading" aria-live="polite">
          {title}
        </h2>
        <Link href="/book" className="btn btn-accent">
          Book a service
        </Link>
      </div>
      <LaunchSticker />
      <div className="card stack">
        <div className="field">
          <label htmlFor="q">Search</label>
          <input id="q" className="input" type="search" placeholder="Name, style or skill" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="chips" role="group" aria-label="Service">
          <button className={`chip${service === "" ? " on" : ""}`} onClick={() => setService("")}>
            All
          </button>
          {meta?.services.map((s) => (
            <button key={s.key} className={`chip${service === s.key ? " on" : ""}`} onClick={() => setService(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="row">
          <div className="field" style={{ minWidth: 200 }}>
            <label htmlFor="city">City</label>
            <select id="city" className="select" value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">All India</option>
              {meta?.cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <label className="check" style={{ alignSelf: "flex-end" }}>
            <input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} />
            Online now
          </label>
        </div>
      </div>
      {!list ? (
        <p className="muted">Searching…</p>
      ) : list.length ? (
        <div className="grid">
          {list.map((c) => (
            <CreatorCard key={c.id} c={c} />
          ))}
        </div>
      ) : (
        <p className="muted">{pristine ? "No creators are listed yet." : "No creators match these filters yet."}</p>
      )}
    </>
  );
}
