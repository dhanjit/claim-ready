// Fix-loop simulation: applying a rule's fix overlay makes exactly that finding
// disappear on re-scan; fixtures are never mutated.
import { describe, it, expect } from "vitest";
import rulesJson from "../src/generated/rules.json";
import personasJson from "../src/generated/personas.json";
import { scan } from "../src/engine";
import type { Claim, MemberRecord, Rule } from "../src/engine";
import { applyFixes } from "../src/adapters/mock";

const NOW = "2026-08-20T00:00:00Z";
const rules = (rulesJson as { rules: Rule[] }).rules;
const personas = (personasJson as { personas: { id: string; expected_findings: string[]; claim: Claim; record: MemberRecord }[] }).personas;

const get = (id: string) => personas.find((p) => p.id === id)!;
const findingIds = (record: MemberRecord, claim: Claim) => scan(record, claim, rules, NOW).findings.map((f) => f.ruleId).sort();

describe("fix overlays", () => {
  it.each(personas.filter((p) => p.expected_findings.length > 0).map((p) => [p.id, p] as const))(
    "%s goes green after fixing everything",
    (_id, p) => {
      const { record, claim } = applyFixes(p.record, p.claim, p.expected_findings);
      expect(findingIds(record, claim)).toEqual([]);
      expect(scan(record, claim, rules, NOW).readiness).toBe("green");
    },
  );

  it("partial fix clears only the fixed rule", () => {
    const rahul = get("name-gap-rahul");
    const { record, claim } = applyFixes(rahul.record, rahul.claim, ["R01_NAME_UAN_AADHAAR"]);
    expect(findingIds(record, claim)).toEqual(["R02_NAME_UAN_BANK"]);
  });

  it("the 68-J fix clamps the claim amount to the computed cap", () => {
    const sunita = get("cap-sunita");
    const { claim } = applyFixes(sunita.record, sunita.claim, ["R08_68J_CAP"]);
    expect(claim.amount_requested).toBe(84000);
  });

  it("never mutates the fixture", () => {
    const rahul = get("name-gap-rahul");
    const before = JSON.stringify(rahul.record);
    applyFixes(rahul.record, rahul.claim, rahul.expected_findings);
    expect(JSON.stringify(rahul.record)).toBe(before);
  });

  it("ignores unknown rule ids", () => {
    const asha = get("clean-asha");
    const { record, claim } = applyFixes(asha.record, asha.claim, ["R99_NOPE"]);
    expect(findingIds(record, claim)).toEqual([]);
  });
});
