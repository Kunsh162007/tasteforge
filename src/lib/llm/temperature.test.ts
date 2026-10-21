import { describe, expect, it } from "vitest";
import { temperatureFor } from "./gemini";
import { createGroqProvider, TEMPERATURE } from "./groq";

describe("sampling temperature", () => {
  it("is 0 for every Groq tier, so a repeated request picks the same items", () => {
    expect(TEMPERATURE).toEqual({ light: 0, main: 0 });
  });

  it("sends temperature 0 on the synthesis call", async () => {
    let body: { temperature?: number } = {};
    const fetchImpl = (async (_url: unknown, init?: { body?: string }) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const groq = createGroqProvider({ apiKey: "k", model: "openai/gpt-oss-120b", fetchImpl });
    await groq.chatJson({ system: "s", prompt: "p", tier: "main" });
    expect(body.temperature).toBe(0);
  });

  it("is 0 for Gemini 2.5 and left to the model for Gemini 3", () => {
    expect(temperatureFor("gemini-2.5-flash")).toEqual({ temperature: 0 });
    expect(temperatureFor("gemini-3.5-flash")).toEqual({});
  });
});
