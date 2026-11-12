/**
 * Renders the Srijan logo lockup — the gradient mark, the "srijan" wordmark and its full stop — to
 * a PNG in public/.
 *
 * There is no image file behind the logo anywhere in the app: the header draws it in CSS and the
 * hero draws it on a canvas that is then printed onto the WebGL shards. So when something outside
 * the app needs the logo as a picture (a deck, an email signature, a social profile), this is where
 * it comes from, rather than somebody screenshotting the hero and cropping it.
 *
 * The geometry is the hero's own, in `src/components/glass/layout.ts`, kept in the same proportions
 * to the mark so the two can't drift apart:
 *   wordmark size  = 26/24 of the mark      mark → word gap = 12/24 of the mark
 *   dot diameter   = 0.27 of the wordmark   word → dot gap  = 0.18 of the wordmark
 *
 *   node scripts/make-logo.mjs [--mark 512] [--out public/logo.png] [--bg "#12001f"]
 *
 * Syne (the display face) is not in the repo — it is loaded from Google Fonts at runtime — so this
 * downloads it the first time and caches it under .data/.
 */
import fs from "node:fs";
import path from "node:path";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";

// Same stops as --grad-primary in globals.css, and as the mark on the hero.
const GRAD = [
  [0, "#7c3aed"],
  [0.6, "#c026d3"],
  [1, "#f0abfc"],
];
/** The wordmark's colour on the hero, at full opacity: an exported asset shouldn't be part-transparent. */
const INK = "#f5f0ff";

const SYNE_URL = "https://fonts.gstatic.com/s/syne/v24/8vIS7w4qzmVxsWxjBZRjr0FKM_24vj6k.ttf";
const FONT_CACHE = path.join(process.cwd(), ".data", "fonts", "Syne-ExtraBold.ttf");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function syne() {
  if (!fs.existsSync(FONT_CACHE)) {
    const res = await fetch(SYNE_URL);
    if (!res.ok) throw new Error(`Could not download Syne: ${res.status}`);
    fs.mkdirSync(path.dirname(FONT_CACHE), { recursive: true });
    fs.writeFileSync(FONT_CACHE, Buffer.from(await res.arrayBuffer()));
    console.log(`Downloaded Syne ExtraBold → ${path.relative(process.cwd(), FONT_CACHE)}`);
  }
  if (!GlobalFonts.registerFromPath(FONT_CACHE, "Syne")) throw new Error("Could not register the Syne font");
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

async function main() {
  await syne();

  const mark = Number(arg("mark", 512));
  const out = path.resolve(arg("out", "public/logo.png"));
  const bg = arg("bg", "");

  const wordSize = mark * (26 / 24);
  const markGap = mark * (12 / 24);
  const dot = wordSize * 0.27;
  const dotGap = wordSize * 0.18;
  const font = `800 ${wordSize}px Syne`;
  const tracking = -0.03 * wordSize;

  // Measure first, on a throwaway canvas, so the real one is only as big as the logo needs.
  const ruler = createCanvas(8, 8).getContext("2d");
  ruler.font = font;
  ruler.letterSpacing = `${tracking}px`;
  const m = ruler.measureText("srijan");
  const ascent = m.actualBoundingBoxAscent;
  const descent = m.actualBoundingBoxDescent;

  const pad = Math.round(mark * 0.12);
  const width = Math.round(pad * 2 + mark + markGap + m.width + dotGap + dot);
  // The lockup's centre line is the mark's. Everything else hangs off the text baseline, which sits
  // where it does on the hero: the mark's middle, nudged by the font's own metrics.
  const cy = Math.max(mark / 2, ascent - (ascent - descent) / 2) + pad;
  const baseline = cy + (ascent - descent) / 2;
  const height = Math.round(Math.max(cy + mark / 2, baseline + descent) + pad);

  const canvas = createCanvas(width, height);
  const c = canvas.getContext("2d");
  if (bg) {
    c.fillStyle = bg;
    c.fillRect(0, 0, width, height);
  }

  // The mark: a rounded square filled across its own diagonal, as on the hero.
  const mx = pad;
  const my = cy - mark / 2;
  const g = c.createLinearGradient(mx, my, mx + mark, my + mark);
  for (const [at, colour] of GRAD) g.addColorStop(at, colour);
  c.fillStyle = g;
  roundRect(c, mx, my, mark, mark, mark * 0.28);
  c.fill();

  // The wordmark.
  const wx = mx + mark + markGap;
  c.font = font;
  c.letterSpacing = `${tracking}px`;
  c.textBaseline = "alphabetic";
  c.fillStyle = INK;
  c.fillText("srijan", wx, baseline);
  c.letterSpacing = "0px";

  // The full stop, sitting on the wordmark's baseline.
  c.beginPath();
  c.arc(wx + m.width + dotGap + dot / 2, baseline - dot / 2, dot / 2, 0, Math.PI * 2);
  c.fill();

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, canvas.toBuffer("image/png"));
  console.log(`${path.relative(process.cwd(), out)} — ${width}×${height}${bg ? ` on ${bg}` : " (transparent)"}`);
}

await main();
