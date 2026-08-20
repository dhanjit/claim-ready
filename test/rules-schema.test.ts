// D1 gate: the compiled rules/personas artifacts are internally consistent.
// Engine behavior tests (one per rule) live in test/engine.test.ts from D2.
import { describe, it, expect } from "vitest";
import rulesJson from "../src/generated/rules.json";
import personasJson from "../src/generated/personas.json";

const { rules } = rulesJson as { rules: any[] };
const { personas } = personasJson as { personas: any[] };

describe("rules.yaml", () => {
  it("has 10 rules with unique ids", () => {
    expect(rules.length).toBe(10);
    expect(new Set(rules.map((r) => r.id)).size).toBe(10);
  });

  it.each(rules.map((r) => [r.id, r]))("%s carries verdict + fix-path fields", (_id, r: any) => {
    expect(r.severity).toMatch(/^(blocker|risk|warning)$/);
    expect(r.kills.length).toBeGreaterThan(20);
    expect(r.fix.steps.length).toBeGreaterThan(0);
    expect(r.fix.owner).toMatch(/^(member|employer|bank)$/);
    expect(typeof r.fix.est_days).toBe("number");
    expect(r.source.length).toBeGreaterThan(10);
  });
});

describe("personas.yaml", () => {
  it("covers every rule at least once and includes a clean persona", () => {
    const covered = new Set(personas.flatMap((p) => p.expected_findings));
    for (const r of rules) expect(covered.has(r.id), `rule ${r.id} uncovered`).toBe(true);
    expect(personas.some((p) => p.expected_findings.length === 0)).toBe(true);
  });

  it.each(personas.map((p) => [p.id, p]))("%s uses only synthetic identifiers", (_id, p: any) => {
    expect(p.record.uan.number).toMatch(/^9999\d{8}$/);
    expect(p.record.kyc.bank.ifsc).toMatch(/^TEST/);
    expect(p.record.kyc.aadhaar.maskedRef).toMatch(/^XXXX XXXX \d{4}$/);
    expect(p.record.uan.mobile).toMatch(/^90000000\d{2}$/);
  });
});
