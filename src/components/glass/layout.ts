/**
 * Layout + drawing for the glass hero.
 *
 * One function computes every text/button position in "block" pixels (origin at
 * the block's top-left, y down). The same list is painted onto the canvas that is
 * printed on the shards and rendered as a transparent DOM layer on top, so the
 * two always line up.
 */

export const DISPLAY = '"Syne", system-ui, sans-serif';
export const BODY = '"Space Grotesk", system-ui, -apple-system, "Segoe UI", sans-serif';

export type Fill = string | { dir: "v" | "h"; stops: string[] };

export interface Item {
  id: string;
  kind: "text" | "pill" | "link" | "mark";
  group: "eyebrow" | "h1" | "sub" | "cta" | "foot" | "nav";
  text: string;
  /** Left edge (or right edge when align is "right"), block px. */
  x: number;
  /** Vertical centre of the line box, block px. */
  cy: number;
  w: number;
  h: number;
  size: number;
  weight: number;
  family: string;
  /** Letter spacing in em. */
  tracking: number;
  fill: Fill;
  hoverFill?: Fill;
  align: "left" | "right";
  href?: string;
  action?: "shatter";
}

export interface Sliver {
  /** Outline as viewport fractions. */
  pts: [number, number][];
  /** "← Back" label centre, viewport fractions. */
  label: [number, number];
  size: number;
  k: number;
}

export interface Layout {
  W: number;
  H: number;
  portrait: boolean;
  /** Block top-left on screen, px. */
  bx: number;
  by: number;
  bw: number;
  bh: number;
  navH: number;
  /** Panel top inside the block, px. */
  panelY: number;
  pw: number;
  ph: number;
  S: number;
  items: Item[];
  sliver: Sliver;
}

export interface Content {
  navLinks: { label: string; href: string }[];
  account: { label: string; href: string };
}

let measureCtx: CanvasRenderingContext2D | null = null;
function ctx2d() {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  return measureCtx!;
}

export const font = (weight: number, size: number, family: string) => `${weight} ${size}px ${family}`;

function setSpacing(c: CanvasRenderingContext2D, px: number) {
  if ("letterSpacing" in c) (c as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
}

export function measure(text: string, weight: number, size: number, family: string, tracking = 0) {
  const c = ctx2d();
  c.font = font(weight, size, family);
  setSpacing(c, tracking * size);
  const w = c.measureText(text).width;
  setSpacing(c, 0);
  return w;
}

function wrap(text: string, maxW: number, weight: number, size: number, family: string) {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next, weight, size, family) > maxW) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export const COPY = {
  eyebrow: "THE CREATOR ECONOMY OF THE NORTHEAST",
  h1: ["Create it", "today."],
  sub: [
    "Verified videographers, editors and influencers across the Northeast.",
    "Same-day shoots, fixed prices, paid safely through Srijan.",
  ],
  cta: { label: "Book a shoot", href: "/book" },
  link: "How it works →",
  footL: "© Srijan · Made in the Northeast",
  footR: "Prototype · payments & KYC simulated",
};

const WHITE = (a: number) => `rgba(245, 240, 255, ${a})`;
const H1_TOP: Fill = { dir: "v", stops: ["#f5f0ff", "#cfc2ea"] };
const H1_BRAND: Fill = { dir: "h", stops: ["#a78bfa", "#e879f9", "#f5d0fe"] };
const ACCENT: Fill = { dir: "h", stops: ["#9f1eff", "#e879f9"] };

export function computeLayout(W: number, H: number, content: Content): Layout {
  const phone = W < 640;
  const portrait = H > W;
  const mx = phone ? 16 : W * 0.055;
  const my = phone ? 16 : H * 0.085;
  const bw = W - 2 * mx;
  const bh = H - 2 * my;
  const S = bw / 1730;
  const navH = Math.max(bh * 0.108, 56);
  const panelY = navH + 14;
  const pw = bw;
  const ph = bh - panelY;
  // Text scale: the reference scale on desktop, a readable floor on small screens.
  const T = portrait ? Math.max(S, bw / 620) : Math.max(S, 0.6);
  const px = (n: number, min: number) => Math.max(n * T, min);

  const items: Item[] = [];
  const text = (it: Omit<Item, "w" | "h" | "align"> & { align?: Item["align"] }): Item => {
    const w = measure(it.text, it.weight, it.size, it.family, it.tracking);
    const item: Item = { align: "left", ...it, w, h: it.size };
    items.push(item);
    return item;
  };

  // ── Nav slab ────────────────────────────────────────────
  const navPad = px(40, 18);
  const navCy = navH / 2;
  const markSize = px(24, 18);
  items.push({
    id: "mark", kind: "mark", group: "nav", text: "", x: navPad, cy: navCy, w: markSize, h: markSize,
    size: markSize, weight: 800, family: DISPLAY, tracking: 0, fill: "", align: "left", href: "/",
  });
  const brand = text({
    id: "brand", kind: "link", group: "nav", text: "srijan", x: navPad + markSize + px(12, 8), cy: navCy,
    size: px(26, 20), weight: 800, family: DISPLAY, tracking: -0.03, fill: WHITE(0.96), href: "/",
  });
  const account = text({
    id: "account", kind: "link", group: "nav", text: content.account.label, x: bw - navPad, cy: navCy,
    size: px(15, 13), weight: 700, family: BODY, tracking: 0, fill: WHITE(0.92), hoverFill: "#ffffff",
    href: content.account.href, align: "right",
  });
  if (!phone) {
    const size = px(15, 13);
    const gapL = px(40, 20);
    const widths = content.navLinks.map((l) => measure(l.label, 600, size, BODY));
    const total = widths.reduce((a, b) => a + b, 0) + gapL * (widths.length - 1);
    let x = Math.max(brand.x + brand.w + px(64, 24), bw / 2 - total / 2);
    if (x + total < account.x - account.w - px(32, 16)) {
      content.navLinks.forEach((l, i) => {
        text({
          id: `nav-${i}`, kind: "link", group: "nav", text: l.label, x, cy: navCy, size, weight: 600, family: BODY,
          tracking: 0, fill: WHITE(0.6), hoverFill: WHITE(1), href: l.href,
        });
        x += widths[i] + gapL;
      });
    }
  }

  // ── Panel ───────────────────────────────────────────────
  const pad = px(76, 22);
  const maxW = pw - 2 * pad;
  let y = panelY + ph * (portrait ? 0.07 : 0.135);

  const eyebrowSize = px(11, 10);
  text({
    id: "eyebrow", kind: "text", group: "eyebrow", text: COPY.eyebrow, x: pad, cy: y, size: eyebrowSize,
    weight: 600, family: BODY, tracking: 0.2, fill: WHITE(0.4),
  });

  const hs = portrait ? Math.min(pw * 0.15, ph * 0.1) : Math.min(pw * 0.078, ph * 0.2);
  y += eyebrowSize / 2 + px(26, 14) + hs / 2;
  COPY.h1.forEach((line, i) => {
    text({
      id: `h1-${i}`, kind: "text", group: "h1", text: line, x: pad - hs * 0.04, cy: y, size: hs, weight: 800,
      family: DISPLAY, tracking: -0.035, fill: i === 0 ? H1_TOP : H1_BRAND,
    });
    y += hs * 0.97;
  });

  const subSize = px(17, 14);
  const subLh = subSize * 1.55;
  y += -hs * 0.97 + hs / 2 + px(34, 18) + subLh / 2;
  const subLines = COPY.sub.flatMap((l) => wrap(l, maxW, 400, subSize, BODY));
  subLines.forEach((line, i) => {
    text({
      id: `sub-${i}`, kind: "text", group: "sub", text: line, x: pad, cy: y, size: subSize, weight: 400,
      family: BODY, tracking: 0, fill: WHITE(0.55),
    });
    y += subLh;
  });

  const btnH = px(46, 40);
  const btnSize = px(15, 14);
  y += -subLh + subLh / 2 + px(36, 22) + btnH / 2;
  const pillW = measure(COPY.cta.label, 700, btnSize, BODY) + px(48, 36);
  items.push({
    id: "cta", kind: "pill", group: "cta", text: COPY.cta.label, x: pad, cy: y, w: pillW, h: btnH, size: btnSize,
    weight: 700, family: BODY, tracking: 0.01, fill: "#f5f0ff", hoverFill: ACCENT, align: "left",
    href: COPY.cta.href,
  });
  text({
    id: "how", kind: "link", group: "cta", text: COPY.link, x: pad + pillW + px(30, 20), cy: y, size: btnSize,
    weight: 600, family: BODY, tracking: 0, fill: WHITE(0.82), hoverFill: WHITE(1), action: "shatter",
  });

  const footSize = px(11, 10);
  const footCy = panelY + ph - px(38, 22);
  text({
    id: "foot-l", kind: "text", group: "foot", text: COPY.footL, x: pad, cy: footCy, size: footSize, weight: 500,
    family: BODY, tracking: 0.02, fill: WHITE(0.34),
  });
  if (!phone) {
    text({
      id: "foot-r", kind: "text", group: "foot", text: COPY.footR, x: pw - pad, cy: footCy, size: footSize,
      weight: 500, family: BODY, tracking: 0.02, fill: WHITE(0.34), align: "right",
    });
  }

  // ── "← Back" sliver (viewport fractions) ────────────────
  const base: [number, number][] = [[0.147, 0.243], [0.252, 0.169], [0.287, 0.277], [0.151, 0.258]];
  const narrow = W < 900;
  const sliver: Sliver = narrow
    ? {
        pts: base.map(([x, yy]) => [0.06 + (x - 0.147) * 2.8, 0.06 + (yy - 0.169) * 1.3]),
        label: [0.06 + (0.219 - 0.147) * 2.8, 0.06 + (0.238 - 0.169) * 1.3],
        size: 15,
        k: Math.max(W / 1918, 0.5),
      }
    : { pts: base, label: [0.219, 0.238], size: Math.max(W * 0.0066, 12), k: W / 1918 };

  return { W, H, portrait, bx: mx, by: my, bw, bh, navH, panelY, pw, ph, S, items, sliver };
}

// ── Canvas painting ───────────────────────────────────────

function paint(c: CanvasRenderingContext2D, fill: Fill, x0: number, y0: number, x1: number, y1: number) {
  if (typeof fill === "string") return fill;
  const g = fill.dir === "v" ? c.createLinearGradient(0, y0, 0, y1) : c.createLinearGradient(x0, 0, x1, 0);
  fill.stops.forEach((s, i) => g.addColorStop(i / (fill.stops.length - 1), s));
  return g;
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function drawText(c: CanvasRenderingContext2D, it: Item, fill: Fill, x: number) {
  c.font = font(it.weight, it.size, it.family);
  setSpacing(c, it.tracking * it.size);
  const m = c.measureText(it.text);
  const a = m.fontBoundingBoxAscent ?? it.size * 0.8;
  const d = m.fontBoundingBoxDescent ?? it.size * 0.2;
  // Same baseline the DOM puts a line-height:1 line box on.
  const base = it.cy + (a - d) / 2;
  c.fillStyle = paint(c, fill, x, it.cy - it.size / 2, x + it.w, it.cy + it.size / 2);
  c.fillText(it.text, x, base);
  setSpacing(c, 0);
  return base;
}

/** Paints the whole block (nav + panel) into `canvas` at `scale` px per block px. */
export function drawPage(canvas: HTMLCanvasElement, L: Layout, hover: string | null, scale: number) {
  const w = Math.round(L.bw * scale);
  const h = Math.round(L.bh * scale);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const c = canvas.getContext("2d")!;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, w, h);
  c.setTransform(scale, 0, 0, scale, 0, 0);
  c.textBaseline = "alphabetic";

  for (const it of L.items) {
    const on = hover === it.id;
    const x = it.align === "right" ? it.x - it.w : it.x;
    if (it.kind === "mark") {
      const g = c.createLinearGradient(x, it.cy - it.h / 2, x + it.w, it.cy + it.h / 2);
      ["#7c3aed", "#c026d3", "#f0abfc"].forEach((s, i) => g.addColorStop([0, 0.6, 1][i], s));
      c.fillStyle = g;
      roundRect(c, x, it.cy - it.h / 2, it.w, it.h, it.w * 0.28);
      c.fill();
      continue;
    }
    if (it.kind === "pill") {
      const fill = on && it.hoverFill ? it.hoverFill : it.fill;
      c.fillStyle = paint(c, fill, x, 0, x + it.w, 0);
      roundRect(c, x, it.cy - it.h / 2, it.w, it.h, it.h / 2);
      c.fill();
      const label: Item = { ...it, w: measure(it.text, it.weight, it.size, it.family, it.tracking) };
      drawText(c, label, on ? "#ffffff" : "#1a002e", x + (it.w - label.w) / 2);
      continue;
    }
    const fill = on && it.hoverFill ? it.hoverFill : it.fill;
    const base = drawText(c, it, fill, x);
    if (on && it.action === "shatter") {
      c.fillStyle = typeof fill === "string" ? fill : "#fff";
      c.fillRect(x, base + it.size * 0.2, it.w, Math.max(1, it.size * 0.07));
    }
  }
}
