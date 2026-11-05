"use client";

import { useRef, useState, type PointerEvent, type ReactNode } from "react";

type Drag = { animation: Animation; startX: number; startTime: number; msPerPx: number; duration: number };

/**
 * One drifting row of logos that can be grabbed and dragged.
 * The drift stays a CSS animation; dragging only moves that animation's clock, so the row
 * carries on from wherever it was let go and the loop stays seamless in both directions.
 */
export function BrandRow({ reverse, children }: { reverse: boolean; children: ReactNode }) {
  const [dragging, setDragging] = useState(false);
  const drag = useRef<Drag | null>(null);

  function start(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const track = e.currentTarget.firstElementChild as HTMLElement | null;
    // No animation when the visitor prefers reduced motion: the logos just wrap, with nothing to drag.
    const animation = track?.getAnimations()[0];
    if (!track || !animation) return;
    const duration = Number(animation.effect?.getComputedTiming().duration);
    // The track holds two copies of the logos and one loop moves it by the width of one copy.
    const msPerPx = duration / (track.offsetWidth / 2);
    drag.current = { animation, startX: e.clientX, startTime: Number(animation.currentTime), msPerPx, duration };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  }

  function move(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    // The clock moves the track left, or right on a reversed row. The logos should follow the pointer.
    const ms = (e.clientX - d.startX) * d.msPerPx * (reverse ? 1 : -1);
    // Keep it inside one loop: before the start of the animation the row would jump back to its first position.
    d.animation.currentTime = (((d.startTime + ms) % d.duration) + d.duration) % d.duration;
  }

  function end() {
    drag.current = null;
    setDragging(false);
  }

  return (
    <div
      className={`brand-row${reverse ? " brand-row-reverse" : ""}${dragging ? " brand-row-dragging" : ""}`}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {children}
    </div>
  );
}
