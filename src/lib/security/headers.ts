/**
 * Security headers for every response (applied in next.config.ts).
 *
 * script-src keeps 'unsafe-inline' because Next.js emits inline bootstrap scripts and a per-request nonce would
 * force every page to be rendered dynamically (it defeats the static shell). Everything else is locked down:
 * no framing, no plugins, same-origin fetches only, and images only from self plus OpenStreetMap tiles.
 * Fonts come from next/font (self-hosted at build); the Google Fonts hosts are allowed for completeness.
 */

type Options = { readonly dev: boolean };

const OSM_TILES = ["https://tile.openstreetmap.org", "https://*.tile.openstreetmap.org"];

export function buildCsp({ dev }: Options): string {
  const directives: Record<string, readonly string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    "img-src": ["'self'", "data:", "blob:", ...OSM_TILES],
    "connect-src": ["'self'"],
    "frame-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

export type HeaderEntry = { readonly key: string; readonly value: string };

export function securityHeaders(options: Options): HeaderEntry[] {
  return [
    { key: "Content-Security-Policy", value: buildCsp(options) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    ...(options.dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
  ];
}
