import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "@/proxy";

const PRIMARY = "srijanclub.in";

function request(host: string, path: string, init: { method?: string; origin?: string } = {}) {
  const headers = new Headers({ host, "x-forwarded-host": host });
  if (init.origin) headers.set("origin", init.origin);
  return new NextRequest(`https://${host}${path}`, { method: init.method ?? "GET", headers });
}
const isPassedOn = (res: Response) => res.headers.get("x-middleware-next") === "1";

describe("one address for the live site", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sends other addresses to the main one, keeping the path and query", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    for (const host of ["srijan-hades-7e3a.vercel.app", "srijan-git-master-hades-7e3a.vercel.app", "srijan-f07k9h94l-hades-7e3a.vercel.app"]) {
      const res = proxy(request(host, "/creators?service=videography"));
      expect(res.status).toBe(308);
      expect(res.headers.get("location")).toBe(`https://${PRIMARY}/creators?service=videography`);
    }
    expect(proxy(request("srijan-hades-7e3a.vercel.app", "/api/session")).status).toBe(308);
  });

  it("leaves the main address alone", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(isPassedOn(proxy(request(PRIMARY, "/login")))).toBe(true);
    expect(isPassedOn(proxy(request(PRIMARY, "/api/session")))).toBe(true);
  });

  it("never redirects Razorpay's webhook", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(isPassedOn(proxy(request("srijan-hades-7e3a.vercel.app", "/api/payments/webhook", { method: "POST" })))).toBe(true);
  });

  it("leaves preview deployments and local runs alone", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(isPassedOn(proxy(request("srijan-abc-hades-7e3a.vercel.app", "/login")))).toBe(true);
    vi.stubEnv("VERCEL_ENV", "");
    expect(isPassedOn(proxy(request("localhost:3000", "/login")))).toBe(true);
  });
});

describe("API guard", () => {
  it("still blocks cross-site posts, and only on the API", () => {
    expect(proxy(request(PRIMARY, "/api/session", { method: "POST", origin: "https://evil.example" })).status).toBe(403);
    expect(proxy(request(PRIMARY, "/api/session", { method: "POST" })).status).toBe(403);
    expect(isPassedOn(proxy(request(PRIMARY, "/api/session", { method: "POST", origin: `https://${PRIMARY}` })))).toBe(true);
    expect(isPassedOn(proxy(request(PRIMARY, "/login", { method: "POST" })))).toBe(true);
  });
});
