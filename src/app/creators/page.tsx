"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useData } from "@/lib/client/api";
import type { CreatorPublic } from "@/lib/domain/views";
import { CreatorCard, Loading } from "@/components/ui";
import { useMeta } from "@/components/useMeta";

function Browse() {
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
  const { data, loading } = useData<CreatorPublic[]>(`/api/creators?${qs.toString()}`);
  const title = meta?.services.find((s) => s.key === service)?.label ?? "All creators";

  return (
    <div className="container page">
      <div className="row between">
        <h1>{title}</h1>
        <Link href="/book" className="btn btn-accent">
          Skip choosing · book a shoot
        </Link>
      </div>
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
              <option value="">All Northeast</option>
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
      {loading && !data ? (
        <p className="muted">Loading…</p>
      ) : data && data.length ? (
        <div className="grid">
          {data.map((c) => (
            <CreatorCard key={c.id} c={c} />
          ))}
        </div>
      ) : (
        <p className="muted">No creators match these filters yet.</p>
      )}
    </div>
  );
}

export default function CreatorsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Browse />
    </Suspense>
  );
}
