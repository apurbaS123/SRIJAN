"use client";

/**
 * LocationPickerModal — Rapido-style map pin picker.
 *
 * Opens a full-screen modal with an interactive Leaflet map.
 * User can drag the map (pin stays fixed in centre) to pin their
 * exact location.  On "Confirm", the reverse-geocoded address is
 * passed back via onConfirm().
 *
 * Uses Leaflet loaded via CDN — no npm package needed.
 */

import { useEffect, useRef, useState, useCallback } from "react";

/* ------------------------------------------------------------------ */
/* Types                                                                 */
/* ------------------------------------------------------------------ */
interface Props {
  onConfirm: (address: string) => void;
  onClose: () => void;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */
const DEFAULT_LAT = 26.1445; // Guwahati centre
const DEFAULT_LNG = 91.7362;

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18`,
    { headers: { "Accept-Language": "en" } }
  );
  const data = await res.json();
  const a = data.address || {};
  const parts = [
    a.shop || a.amenity || a.building || a.house_number || "",
    a.road || a.pedestrian || a.footway || a.path || "",
    a.neighbourhood || a.suburb || a.quarter || a.village || "",
    a.city || a.town || a.municipality || a.county || "",
    a.state || "",
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : data.display_name || "";
}

/* Dynamically load Leaflet CSS + JS from CDN if not already loaded */
function loadLeaflet(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as unknown as Record<string, unknown>).L) {
      resolve();
      return;
    }
    // CSS
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    // JS
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Leaflet"));
    document.head.appendChild(script);
  });
}

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */
export default function LocationPickerModal({ onConfirm, onClose }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletMapRef = useRef<any>(null);
  const [resolvedAddress, setResolvedAddress] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [initError, setInitError] = useState("");
  const geocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doGeocode = useCallback((lat: number, lng: number) => {
    if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
    setGeocoding(true);
    setResolvedAddress("");
    geocodeTimer.current = setTimeout(async () => {
      try {
        const addr = await reverseGeocode(lat, lng);
        setResolvedAddress(addr);
      } catch {
        setResolvedAddress("Could not resolve address — check network.");
      } finally {
        setGeocoding(false);
      }
    }, 600); // debounce 600 ms
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        await loadLeaflet();
        if (cancelled || !mapRef.current) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const L = (window as unknown as Record<string, any>).L;

        // Default to Guwahati; try GPS first
        let lat = DEFAULT_LAT;
        let lng = DEFAULT_LNG;
        try {
          const pos = await new Promise<GeolocationPosition>((res, rej) =>
            navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000 })
          );
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch {
          /* use default */
        }

        if (cancelled || !mapRef.current) return;

        const map = L.map(mapRef.current, {
          center: [lat, lng],
          zoom: 17,
          zoomControl: false,
          attributionControl: false,
        });

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 20,
        }).addTo(map);

        // Attribution bottom-left, tiny
        L.control.attribution({ position: "bottomleft", prefix: false })
          .addAttribution("© OpenStreetMap contributors")
          .addTo(map);

        // Zoom control — top-right
        L.control.zoom({ position: "topright" }).addTo(map);

        leafletMapRef.current = map;
        setMapReady(true);

        // Resolve initial position
        doGeocode(lat, lng);

        // Re-geocode whenever the map stops moving (pin stays fixed, map moves)
        map.on("moveend", () => {
          const centre = map.getCenter();
          doGeocode(centre.lat, centre.lng);
        });

        // Show "Locating…" while dragging
        map.on("movestart", () => {
          if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
          setResolvedAddress("");
          setGeocoding(true);
        });
      } catch (e) {
        if (!cancelled) setInitError(String(e));
      }
    }

    init();
    return () => {
      cancelled = true;
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleConfirm() {
    if (!resolvedAddress) return;
    onConfirm(resolvedAddress);
    onClose();
  }

  return (
    <>
      {/* ── Backdrop ── */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          zIndex: 1000,
          animation: "fadeIn 0.18s ease",
        }}
      />

      {/* ── Modal sheet ── */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1001,
          display: "flex",
          flexDirection: "column",
          background: "#fff",
          animation: "slideUp 0.22s ease",
        }}
      >
        {/* ── Top bar ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 16px",
            borderBottom: "1px solid var(--line)",
            flexShrink: 0,
            background: "#fff",
            zIndex: 2,
          }}
        >
          <button
            aria-label="Close map"
            onClick={onClose}
            style={{
              border: "none",
              background: "none",
              cursor: "pointer",
              padding: 6,
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              color: "var(--ink)",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, fontFamily: "var(--display)", letterSpacing: "-0.01em" }}>
              Pin your location
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 1 }}>
              Move the map to place the pin exactly on your shoot spot
            </div>
          </div>
        </div>

        {/* ── Map area (takes all available height) ── */}
        <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
          {/* Leaflet container */}
          <div ref={mapRef} style={{ width: "100%", height: "100%" }} />

          {/* Fixed centre pin SVG */}
          {mapReady && (
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -100%)",
                pointerEvents: "none",
                zIndex: 10,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              {/* Pin body */}
              <svg width="38" height="50" viewBox="0 0 38 50" fill="none">
                <ellipse cx="19" cy="47" rx="8" ry="3" fill="rgba(0,0,0,0.18)" />
                <path
                  d="M19 2C10.163 2 3 9.163 3 18c0 11.25 16 30 16 30S35 29.25 35 18C35 9.163 27.837 2 19 2z"
                  fill="var(--violet)"
                  stroke="#fff"
                  strokeWidth="2"
                />
                <circle cx="19" cy="18" r="6" fill="#fff" />
              </svg>
            </div>
          )}

          {initError && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(255,255,255,0.92)",
                zIndex: 20,
                padding: 24,
                textAlign: "center",
                color: "var(--red)",
                fontSize: 14,
              }}
            >
              {initError}
            </div>
          )}
        </div>

        {/* ── Bottom address strip + confirm ── */}
        <div
          style={{
            flexShrink: 0,
            background: "#fff",
            borderTop: "1px solid var(--line)",
            padding: "16px 16px calc(16px + env(safe-area-inset-bottom))",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            boxShadow: "0 -4px 24px rgba(0,0,0,0.07)",
          }}
        >
          {/* Address preview card */}
          <div
            style={{
              background: "var(--violet-soft)",
              border: "1px solid #dcd6ff",
              borderRadius: 14,
              padding: "12px 14px",
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              minHeight: 52,
            }}
          >
            <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>📍</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              {geocoding ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: 14 }}>
                  <span
                    style={{
                      display: "inline-block",
                      width: 14,
                      height: 14,
                      border: "2px solid var(--violet)",
                      borderTopColor: "transparent",
                      borderRadius: "50%",
                      animation: "spin 0.7s linear infinite",
                    }}
                  />
                  Locating address…
                </div>
              ) : resolvedAddress ? (
                <>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)", lineHeight: 1.35 }}>
                    {resolvedAddress.split(",")[0]}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, lineHeight: 1.4 }}>
                    {resolvedAddress.split(",").slice(1).join(",").trim()}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 14, color: "var(--muted)" }}>Move the map to pin your location</div>
              )}
            </div>
          </div>

          {/* Confirm button */}
          <button
            className="btn btn-violet btn-lg btn-block"
            disabled={!resolvedAddress || geocoding}
            onClick={handleConfirm}
            id="confirm-location"
          >
            {geocoding ? "Resolving…" : "Confirm location"}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(40px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        /* Fix Leaflet z-index inside our stacking context */
        .leaflet-pane { z-index: 1 !important; }
        .leaflet-top, .leaflet-bottom { z-index: 5 !important; }
        .leaflet-control { z-index: 5 !important; }
      `}</style>
    </>
  );
}
