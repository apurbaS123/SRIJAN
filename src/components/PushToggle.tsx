"use client";
import { useEffect, useState } from "react";
import { call } from "@/lib/client/api";

/** The VAPID public key as the Push API wants it: raw bytes, not base64url text. */
function keyBytes(base64url: string) {
  const padded = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

type State = "loading" | "unsupported" | "needs-install" | "off" | "on" | "blocked";

/**
 * Turns real phone notifications on for this device. Without it a job alert only shows while the
 * site is open — which is no use to a creator who is out working.
 */
export function PushToggle({ what = "job alerts" }: { what?: string }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!KEY || typeof window === "undefined") return setState("unsupported");
    const standalone = window.matchMedia("(display-mode: standalone)").matches || "standalone" in navigator;
    // iOS only allows this once the site is on the home screen.
    const iOS = /iP(hone|ad|od)/.test(navigator.userAgent);
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return setState(iOS && !standalone ? "needs-install" : "unsupported");
    if (Notification.permission === "denied") return setState("blocked");
    void (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        setState((await reg.pushManager.getSubscription()) ? "on" : "off");
      } catch {
        setState("unsupported");
      }
    })();
  }, []);

  async function turnOn() {
    setBusy(true);
    setError("");
    try {
      if ((await Notification.requestPermission()) !== "granted") {
        setState("blocked");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) });
      await call("/api/push", JSON.parse(JSON.stringify(sub)) as Record<string, unknown>);
      setState("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t turn notifications on");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      if (sub) {
        await call("/api/push", { endpoint: sub.endpoint, off: true });
        await sub.unsubscribe();
      }
      setState("off");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t turn notifications off");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading" || state === "unsupported") return null;

  return (
    <div className="card stack" style={{ gap: 8 }}>
      {state === "on" ? (
        <>
          <b>Phone notifications are on</b>
          <span className="small muted">You’ll get {what} on this device even with Srijan closed.</span>
          <button className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start" }} disabled={busy} onClick={() => void turnOff()}>
            Turn off on this device
          </button>
        </>
      ) : state === "needs-install" ? (
        <>
          <b>Get {what} on your phone</b>
          <span className="small muted">
            On iPhone, tap Share then <b>Add to Home Screen</b>, open Srijan from there and come back to this page.
          </span>
        </>
      ) : state === "blocked" ? (
        <>
          <b>Notifications are blocked</b>
          <span className="small muted">Allow notifications for this site in your browser settings, then reload.</span>
        </>
      ) : (
        <>
          <b>Get {what} on your phone</b>
          <span className="small muted">Alerts only show while Srijan is open until you turn this on.</span>
          <button className="btn btn-sm" style={{ alignSelf: "flex-start" }} disabled={busy} onClick={() => void turnOn()}>
            {busy ? "Turning on…" : "Turn on notifications"}
          </button>
        </>
      )}
      {error && <span className="small error">{error}</span>}
    </div>
  );
}
