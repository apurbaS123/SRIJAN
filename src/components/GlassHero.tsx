"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { computeLayout, DISPLAY, BODY, type Content, type Fill, type Item, type Layout } from "./glass/layout";
import type { GlassScene } from "./glass/scene";
import { useSession } from "./Session";
import { inr } from "@/lib/client/format";

const NAV_LINKS = [
  { label: "Explore", href: "/creators" },
  { label: "Book a shoot", href: "/book" },
  { label: "For brands", href: "/brands" },
];

const ACCOUNT = {
  guest: { label: "Sign in", href: "/login" },
  client: { label: "My bookings", href: "/bookings" },
  creator: { label: "Creator dashboard", href: "/creator" },
  ops: { label: "Ops dashboard", href: "/ops" },
};

function terms(from: number) {
  return [
    {
      term: "Same-day shoot",
      body: "a verified videographer comes to your place, shoots and edits, and delivers within 24 hours.",
    },
    {
      term: "Five-minute dispatch",
      body: "every available creator within 10 km is alerted at once and the first to accept takes the job. At minute three the search widens to 25 km.",
    },
    {
      term: "Fixed price",
      body: `packages from ${inr(from)} + GST, with no haggling. Creators keep 80% of every shoot.`,
    },
    {
      term: "Safe payment",
      body: "you pay Srijan up front and the creator is paid when you approve the delivery, with one free revision.",
    },
    {
      term: "Managed campaign",
      body: "brands book a strategy call; our team shortlists creators across the Northeast, runs every deal and reports the results.",
    },
  ];
}

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

export function GlassHero({ fromPrice }: { fromPrice: number }) {
  const { session } = useSession();
  const role = session?.user?.role ?? "guest";
  const content = useMemo<Content>(() => ({ navLinks: NAV_LINKS, account: ACCOUNT[role] }), [role]);

  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const howRef = useRef<HTMLButtonElement>(null);
  const sceneRef = useRef<GlassScene | null>(null);
  const layoutRef = useRef<Layout | null>(null);
  const introDone = useRef(false);

  const [size, setSize] = useState<{ W: number; H: number } | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [mode, setMode] = useState<Mode>("pending");
  const [view, setView] = useState<"page" | "defs">("page");
  const [hover, setHover] = useState<string | null>(null);
  const [backHover, setBackHover] = useState(false);

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

  useEffect(() => {
    sceneRef.current?.setBackHover(backHover);
  }, [backHover, mode]);

  // Pause rendering while the hero is scrolled away.
  useEffect(() => {
    if (mode !== "live") return;
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? sceneRef.current?.start() : sceneRef.current?.stop()));
    io.observe(rootRef.current!);
    return () => io.disconnect();
  }, [mode]);

  useEffect(() => {
    if (view !== "defs") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && goBack();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function pointer(e: React.PointerEvent, active: boolean) {
    const r = rootRef.current!.getBoundingClientRect();
    sceneRef.current?.setPointer(e.clientX - r.left, e.clientY - r.top, active && e.pointerType !== "touch");
  }

  function shatter() {
    setHover(null);
    setView("defs");
    sceneRef.current?.shatter();
    setTimeout(() => backRef.current?.focus({ preventScroll: true }), 350);
  }

  function goBack() {
    setBackHover(false);
    setView("page");
    sceneRef.current?.assemble();
    setTimeout(() => howRef.current?.focus({ preventScroll: true }), 300);
  }

  const live = mode === "live";
  const W = size?.W ?? 0, H = size?.H ?? 0;

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
    if (!live && on && it.action === "shatter") style.textDecoration = "underline";
    const events = {
      onPointerEnter: () => setHover(it.id),
      onPointerLeave: () => setHover((h) => (h === it.id ? null : h)),
      onFocus: () => setHover(it.id),
      onBlur: () => setHover((h) => (h === it.id ? null : h)),
    };
    const cls = `gh-item gh-${it.kind}`;
    if (it.action === "shatter")
      return (
        <button key={it.id} ref={howRef} type="button" className={cls} style={style} onClick={shatter} {...events}>
          {it.text}
        </button>
      );
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
  const sl = L?.sliver;
  const sliverBox = sl && (() => {
    const xs = sl.pts.map((p) => p[0]), ys = sl.pts.map((p) => p[1]);
    return { w: (Math.max(...xs) - Math.min(...xs)) * W, h: (Math.max(...ys) - Math.min(...ys)) * H };
  })();

  return (
    <section
      ref={rootRef}
      className={`glass-hero gh-${mode}`}
      data-view={view}
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
          inert={view === "defs"}
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

      <div className="gh-defs" inert={view !== "defs"} aria-hidden={view !== "defs"}>
        <div className="gh-defs-col">
          <h2>Srijan, in five terms.</h2>
          {terms(fromPrice).map((t) => (
            <p key={t.term}>
              <b>{t.term}</b> — {t.body}
            </p>
          ))}
        </div>
      </div>

      {sl && sliverBox && (
        <button
          ref={backRef}
          type="button"
          className="gh-back"
          inert={view !== "defs"}
          style={{
            left: sl.label[0] * W,
            top: sl.label[1] * H,
            width: Math.max(sliverBox.w, 88),
            height: Math.max(sliverBox.h * 0.7, 44),
            fontSize: sl.size,
          }}
          onClick={goBack}
          onPointerEnter={() => setBackHover(true)}
          onPointerLeave={() => setBackHover(false)}
          onFocus={() => setBackHover(true)}
          onBlur={() => setBackHover(false)}
        >
          ← Back
        </button>
      )}
    </section>
  );
}
