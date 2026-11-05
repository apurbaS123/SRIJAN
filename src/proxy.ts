import { NextResponse, type NextRequest } from "next/server";

const MAX_BODY_BYTES = 64 * 1024;

/** The live site's one address. A login belongs to one address, so everyone should be on the same one. */
const PRIMARY_HOST = "srijan.in";
/** Razorpay's servers call this one, not a browser. The route checks Razorpay's signature instead. */
const WEBHOOK_PATH = "/api/payments/webhook";

/**
 * Runs before every page and API route.
 * 1. On the live site, sends every other address to PRIMARY_HOST. Preview deployments and local runs stay put.
 * 2. API guard: state-changing requests must come from this site (blocks cross-site form posts,
 *    on top of the SameSite session cookie) and be reasonably small.
 */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  // Razorpay doesn't follow redirects, so a webhook aimed at another address must still work.
  if (pathname === WEBHOOK_PATH) return NextResponse.next();

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (process.env.VERCEL_ENV === "production" && host !== PRIMARY_HOST) {
    return NextResponse.redirect(new URL(`${pathname}${search}`, `https://${PRIMARY_HOST}`), 308);
  }

  if (!pathname.startsWith("/api/")) return NextResponse.next();
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return NextResponse.next();
  const origin = req.headers.get("origin");
  let sameSite = false;
  try {
    sameSite = !!origin && !!host && new URL(origin).host === host;
  } catch {}
  if (!sameSite) return NextResponse.json({ ok: false, error: "Request blocked" }, { status: 403 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "Request too large" }, { status: 413 });
  }
  return NextResponse.next();
}

export const config = {
  // Everything except Next's own files and Vercel's internal paths.
  matcher: "/((?!_next/static|_next/image|_vercel).*)",
};
