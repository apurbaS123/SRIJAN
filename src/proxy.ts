import { NextResponse, type NextRequest } from "next/server";

const MAX_BODY_BYTES = 64 * 1024;
/**
 * Routes that take files, and what they may send. Everything else is JSON and belongs under the
 * limit above. The cap here is Vercel's own ceiling on a request body (4.5 MB), minus room for the
 * multipart wrapping — the upload route checks each file against its own, smaller limit.
 */
const UPLOAD_PATHS = ["/api/kyc/aadhaar"];
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** The live site's one address. A login belongs to one address, so everyone should be on the same one. */
const PRIMARY_HOST = "srijanclub.in";
/** Razorpay's servers call this one, not a browser. The route checks Razorpay's signature instead. */
const WEBHOOK_PATH = "/api/payments/webhook";

/**
 * Runs before every page and API route.
 * 1. On the live site, sends every other address to PRIMARY_HOST. Preview deployments and local runs stay put.
 * 2. API guard: state-changing requests must come from this site (blocks cross-site form posts,
 *    on top of the SameSite session cookie) and be reasonably small — a little larger for the one
 *    route that takes photos.
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
  const limit = UPLOAD_PATHS.includes(pathname) ? MAX_UPLOAD_BYTES : MAX_BODY_BYTES;
  if (Number(req.headers.get("content-length") ?? 0) > limit) {
    return NextResponse.json({ ok: false, error: "Request too large" }, { status: 413 });
  }
  return NextResponse.next();
}

export const config = {
  // Everything except Next's own files and Vercel's internal paths.
  matcher: "/((?!_next/static|_next/image|_vercel).*)",
};
