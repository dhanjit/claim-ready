// The two demo arcs, as tests: file blind → rejected day 12 with the authentic
// remark; file clean → settled day 10, inside the 20-day SLA.
import { describe, it, expect } from "vitest";
import rulesJson from "../src/generated/rules.json";
import personasJson from "../src/generated/personas.json";
import { scan } from "../src/engine";
import type { Claim, MemberRecord, Rule } from "../src/engine";
import { claimStatusAt, REJECTION_REMARKS, SLA_DAYS } from "../src/engine/lifecycle";

const NOW = "2026-08-20T00:00:00Z";
const rules = (rulesJson as { rules: Rule[] }).rules;
const personas = (personasJson as { personas: { id: string; claim: Claim; record: MemberRecord }[] }).personas;

const blockersFor = (id: string) => {
  const p = personas.find((x) => x.id === id)!;
  return scan(p.record, p.claim, rules, NOW).findings.filter((f) => f.severity === "blocker");
};

describe("old world: Rahul files blind", () => {
  const blockers = blockersFor("name-gap-rahul");

  it("looks fine for 11 days", () => {
    expect(claimStatusAt(0, blockers).current.id).toBe("submitted");
    const day5 = claimStatusAt(5, blockers);
    expect(day5.current.id).toBe("under_scrutiny");
    expect(day5.remark).toBeNull();
    expect(day5.predicted?.state.id).toBe("rejected");
  });

  it("dies on day 12 with the authentic remark", () => {
    const day12 = claimStatusAt(12, blockers);
    expect(day12.current.id).toBe("rejected");
    expect(day12.current.terminal).toBe(true);
    expect(day12.remark).toBe(REJECTION_REMARKS.R01_NAME_UAN_AADHAAR);
    expect(day12.predicted).toBeNull();
    expect(day12.history.map((h) => h.id)).toEqual(["submitted", "under_scrutiny", "rejected"]);
  });
});

describe("new world: Asha files clean", () => {
  it("settles on day 10, inside the SLA", () => {
    const blockers = blockersFor("clean-asha");
    expect(blockers).toEqual([]);
    const day10 = claimStatusAt(10, blockers);
    expect(day10.current.id).toBe("settled");
    expect(day10.remark).toBeNull();
    expect(day10.sla.daysRemaining).toBe(SLA_DAYS - 10);
    expect(day10.sla.breached).toBe(false);
  });

  it("predicts the next state with an ETA along the way", () => {
    const day3 = claimStatusAt(3, []);
    expect(day3.current.id).toBe("under_scrutiny");
    expect(day3.predicted).toMatchObject({ inDays: 5 });
    expect(day3.predicted!.state.id).toBe("approved");
  });
});

describe("SLA clock", () => {
  it("flags breach only for a live claim past the norm", () => {
    expect(claimStatusAt(25, []).sla.breached).toBe(false); // settled long before
    // a rejected claim is terminal, not breached
    const rejected = claimStatusAt(25, blockersFor("bank-fail-imran"));
    expect(rejected.current.id).toBe("rejected");
    expect(rejected.sla.breached).toBe(false);
  });

  it("every rejection remark maps to a real rule", () => {
    const ids = new Set(rules.map((r) => r.id));
    for (const rid of Object.keys(REJECTION_REMARKS)) expect(ids.has(rid)).toBe(true);
  });
});
