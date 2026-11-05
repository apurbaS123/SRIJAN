"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { computeLayout, DISPLAY, BODY, type Content, type Fill, type Item, type Layout } from "./glass/layout";
import type { GlassScene } from "./glass/scene";
import { useSession } from "./Session";

const NAV_LINKS = [
  { label: "Explore", href: "/creators" },
  { label: "Book a service", href: "/book" },
  { label: "For brands", href: "/brands" },
];

const ACCOUNT = {
  guest: { label: "Sign in", href: "/login" },
  client: { label: "My bookings", href: "/bookings" },
  creator: { label: "Creator dashboard", href: "/creator" },
  ops: { label: "Ops dashboard", href: "/ops" },
};

/** CSS matrix3d mapping a w×h box onto the quad TL, TR, BR, BL. */
function homography(w: number, h: number, q: [number, number][]) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const det = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / det;
  const k = (dx1 * dy3 - dx3 * dy1) / det;
  const a = x1 - x0 + g * x1, b = x3 - x0 + k * x3;
  const d = y1 - y0 + g * y1, e = y3 - y0 + k * y3;
  return `matrix3d(${a / w},${d / w},0,${g / w},${b / h},${e / h},0,${k / h},0,0,1,0,${x0},${y0},0,1)`;
}

function css(fill: Fill): CSSProperties {
  if (typeof fill === "string") return { color: fill, WebkitTextFillColor: fill };
  const dir = fill.dir === "v" ? "180deg" : "90deg";
  return {
    backgroundImage: `linear-gradient(${dir}, ${fill.stops.join(", ")})`,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
    WebkitTextFillColor: "transparent",
  };
}

type Mode = "pending" | "static" | "live";

export function GlassHero() {
  const { session } = useSession();
  const role = session?.user?.role ?? "guest";
  const content = useMemo<Content>(() => ({ navLinks: NAV_LINKS, account: ACCOUNT[role] }), [role]);

  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<GlassScene | null>(null);
  const layoutRef = useRef<Layout | null>(null);
  const introDone = useRef(false);

  const [size, setSize] = useState<{ W: number; H: number } | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [mode, setMode] = useState<Mode>("pending");
  const [hover, setHover] = useState<string | null>(null);

  const L = useMemo(
    () => (size && fontsReady ? computeLayout(size.W, size.H, content) : null),
    [size, fontsReady, content],
  );
  layoutRef.current = L;

  // Fonts first: the canvas print and the DOM copy must measure the same glyphs.
  useEffect(() => {
    let alive = true;
    const specs = [`800 40px ${DISPLAY}`, `700 20px ${DISPLAY}`, `400 16px ${BODY}`, `500 16px ${BODY}`, `600 16px ${BODY}`, `700 16px ${BODY}`];
    Promise.race([
      Promise.all(specs.map((s) => document.fonts.load(s))),
      new Promise((r) => setTimeout(r, 2500)),
    ]).finally(() => alive && setFontsReady(true));

    const root = rootRef.current!;
    const measure = () => {
      const r = root.getBoundingClientRect();
      setSize((s) => (s && s.W === Math.round(r.width) && s.H === Math.round(r.height) ? s : { W: Math.round(r.width), H: Math.round(r.height) }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => {
      alive = false;
      ro.disconnect();
    };
  }, []);

  // WebGL scene, unless reduced motion or no WebGL.
  useEffect(() => {
    if (!fontsReady) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setMode("static");
      return;
    }
    let alive = true;
    let scene: GlassScene | null = null;
    import("./glass/scene")
      .then(({ GlassScene, hasWebGL }) => {
        if (!alive) return;
        if (!hasWebGL()) return setMode("static");
        try {
          scene = new GlassScene(canvasRef.current!);
        } catch {
          return setMode("static");
        }
        scene.onFrame = (corners) => {
          const el = layerRef.current, lay = layoutRef.current;
          if (el && lay) el.style.transform = homography(lay.bw, lay.bh, corners);
        };
        sceneRef.current = scene;
        setMode("live");
      })
      .catch(() => alive && setMode("static"));
    return () => {
      alive = false;
      scene?.dispose();
      sceneRef.current = null;
      introDone.current = false;
    };
  }, [fontsReady]);

  // Push layout + hover into the scene; first time, fly the page in.
  useEffect(() => {
    const scene = sceneRef.current;
    if (mode !== "live" || !scene || !L) return;
    scene.setLayout(L, hover);
    if (!introDone.current) {
      introDone.current = true;
      scene.intro();
      scene.start();
    }
  }, [mode, L, hover]);

  // Pause rendering while the hero is scrolled away.
  useEffect(() => {
    if (mode !== "live") return;
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? sceneRef.current?.start() : sceneRef.current?.stop()));
    io.observe(rootRef.current!);
    return () => io.disconnect();
  }, [mode]);

  function pointer(e: React.PointerEvent, active: boolean) {
    const r = rootRef.current!.getBoundingClientRect();
    sceneRef.current?.setPointer(e.clientX - r.left, e.clientY - r.top, active && e.pointerType !== "touch");
  }

  const live = mode === "live";

  function renderItem(it: Item) {
    const on = hover === it.id;
    const fill = on && it.hoverFill ? it.hoverFill : it.fill;
    const style: CSSProperties = {
      left: it.align === "right" ? it.x - it.w : it.x,
      top: it.cy - it.h / 2,
      width: it.w + 1,
      height: it.h,
      lineHeight: `${it.h}px`,
      fontSize: it.size,
      fontWeight: it.weight,
      fontFamily: it.family,
      letterSpacing: `${it.tracking}em`,
      ...(live ? { color: "transparent", WebkitTextFillColor: "transparent" } : css(it.kind === "pill" ? (on ? "#fff" : "#1a002e") : fill)),
    };
    if (!live && it.kind === "pill") {
      style.background = typeof fill === "string" ? fill : `linear-gradient(90deg, ${fill.stops.join(", ")})`;
      style.borderRadius = it.h / 2;
    }
    if (!live && it.kind === "mark") {
      style.background = "var(--grad-primary)";
      style.borderRadius = it.w * 0.28;
    }
    const events = {
      onPointerEnter: () => setHover(it.id),
      onPointerLeave: () => setHover((h) => (h === it.id ? null : h)),
      onFocus: () => setHover(it.id),
      onBlur: () => setHover((h) => (h === it.id ? null : h)),
    };
    const cls = `gh-item gh-${it.kind}`;
    if (it.href)
      return (
        <Link key={it.id} href={it.href} className={cls} style={style} aria-label={it.kind === "mark" ? "Srijan home" : undefined} {...events}>
          {it.text}
        </Link>
      );
    return (
      <span key={it.id} className={cls} style={style}>
        {it.text}{" "}
      </span>
    );
  }

  const by = (g: Item["group"]) => L?.items.filter((i) => i.group === g).map(renderItem);
  return (
    <section
      ref={rootRef}
      className={`glass-hero gh-${mode}`}
      onPointerMove={(e) => pointer(e, true)}
      onPointerDown={(e) => pointer(e, true)}
      onPointerLeave={(e) => pointer(e, false)}
    >
      <canvas ref={canvasRef} className="gh-canvas" aria-hidden="true" />

      {L && mode === "static" && (
        <div className="gh-static-block" aria-hidden="true" style={{ left: L.bx, top: L.by, width: L.bw, height: L.bh }}>
          <div className="gh-static-slab" style={{ top: 0, height: L.navH }} />
          <div className="gh-static-slab" style={{ top: L.panelY, height: L.ph }} />
        </div>
      )}

      {L && mode !== "pending" && (
        <div
          ref={layerRef}
          className="gh-layer"
          style={{ width: L.bw, height: L.bh, transform: live ? undefined : `translate(${L.bx}px, ${L.by}px)` }}
        >
          <nav aria-label="Main">{by("nav")}</nav>
          <p>{by("eyebrow")}</p>
          <h1>{by("h1")}</h1>
          <p>{by("sub")}</p>
          <div>{by("cta")}</div>
          <p>{by("foot")}</p>
        </div>
      )}
    </section>
  );
}
