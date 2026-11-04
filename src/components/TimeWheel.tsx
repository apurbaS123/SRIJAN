"use client";
import { useEffect, useRef } from "react";

/** Keep in step with .wheel-item in globals.css. */
const ROW_PX = 44;

/** One scrolling column. It settles on whichever row stops in the middle. */
function Wheel({ label, values, value, onChange }: { label: string; values: string[]; value: string; onChange: (v: string) => void }) {
  const list = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const placed = useRef(false);

  // Follow the value when it changes from outside, such as a click or a new date.
  useEffect(() => {
    const el = list.current;
    const i = values.indexOf(value);
    if (!el || i < 0) return;
    if (Math.round(el.scrollTop / ROW_PX) !== i) el.scrollTo({ top: i * ROW_PX, behavior: placed.current ? "smooth" : "instant" });
    placed.current = true;
  }, [value, values]);

  useEffect(() => () => clearTimeout(settle.current), []);

  function onScroll() {
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const el = list.current;
      if (!el) return;
      const i = Math.min(values.length - 1, Math.max(0, Math.round(el.scrollTop / ROW_PX)));
      if (values[i] && values[i] !== value) onChange(values[i]!);
    }, 120);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = values[values.indexOf(value) + step];
    if (next) onChange(next);
  }

  return (
    <div ref={list} className="wheel" role="listbox" aria-label={label} tabIndex={0} onScroll={onScroll} onKeyDown={onKeyDown}>
      {values.map((v) => (
        <div key={v} role="option" aria-selected={v === value} className={`wheel-item${v === value ? " on" : ""}`} onClick={() => onChange(v)}>
          {v}
        </div>
      ))}
    </div>
  );
}

/** A 24-hour time picker like a phone's alarm: hours and minutes on two scrolling wheels. `slots` are "HH:mm". */
export function TimeWheel({ slots, value, onChange }: { slots: string[]; value: string; onChange: (slot: string) => void }) {
  const hours = [...new Set(slots.map((s) => s.slice(0, 2)))];
  const hour = value.slice(0, 2);
  const minutes = slots.filter((s) => s.startsWith(`${hour}:`)).map((s) => s.slice(3));

  function pickHour(h: string) {
    const sameMinute = `${h}:${value.slice(3)}`;
    onChange(slots.includes(sameMinute) ? sameMinute : slots.find((s) => s.startsWith(`${h}:`))!);
  }

  return (
    <div className="time-wheel">
      <div className="time-wheel-band" aria-hidden="true" />
      <Wheel label="Hour" values={hours} value={hour} onChange={pickHour} />
      <span className="time-wheel-colon" aria-hidden="true">:</span>
      <Wheel label="Minute" values={minutes} value={value.slice(3)} onChange={(m) => onChange(`${hour}:${m}`)} />
    </div>
  );
}
