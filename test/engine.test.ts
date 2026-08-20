// One test per rule (fires on its defect persona) + exact-set scan per persona
// (catches false positives) + check-level edges.
import { describe, it, expect } from "vitest";
import rulesJson from "../src/generated/rules.json";
import personasJson from "../src/generated/personas.json";
import { normalizeName, ruleApplies, scan } from "../src/engine";
import type { Claim, MemberRecord, Rule } from "../src/engine";
import { createMockAdapters, MockOtp } from "../src/adapters/mock";

const NOW = "2026-08-20T00:00:00Z";
const rules = (rulesJson as { rules: Rule[] }).rules;
const personas = (personasJson as { personas: { id: string; expected_findings: string[]; claim: Claim; record: MemberRecord }[] }).personas;

const scanPersona = (p: (typeof personas)[number]) => scan(p.record, p.claim, rules, NOW);

describe("one test per rule", () => {
  it.each(rules.map((r) => [r.id] as const))("%s fires on its defect persona", (ruleId) => {
    const carriers = personas.filter((p) => p.expected_findings.includes(ruleId));
    expect(carriers.length, `no persona carries ${ruleId}`).toBeGreaterThan(0);
    for (const p of carriers) {
      const found = scanPersona(p).findings.map((f) => f.ruleId);
      expect(found, `persona ${p.id}`).toContain(ruleId);
    }
  });
});

describe("exact findings per persona (no false positives)", () => {
  it.each(personas.map((p) => [p.id, p] as const))("%s", (_id, p) => {
    const found = scanPersona(p).findings.map((f) => f.ruleId).sort();
    expect(found).toEqual([...p.expected_findings].sort());
  });
});

describe("verdict roll-up", () => {
  it("clean persona is green with score 100 and zero days to ready", () => {
    const clean = personas.find((p) => p.expected_findings.length === 0)!;
    const result = scanPersona(clean);
    expect(result).toMatchObject({ readiness: "green", score: 100, estDaysToReady: 0 });
  });

  it("any blocker makes readiness red and surfaces the longest fix path", () => {
    const rahul = personas.find((p) => p.id === "name-gap-rahul")!;
    const result = scanPersona(rahul);
    expect(result.readiness).toBe("red");
    expect(result.counts.blocker).toBe(2);
    expect(result.estDaysToReady).toBe(15); // joint declaration dominates the bank fix
    expect(result.score).toBe(40);
  });

  it("68J details carry the computed cap for the UI/LLM layer", () => {
    const sunita = personas.find((p) => p.id === "cap-sunita")!;
    const capFinding = scanPersona(sunita).findings.find((f) => f.ruleId === "R08_68J_CAP")!;
    expect(capFinding.details).toMatchObject({ requested: 150000, cap: 84000 });
  });
});

describe("check semantics", () => {
  it("name matching forgives formatting, not abbreviation", () => {
    expect(normalizeName("  RAVI   KUMAR ")).toBe(normalizeName("Ravi Kumar."));
    expect(normalizeName("Rahul Kr. Sharma")).not.toBe(normalizeName("Rahul Kumar Sharma"));
  });

  it("applies_to gates rules by claim type", () => {
    const exitRule = rules.find((r) => r.id === "R05_EXIT_DATE")!;
    expect(ruleApplies(exitRule, { type: "form31_68J", amount_requested: 1, purpose: "" })).toBe(false);
    expect(ruleApplies(exitRule, { type: "form19_final", amount_requested: 0, purpose: "" })).toBe(true);
  });
});

describe("mock adapters", () => {
  it("directory resolves personas by UAN and lists them", async () => {
    const { directory } = createMockAdapters(NOW);
    expect(await directory.getByUan("999900000001")).not.toBeNull();
    expect(await directory.getByUan("999999999999")).toBeNull();
    expect((await directory.listPersonas()).length).toBe(personas.length);
  });

  it("OTP delivery fails exactly when the Aadhaar mobile is unlinked (mirrors R09)", async () => {
    const otp = new MockOtp();
    expect((await otp.send("999900000001")).delivered).toBe(true); // asha
    const sunita = await otp.send("999900000007");
    expect(sunita.delivered).toBe(false);
    expect(sunita.reason).toMatch(/not linked/);
  });

  it("clock fast-forwards deterministically", () => {
    const { clock } = createMockAdapters(NOW);
    clock.advanceDays(12);
    expect(clock.nowIso()).toBe("2026-09-01T00:00:00.000Z");
  });
});
