// The claim token replaces the in-memory claim store. It is the ONLY thing
// carrying a filed claim between requests, and it arrives from the client, so
// it is untrusted input: decode must validate, never merely parse.
// Context: #26 — module-scope state is per-isolate on Cloudflare and 404s.
import { describe, it, expect } from "vitest";
import rulesJson from "../src/generated/rules.json";
import type { Rule } from "../src/engine";
import { encodeClaimToken, decodeClaimToken } from "../src/claimToken";
import type { FiledClaim } from "../src/claimToken";

const rules = (rulesJson as { rules: Rule[] }).rules;
const ruleIds = new Set(rules.map((r) => r.id));
const knownUan = (uan: string) => /^9999\d{8}$/.test(uan);

const filed: FiledClaim = {
  uan: "999900000002",
  personaId: "name-gap-rahul",
  claim: { type: "form31_68J", amount_requested: 80000, purpose: "Mother's surgery" },
  filedAtIso: "2026-08-20T00:00:00.000Z",
  blockerRuleIds: ["R01_NAME_UAN_AADHAAR", "R02_NAME_UAN_BANK"],
  scanSkipped: true,
  // Acknowledgement returned by the submission adapter — the seam a real EPFO
  // integration would sit behind. Carried in the token so it stays stable.
  submissionRef: "CR-0002-0001",
};

const decode = (token: string) => decodeClaimToken(token, { isKnownUan: knownUan, isKnownRuleId: (id) => ruleIds.has(id) });

describe("claim token round-trip", () => {
  it("returns exactly what was encoded", () => {
    expect(decode(encodeClaimToken(filed))).toEqual(filed);
  });

  it("survives a non-ASCII purpose", () => {
    // Intent is typed in the user's own language; a token that mangles Devanagari
    // would corrupt the claim between filing and tracking.
    const hindi = { ...filed, claim: { ...filed.claim, purpose: "माँ की सर्जरी के लिए ₹80,000 चाहिए" } };
    expect(decode(encodeClaimToken(hindi))).toEqual(hindi);
  });

  it("produces a URL-safe token the claim route accepts", () => {
    // The worker route is /^\/api\/claims\/([\w-]+)$/ — a token with +, / or =
    // would 404 instead of resolving.
    expect(encodeClaimToken(filed)).toMatch(/^[\w-]+$/);
  });

  it("distinguishes different claims", () => {
    const other = { ...filed, claim: { ...filed.claim, amount_requested: 1 } };
    expect(encodeClaimToken(other)).not.toBe(encodeClaimToken(filed));
  });
});

describe("claim token rejects untrusted input", () => {
  it("rejects garbage", () => {
    expect(decode("not-a-token")).toBeNull();
  });

  it("rejects an empty token", () => {
    expect(decode("")).toBeNull();
  });

  it("rejects a truncated token", () => {
    const token = encodeClaimToken(filed);
    expect(decode(token.slice(0, Math.floor(token.length / 2)))).toBeNull();
  });

  it("rejects a token carrying an unknown UAN", () => {
    // Without this, a hand-edited token would drive the lifecycle for a member
    // that does not exist.
    expect(decode(encodeClaimToken({ ...filed, uan: "123456789012" }))).toBeNull();
  });

  it("rejects a token carrying an unknown rule id", () => {
    expect(decode(encodeClaimToken({ ...filed, blockerRuleIds: ["R99_MADE_UP"] }))).toBeNull();
  });

  it("rejects a token carrying an unknown claim type", () => {
    const bad = { ...filed, claim: { ...filed.claim, type: "form99_nope" } } as unknown as FiledClaim;
    expect(decode(encodeClaimToken(bad))).toBeNull();
  });

  it("rejects a token with a non-numeric amount", () => {
    const bad = { ...filed, claim: { ...filed.claim, amount_requested: "lots" } } as unknown as FiledClaim;
    expect(decode(encodeClaimToken(bad))).toBeNull();
  });

  it("rejects a token with an unreadable filing date", () => {
    expect(decode(encodeClaimToken({ ...filed, filedAtIso: "not-a-date" }))).toBeNull();
  });

  it("rejects a token with no submission reference", () => {
    const bad = { ...filed, submissionRef: undefined } as unknown as FiledClaim;
    expect(decode(encodeClaimToken(bad))).toBeNull();
  });
});
