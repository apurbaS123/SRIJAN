"use client";
import Link from "next/link";
import { call, useData } from "@/lib/client/api";
import type { Notification } from "@/lib/domain/types";
import { useSession } from "./Session";

/**
 * DEMO: shows messages as a pop-up while the site is open, standing in for real phone
 * notifications. The messages themselves are created in src/lib/domain/notifications.ts.
 */
export function DemoNotifications() {
  const { session } = useSession();
  const { data, reload } = useData<Notification[]>(session?.user ? "/api/notifications" : null, 5000);
  if (!session?.user || !data?.length) return null;

  async function dismiss(id: string) {
    await call("/api/notifications", { id }).catch(() => undefined);
    await reload();
  }

  return (
    <div
      role="status"
      aria-live="polite"
      style={{ position: "fixed", top: 12, right: 12, left: 12, zIndex: 1000, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, pointerEvents: "none" }}
    >
      {data.slice(-3).map((n) => (
        <article key={n.id} className="card stack" style={{ width: "min(380px, 100%)", gap: 6, pointerEvents: "auto", boxShadow: "0 10px 30px rgba(0,0,0,.25)" }}>
          <span className="tiny muted strong">SRIJAN · DEMO NOTIFICATION</span>
          <b>{n.title}</b>
          {n.lines.map((line, i) => (
            <span key={i} className="small">
              {line}
            </span>
          ))}
          <div className="row">
            <Link href={n.href} className="btn btn-sm btn-primary" onClick={() => void dismiss(n.id)}>
              Open
            </Link>
            <button className="btn btn-sm btn-ghost" onClick={() => void dismiss(n.id)}>
              Dismiss
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
