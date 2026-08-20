// LLM layer: transport resilience + graceful degradation. No live calls here —
// fetch is stubbed; the live path is exercised by the OCP browser smoke.
import { afterEach, describe, expect, it, vi } from "vitest";
import { chatJson, llmConfigured } from "../src/llm/client";
import { explainRemark, mapIntent } from "../src/llm/explain";
import rulesJson from "../src/generated/rules.json";
import type { Rule } from "../src/engine";

const env = { OPENAI_BASE_URL: "http://llm.test/v1", OPENAI_API_KEY: "k", EXPLAIN_MODEL: "m" };
const rule = (rulesJson as { rules: Rule[] }).rules.find((r) => r.id === "R01_NAME_UAN_AADHAAR")!;
const req = { system: "s", user: "u", schemaName: "t", schema: { type: "object" } };

const reply = (content: unknown) =>
  new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe("chatJson", () => {
  it("returns null when unconfigured, without calling fetch", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(llmConfigured({})).toBe(false);
    expect(await chatJson({}, req)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("parses structured output", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ a: 1 })));
    expect(await chatJson(env, req)).toEqual({ a: 1 });
  });

  it("retries 429 honoring Retry-After, then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 429, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(reply({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await chatJson(env, req)).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after repeated 5xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 500 })));
    expect(await chatJson(env, req)).toBeNull();
  }, 15_000);

  it("returns null on malformed content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "not json" } }] }), { status: 200 })),
    );
    expect(await chatJson(env, req)).toBeNull();
  });
});

describe("degradation", () => {
  it("explainRemark falls back to the engine's canned text", async () => {
    const ex = await explainRemark({}, "NAME NOT MATCHED WITH AADHAAR", rule);
    expect(ex.source).toBe("canned");
    expect(ex.meaning_en).toBe(rule.kills.trim());
    expect(ex.action_en).toContain("joint declaration");
  });

  it("mapIntent degrades to unknown/unavailable", async () => {
    expect(await mapIntent({}, "need money for surgery")).toMatchObject({ claim_type: "unknown", source: "unavailable" });
  });

  it("explainRemark marks live output as llm", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        reply({ meaning_en: "m", action_en: "a", meaning_hi: "म", action_hi: "क", meaning_as: "ম", action_as: "ক" }),
      ),
    );
    const ex = await explainRemark(env, "X", rule);
    expect(ex.source).toBe("llm");
    expect(ex.meaning_hi).toBe("म");
  });
});
