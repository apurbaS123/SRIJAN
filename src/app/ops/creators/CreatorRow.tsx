"use client";
// One creator on the ops Creators page, with the team's two ways of changing them: edit the
// profile, or delete it.
//
// This lives beside the page rather than in it because the edit form is long and the page already
// carries the verification queue.
import { useState } from "react";
import { call, useAction } from "@/lib/client/api";
import type { CreatorPublic } from "@/lib/domain/views";
import { Avatar, ErrorNote, Stars } from "@/components/ui";
import { SOCIAL_PLATFORMS, STATES } from "@/lib/domain/config";
import type { SocialPlatform } from "@/lib/domain/types";

/**
 * A creator the team has already dealt with, verified or sent back.
 *
 * `blocker` is the server's answer to "may this one be deleted?" — the reason it would refuse, or
 * null. It comes with the list so the button can say why before anybody presses it; the server
 * works it out again on the request, so a stale page can't talk it into anything.
 */
export type OpsCreatorRow = CreatorPublic & { phone?: string; email?: string; jobs: number; blocker: string | null };

/**
 * Deleting is the dangerous one of the two and is treated as such: it names the person, says what
 * is kept, and asks for the name to be typed back. The server refuses it outright while there is
 * live work or unpaid money, and the reason is on the button rather than something to find out by
 * pressing it.
 */
export function CreatorRow({ c, onChanged }: { c: OpsCreatorRow; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const act = useAction();

  async function remove() {
    const typed = prompt(
      [
        `Delete ${c.name}? This cannot be undone.`,
        "",
        "Their profile, their login and the documents they uploaded go. Finished jobs, reviews and ledger entries stay, as Srijan's record of what happened.",
        "",
        "Type their name to confirm:",
      ].join("\n"),
    );
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== c.name.trim().toLowerCase()) return act.setError("That name didn’t match — nothing was deleted.");
    if (await act.run(() => call("/api/admin", { action: "delete_creator", creatorId: c.id }))) onChanged();
  }

  return (
    <article className="card stack">
      <div className="row">
        <Avatar name={c.name} photoUrl={c.photoUrl} />
        <div className="grow stack" style={{ gap: 2 }}>
          <b>{c.name}</b>
          <span className="small muted">
            {c.area}
            {c.phone ? ` · ${c.phone}` : ""}
            {c.email ? ` · ${c.email}` : ""}
          </span>
          <span className="tiny muted">
            {c.services.map((s) => s.title).join(", ") || "No services"} · {c.jobs} job{c.jobs === 1 ? "" : "s"}
          </span>
        </div>
        <div className="stack" style={{ gap: 4, alignItems: "flex-end" }}>
          {c.verification === "rejected" ? (
            <span className="badge badge-red">Sent back</span>
          ) : c.available ? (
            <span className="badge badge-green">Online · {c.maxTravelKm} km</span>
          ) : (
            <span className="badge">Offline</span>
          )}
          <Stars rating={c.rating} count={c.ratingCount} />
        </div>
      </div>
      {c.bio && <p className="small">{c.bio}</p>}
      <ErrorNote error={act.error} />
      {editing ? (
        <EditCreator
          c={c}
          onDone={(changed) => {
            setEditing(false);
            if (changed) onChanged();
          }}
        />
      ) : (
        <div className="row">
          <button className="btn btn-sm" onClick={() => setEditing(true)}>
            Edit profile
          </button>
          <button className="btn btn-sm" disabled={act.busy || !!c.blocker} title={c.blocker ?? undefined} onClick={() => void remove()}>
            Delete
          </button>
          {c.blocker && <span className="tiny muted grow">{c.blocker}</span>}
        </div>
      )}
    </article>
  );
}

/**
 * The profile fields the team may change.
 *
 * Money (bank account, UPI), the Aadhaar and verification itself are deliberately absent: a payout
 * must go where the creator said it should, and nobody becomes verified because a text box was
 * edited. The server enforces the same list, so this form is a convenience and not the check.
 *
 * Only fields actually touched are sent, so two people tidying different parts of one profile
 * don't overwrite each other.
 */
function EditCreator({ c, onDone }: { c: OpsCreatorRow; onDone: (changed: boolean) => void }) {
  const [name, setName] = useState(c.name);
  const [bio, setBio] = useState(c.bio);
  const [stateId, setStateId] = useState(c.stateId ?? "");
  const [city, setCity] = useState(c.city ?? "");
  const [travel, setTravel] = useState(String(c.maxTravelKm));
  const [followers, setFollowers] = useState(c.followers ? String(c.followers) : "");
  const [portfolio, setPortfolio] = useState(c.portfolio ?? "");
  const [platform, setPlatform] = useState<SocialPlatform>(c.social?.platform ?? "instagram");
  const [social, setSocial] = useState(c.social?.url ?? "");
  const [removePhoto, setRemovePhoto] = useState(false);
  const [takeOffline, setTakeOffline] = useState(false);
  const act = useAction();


  async function save() {
    const patch: Record<string, unknown> = {};
    if (name !== c.name) patch.name = name;
    if (bio !== c.bio) patch.bio = bio;
    if (stateId !== (c.stateId ?? "") || city !== (c.city ?? "")) {
      patch.stateId = stateId;
      patch.city = city;
    }
    if (Number(travel) !== c.maxTravelKm) patch.maxTravelKm = Number(travel);
    if (followers.trim() !== (c.followers ? String(c.followers) : "")) patch.followers = followers.trim() ? Number(followers) : null;
    if (portfolio.trim() !== (c.portfolio ?? "")) patch.portfolio = portfolio.trim();
    if (social.trim() !== (c.social?.url ?? "") || (!!social.trim() && platform !== c.social?.platform)) patch.social = { platform, url: social.trim() };
    if (removePhoto) patch.removePhoto = true;
    if (takeOffline) patch.available = false;
    if (Object.keys(patch).length === 0) return onDone(false);
    if (await act.run(() => call("/api/admin", { action: "edit_creator", creatorId: c.id, patch }))) onDone(true);
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="field">
        <label htmlFor={`name-${c.id}`}>Name</label>
        <input id={`name-${c.id}`} className="input" value={name} onChange={(e) => setName(e.target.value)} />
        <span className="tiny muted">Changes the profile and the account it signs in to.</span>
      </div>
      <div className="field">
        <label htmlFor={`bio-${c.id}`}>Bio</label>
        <textarea id={`bio-${c.id}`} className="input" rows={3} style={{ height: "auto" }} value={bio} onChange={(e) => setBio(e.target.value)} />
        <span className="tiny muted">Empty clears it. Shown on the public profile.</span>
      </div>
      <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
        <div className="field grow" style={{ minWidth: 160 }}>
          <label htmlFor={`state-${c.id}`}>State</label>
          <select id={`state-${c.id}`} className="input" value={stateId} onChange={(e) => setStateId(e.target.value)}>
            <option value="">Select a state</option>
            {STATES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field grow" style={{ minWidth: 160 }}>
          <label htmlFor={`city-${c.id}`}>City or town</label>
          <input id={`city-${c.id}`} className="input" value={city} onChange={(e) => setCity(e.target.value)} />
          <span className="tiny muted">
            Moving them loses their exact point: jobs are then matched across the state until they update their own location.
          </span>
        </div>
        <div className="field" style={{ minWidth: 120 }}>
          <label htmlFor={`travel-${c.id}`}>Travel</label>
          <select id={`travel-${c.id}`} className="input" value={travel} onChange={(e) => setTravel(e.target.value)}>
            {[5, 10, 15, 20, 25].map((k) => (
              <option key={k} value={k}>
                {k} km
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor={`portfolio-${c.id}`}>Portfolio link</label>
        <input id={`portfolio-${c.id}`} className="input" value={portfolio} onChange={(e) => setPortfolio(e.target.value)} placeholder="Empty to remove" />
      </div>
      <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
        <div className="field" style={{ minWidth: 140 }}>
          <label htmlFor={`platform-${c.id}`}>Social site</label>
          <select id={`platform-${c.id}`} className="input" value={platform} onChange={(e) => setPlatform(e.target.value as SocialPlatform)}>
            {SOCIAL_PLATFORMS.map((pf) => (
              <option key={pf.key} value={pf.key}>
                {pf.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field grow" style={{ minWidth: 200 }}>
          <label htmlFor={`social-${c.id}`}>Profile link</label>
          <input id={`social-${c.id}`} className="input" value={social} onChange={(e) => setSocial(e.target.value)} placeholder="Empty to remove" />
        </div>
        <div className="field" style={{ minWidth: 120 }}>
          <label htmlFor={`followers-${c.id}`}>Followers</label>
          <input
            id={`followers-${c.id}`}
            className="input"
            inputMode="numeric"
            value={followers}
            onChange={(e) => setFollowers(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="0"
          />
        </div>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        {c.photoUrl && (
          <label className="row small" style={{ gap: 8 }}>
            <input type="checkbox" checked={removePhoto} onChange={(e) => setRemovePhoto(e.target.checked)} />
            Remove their profile photo
          </label>
        )}
        {c.available && (
          <label className="row small" style={{ gap: 8 }}>
            <input type="checkbox" checked={takeOffline} onChange={(e) => setTakeOffline(e.target.checked)} />
            Take them offline — they can go back online themselves
          </label>
        )}
      </div>
      <ErrorNote error={act.error} />
      <div className="row">
        <button className="btn btn-sm btn-primary" disabled={act.busy} onClick={() => void save()}>
          {act.busy ? "Saving…" : "Save changes"}
        </button>
        <button className="btn btn-sm" disabled={act.busy} onClick={() => onDone(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
