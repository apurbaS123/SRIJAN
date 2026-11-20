import { ImageResponse } from "next/og";

/**
 * The picture that shows when a Srijan link is pasted into WhatsApp, LinkedIn, Slack or X.
 *
 * The site has declared `summary_large_image` for a while with no image behind it, which is the
 * worst of both: the card reserves room for a picture and then shows a blank. These are generated
 * at build time, one per page that is worth sharing.
 *
 * Deliberately no custom font file. The generator needs a TTF or OTF, and the site's own faces are
 * served as WOFF2 by next/font, so using Syne here would mean committing a second copy of the font
 * in another format. The layout and the colours carry the brand instead.
 */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const INK = "#06030b";
const VIOLET = "#9f1eff";
const PINK = "#e879f9";

export function ogImage({ title, subtitle, tag }: { title: string; subtitle: string; tag?: string }) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: `linear-gradient(150deg, #1d0b33 0%, ${INK} 62%)`,
          color: "#f5f0ff",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* The glow the site uses behind its hero, flattened to a single soft disc. */}
        <div
          style={{
            position: "absolute",
            top: -190,
            right: -150,
            width: 620,
            height: 620,
            borderRadius: 620,
            background: `radial-gradient(circle, ${VIOLET}66 0%, ${VIOLET}00 70%)`,
            display: "flex",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 13,
              background: `linear-gradient(135deg, ${VIOLET}, ${PINK})`,
              display: "flex",
            }}
          />
          <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>srijan.</div>
          {tag ? (
            <div
              style={{
                marginLeft: 12,
                padding: "8px 18px",
                borderRadius: 999,
                border: "2px solid rgba(196,181,253,0.35)",
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: "rgba(245,240,255,0.78)",
                display: "flex",
              }}
            >
              {tag}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", maxWidth: 940 }}>
          <div style={{ fontSize: 76, fontWeight: 800, letterSpacing: -2.5, lineHeight: 1.05 }}>{title}</div>
          <div style={{ marginTop: 26, fontSize: 32, lineHeight: 1.4, color: "rgba(245,240,255,0.76)" }}>{subtitle}</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 24, color: "rgba(245,240,255,0.55)" }}>
          <div style={{ display: "flex" }}>srijanclub.in</div>
          <div style={{ display: "flex" }}>Guwahati · Shillong · Jorhat · Dibrugarh · Silchar · Tezpur</div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
