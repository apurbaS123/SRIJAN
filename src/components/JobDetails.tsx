"use client";
import type { BookingView } from "@/lib/domain/views";
import { when } from "@/lib/client/format";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="row between" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
      <span className="small muted" style={{ flexShrink: 0 }}>
        {label}
      </span>
      <span className="small strong" style={{ textAlign: "right" }}>
        {children}
      </span>
    </div>
  );
}

/** Everything about a job, the same for the client and the creator. */
export function JobDetails({ b, money }: { b: BookingView; money: { label: string; value: string } }) {
  return (
    <section className="card stack" style={{ gap: 8 }}>
      <h2>Job details</h2>
      <Row label="Job">{b.packageName}</Row>
      <Row label="Includes">{b.packageSummary}</Row>
      <Row label="Booking">{b.code}</Row>
      <Row label={money.label}>{money.value}</Row>
      <Row label={b.online ? "Finish by" : "When"}>{when(b.scheduledAt)}</Row>
      <Row label="Where">{b.online ? "Online · no visit needed" : b.area}</Row>
      {!b.online && b.address && <Row label="Address">{b.address}</Row>}
      <Row label="Format">{b.aspect}</Row>
      {b.referenceUrl && (
        <Row label="Reference">
          <a href={b.referenceUrl} target="_blank" rel="noreferrer">
            Open link
          </a>
        </Row>
      )}
      <hr className="divider" />
      <span className="small muted">Brief</span>
      <p className="small" style={{ whiteSpace: "pre-wrap" }}>
        {b.brief}
      </p>
    </section>
  );
}
