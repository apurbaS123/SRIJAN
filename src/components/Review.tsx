"use client";
import { useState } from "react";
import { when } from "@/lib/client/format";

const LABELS = ["", "Bad", "Poor", "Okay", "Good", "Excellent"];

/** Five tappable stars, 1 (bad) to 5 (excellent). */
export function StarInput({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled?: boolean }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="row" style={{ gap: 12 }}>
      <div className="star-input" role="radiogroup" aria-label="Rating, 1 star is bad and 5 stars is excellent" onPointerLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n === 1 ? "" : "s"} · ${LABELS[n]}`}
            className={n <= shown ? "on" : ""}
            disabled={disabled}
            onClick={() => onChange(n)}
            onPointerEnter={(e) => e.pointerType === "mouse" && setHover(n)}
          >
            ★
          </button>
        ))}
      </div>
      <span className="small strong" aria-live="polite">
        {shown ? LABELS[shown] : <span className="muted">Tap to rate</span>}
      </span>
    </div>
  );
}

/** Read-only stars for a single review. */
export function StarRow({ rating }: { rating: number }) {
  return (
    <span className="star-row" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= rating ? "on" : ""} aria-hidden="true">
          ★
        </span>
      ))}
    </span>
  );
}

export interface ReviewData {
  rating: number;
  text?: string;
  at?: number;
}

export function ReviewBody({ r }: { r: ReviewData }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="row" style={{ gap: 8 }}>
        <StarRow rating={r.rating} />
        <span className="small strong">{LABELS[r.rating]}</span>
        {r.at && <span className="tiny muted">· {when(r.at)}</span>}
      </div>
      {r.text && <p className="small">“{r.text}”</p>}
    </div>
  );
}

/**
 * The review card on a completed booking: a form until you've reviewed, then your review.
 * `theirs` is what the other side wrote about you, if anything.
 */
export function ReviewSection({
  name,
  mine,
  theirs,
  busy,
  onSubmit,
}: {
  /** Who is being reviewed. */
  name: string;
  mine: ReviewData | null;
  theirs: ReviewData | null;
  busy: boolean;
  onSubmit: (rating: number, text: string) => void;
}) {
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  return (
    <section className="card stack" aria-labelledby="review-h">
      <h2 id="review-h">{mine ? "Your review" : `How was working with ${name}?`}</h2>
      {mine ? (
        <ReviewBody r={mine} />
      ) : (
        <>
          <StarInput value={rating} onChange={setRating} disabled={busy} />
          <div className="field">
            <label htmlFor="review-text">
              Tell us more <span className="muted">(optional)</span>
            </label>
            <textarea
              id="review-text"
              className="textarea"
              maxLength={1000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What went well, and what could be better?"
            />
          </div>
          <button className="btn btn-primary" style={{ alignSelf: "flex-start" }} disabled={busy || !rating} onClick={() => onSubmit(rating, text)}>
            Submit review
          </button>
          <span className="hint">Reviews can’t be changed once submitted.</span>
        </>
      )}
      {theirs && (
        <>
          <hr className="divider" />
          <span className="label">{name}’s review of you</span>
          <ReviewBody r={theirs} />
        </>
      )}
    </section>
  );
}
