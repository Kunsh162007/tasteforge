import { describe, expect, it } from "vitest";
import { buildCsp, securityHeaders } from "./headers";

const directive = (csp: string, name: string): string[] =>
  (csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? "").split(" ").slice(1);

describe("buildCsp", () => {
  const prod = buildCsp({ dev: false });

  it("allows self, OSM tiles and nothing else for images", () => {
    expect(directive(prod, "img-src")).toEqual(expect.arrayContaining(["'self'", "data:", "blob:", "https://tile.openstreetmap.org", "https://*.tile.openstreetmap.org"]));
    expect(directive(prod, "img-src")).not.toContain("https:");
  });

  it("forbids framing, plugins and foreign form posts", () => {
    expect(directive(prod, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(prod, "object-src")).toEqual(["'none'"]);
    expect(directive(prod, "base-uri")).toEqual(["'self'"]);
    expect(directive(prod, "form-action")).toEqual(["'self'"]);
  });

  it("limits fetch/XHR to the same origin and allows Google Fonts files", () => {
    expect(directive(prod, "connect-src")).toEqual(["'self'"]);
    expect(directive(prod, "font-src")).toEqual(expect.arrayContaining(["'self'", "https://fonts.gstatic.com"]));
    expect(directive(prod, "style-src")).toContain("https://fonts.googleapis.com");
  });

  it("only allows eval in development", () => {
    expect(directive(prod, "script-src")).not.toContain("'unsafe-eval'");
    expect(directive(buildCsp({ dev: true }), "script-src")).toContain("'unsafe-eval'");
  });
});

describe("securityHeaders", () => {
  const names = (dev: boolean) => securityHeaders({ dev }).map((h) => h.key);

  it("always sets the core headers", () => {
    const map = Object.fromEntries(securityHeaders({ dev: false }).map((h) => [h.key, h.value]));
    expect(map["X-Content-Type-Options"]).toBe("nosniff");
    expect(map["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(map["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(map["X-Frame-Options"]).toBe("DENY");
    expect(map["Permissions-Policy"]).toContain("camera=()");
  });

  it("adds HSTS in production only", () => {
    expect(names(false)).toContain("Strict-Transport-Security");
    expect(names(true)).not.toContain("Strict-Transport-Security");
  });
});
