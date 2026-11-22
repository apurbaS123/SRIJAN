"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useData } from "@/lib/client/api";
import type { CreatorPublic } from "@/lib/domain/views";
import { CreatorCard, LaunchSticker } from "@/components/ui";
import { useMeta } from "@/components/useMeta";

/** No filter touched, so the server's list stands. */
function pristineOf(service: string, state: string, available: boolean, q: string) {
  return !service && !state && !available && !q.trim();
}

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
  const [state, setState] = useState("");
  const [available, setAvailable] = useState(false);
  const [q, setQ] = useState("");
  const qs = new URLSearchParams();
  if (service) qs.set("service", service);
  if (state) qs.set("state", state);
  if (available) qs.set("available", "1");
  if (q.trim()) qs.set("q", q.trim());
  // Untouched filters mean the list the server already rendered is the right answer, so asking
  // /api/creators for it again on every visit bought nothing and cost a round trip to the
  // database — on the page most people arrive at first.
  const { data } = useData<CreatorPublic[]>(pristineOf(service, state, available, q) ? null : `/api/creators?${qs.toString()}`);
  const title = meta?.services.find((s) => s.key === service)?.label ?? "All creators";
  const pristine = pristineOf(service, state, available, q);
  const list = pristine ? initial : data;

  /**
   * The states the directory can actually answer for, in the order `meta.states` gives them.
   *
   * Srijan takes creators from any of the 36, so offering all 36 here would mean 30-odd choices
   * that can only answer "no creators match these filters yet" — a filter that mostly wastes the
   * tap. Only states somebody is actually listed in are offered.
   *
   * Built from `initial` and never from `list`: `list` is what the filters have already narrowed,
   * so building the options out of it would remove the option the person had just chosen, along
   * with every other state, the moment they chose one.
   */
  const states = (meta?.states ?? []).filter((s) => initial.some((c) => c.stateId === s.id));

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
          {/* Nobody listed anywhere yet: a dropdown whose only entry is "All India" is not a filter. */}
          {states.length > 0 && (
            <div className="field" style={{ minWidth: 200 }}>
              <label htmlFor="state">State</label>
              <select id="state" className="select" value={state} onChange={(e) => setState(e.target.value)}>
                <option value="">All India</option>
                {states.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
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
