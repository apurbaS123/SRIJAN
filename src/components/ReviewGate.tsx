"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { call, useData } from "@/lib/client/api";
import type { PendingReview } from "@/lib/domain/views";
import { StarInput } from "@/components/Review";
import { useSession } from "./Session";

/** Fired by a page that has just approved a job, so the pop-up appears at once. */
export const REVIEW_EVENT = "srijan:review-due";

/**
 * Pages that are never blocked. Someone who needs help, or is reading the terms they are being
 * held to, must always be able to get there.
 */
const ALWAYS_OPEN = ["/support", "/terms", "/privacy", "/login"];

/**
 * The review of a finished job is compulsory: once a job is approved — by the client, or
 * automatically after 48 hours — this sits over the site until it is rated. There is no close
 * button and no way round it, by design. Only the client who paid sees it.
 */
export function ReviewGate() {
  const { session } = useSession();
  const pathname = usePathname();
  const isClient = session?.user?.role === "client";
  const { data, reload } = useData<PendingReview[]>(isClient ? "/api/reviews" : null, 20000);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // A job approved on this page shouldn't wait for the next poll.
  useEffect(() => {
    const onDue = () => void reload();
    window.addEventListener(REVIEW_EVENT, onDue);
    return () => window.removeEventListener(REVIEW_EVENT, onDue);
  }, [reload]);

  const due = data?.[0];

  // Keep the page behind it still, so the only thing to do is answer.
  useEffect(() => {
    if (!due || ALWAYS_OPEN.includes(pathname)) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [due, pathname]);

  if (!due || ALWAYS_OPEN.includes(pathname)) return null;

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await call(`/api/bookings/${due!.bookingId}`, { action: "review", rating, text });
      setRating(0);
      setText("");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t save your review. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const more = (data?.length ?? 0) - 1;

  return (
    <div className="review-gate" role="dialog" aria-modal="true" aria-labelledby="review-gate-h">
      <article className="card stack review-gate-card">
        <span className="small muted strong">{due.code}</span>
        <h2 id="review-gate-h">How was {due.creatorName.split(" ")[0]}?</h2>
        <p className="small muted">
          {due.autoApproved
            ? `Your ${due.packageName} was approved automatically after 48 hours.`
            : `Thanks for approving your ${due.packageName}.`}{" "}
          Rating your creator is how the next client knows who to trust, so please do it before carrying on.
        </p>
        <StarInput value={rating} onChange={setRating} disabled={busy} />
        <div className="field">
          <label htmlFor="gate-text">
            Tell us more <span className="muted">(optional)</span>
          </label>
          <textarea
            id="gate-text"
            className="textarea"
            maxLength={1000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What went well, and what could be better?"
          />
        </div>
        {error && <span className="small error">{error}</span>}
        <button className="btn btn-primary" disabled={busy || !rating} onClick={() => void submit()}>
          {busy ? "Saving…" : "Submit review"}
        </button>
        <span className="hint">
          {rating ? "Reviews can’t be changed once submitted." : "Tap a star to rate."}
          {more > 0 && ` ${more} more job${more === 1 ? "" : "s"} to rate after this.`}
        </span>
        <span className="tiny muted">
          Need help with this job instead? <a href="/support">Contact support</a>.
        </span>
      </article>
    </div>
  );
}
