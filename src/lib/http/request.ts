/** Request helpers for the API routes: caller identity and size-limited body reading. */

const UNKNOWN_IP = "unknown";

/**
 * The caller's address for rate limiting. Platform headers are set by the host's edge and cannot be forged by
 * the client there (Render: `true-client-ip`; Vercel: `x-real-ip`). Otherwise the last `X-Forwarded-For`
 * hop is used: it is the one our own proxy appended, whereas the first entry is whatever the client sent.
 */
export function clientIp(req: Request): string {
  const platform = req.headers.get("true-client-ip")?.trim() || req.headers.get("x-real-ip")?.trim();
  if (platform) return platform;
  const hops = req.headers.get("x-forwarded-for")?.split(",").map((h) => h.trim()).filter(Boolean);
  return hops?.[hops.length - 1] ?? UNKNOWN_IP;
}

export class BodyTooLargeError extends Error {
  constructor() {
    super("Request body is too large.");
    this.name = "BodyTooLargeError";
  }
}

async function readLimited(body: ReadableStream<Uint8Array>, maxBytes: number): Promise<string> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/**
 * Reads a JSON body of at most `maxBytes`. A declared `Content-Length` over the limit is rejected before any
 * byte is read, and the stream itself is cut off at the limit (the header can be absent or wrong).
 */
export async function readJsonBody(req: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLargeError();
  if (!req.body) throw new Error("empty body");
  return JSON.parse(await readLimited(req.body, maxBytes));
}
