import { describe, expect, it } from "vitest";
import { BodyTooLargeError, clientIp, readJsonBody } from "./request";

const req = (headers: Record<string, string>, body?: BodyInit): Request =>
  new Request("http://localhost/api", { method: "POST", headers, ...(body !== undefined ? { body } : {}) });

describe("clientIp", () => {
  it("prefers the platform headers over anything the client could forge", () => {
    expect(clientIp(req({ "true-client-ip": "1.1.1.1", "x-real-ip": "2.2.2.2", "x-forwarded-for": "9.9.9.9" }))).toBe("1.1.1.1");
    expect(clientIp(req({ "x-real-ip": "2.2.2.2", "x-forwarded-for": "9.9.9.9" }))).toBe("2.2.2.2");
  });

  it("uses the last X-Forwarded-For hop, not the client-controlled first one", () => {
    expect(clientIp(req({ "x-forwarded-for": "6.6.6.6, 7.7.7.7, 3.3.3.3" }))).toBe("3.3.3.3");
    expect(clientIp(req({ "x-forwarded-for": " 4.4.4.4 " }))).toBe("4.4.4.4");
  });

  it("falls back to a fixed key when no address is known", () => {
    expect(clientIp(req({}))).toBe("unknown");
  });
});

describe("readJsonBody", () => {
  it("parses a small JSON body", async () => {
    expect(await readJsonBody(req({ "content-type": "application/json" }, '{"a":1}'), 100)).toEqual({ a: 1 });
  });

  it("rejects a declared Content-Length over the limit without reading the body", async () => {
    const r = {
      headers: new Headers({ "content-length": "5000" }),
      get body(): never {
        throw new Error("body touched");
      },
    } as unknown as Request;
    await expect(readJsonBody(r, 100)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it("cuts off a stream that exceeds the limit even without a Content-Length", async () => {
    const chunk = new TextEncoder().encode("x".repeat(60));
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += 1;
        if (sent > 50) controller.close();
        else controller.enqueue(chunk);
      },
    });
    const r = new Request("http://localhost/api", { method: "POST", body, duplex: "half" } as RequestInit);
    await expect(readJsonBody(r, 100)).rejects.toBeInstanceOf(BodyTooLargeError);
    expect(sent).toBeLessThan(10);
  });

  it("counts bytes, not characters", async () => {
    const text = JSON.stringify({ s: "é".repeat(60) });
    await expect(readJsonBody(req({}, text), 100)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it("throws on invalid JSON and on an empty body", async () => {
    await expect(readJsonBody(req({}, "{nope"), 100)).rejects.toBeInstanceOf(SyntaxError);
    await expect(readJsonBody(new Request("http://localhost/api", { method: "POST" }), 100)).rejects.toThrow();
  });
});
