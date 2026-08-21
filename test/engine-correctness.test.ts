// Regression suite for the adversarial correctness pass over the rules engine.
// Every case here pins a defect where the engine returned a CONFIDENTLY WRONG
// verdict — the worst failure mode for this product, because a wrong "green"
// sends a claim to the same three-week death the scan exists to prevent.
// Defects located by an OpenAI Codex review pass; see CODEX_LOG.md.
import { describe, it, expect } from "vitest";
import rulesJson from "../src/generated/rules.json";
import personasJson from "../src/generated/personas.json";
import { scan } from "../src/engine";
import type { Claim, MemberRecord, Rule, ServiceEntry } from "../src/engine";

const NOW = "2026-08-20T00:00:00Z";
const rules = (rulesJson as { rules: Rule[] }).rules;
const personas = (personasJson as { personas: { id: string; record: MemberRecord }[] }).personas;

const FINAL: Claim = { type: "form19_final", amount_requested: 0, purpose: "Final settlement" };
const ADVANCE: Claim = { type: "form31_68J", amount_requested: 60000, purpose: "Mother's surgery" };
const TRANSFER: Claim = { type: "transfer", amount_requested: 0, purpose: "Transfer to new employer" };

type Deep = Record<string, unknown>;

/** Deep-merge overrides onto a clone of a persona record. Arrays replace wholesale. */
function withRecord(personaId: string, overrides: Deep): MemberRecord {
  const base = structuredClone(personas.find((p) => p.id === personaId)!.record) as unknown as Deep;
  const merge = (target: Deep, patch: Deep): Deep => {
    for (const [k, v] of Object.entries(patch)) {
      if (v !== null && typeof v === "object" && !Array.isArray(v) && typeof target[k] === "object" && target[k] !== null && !Array.isArray(target[k])) {
        merge(target[k] as Deep, v as Deep);
      } else {
        target[k] = v;
      }
    }
    return target;
  };
  return merge(base, overrides) as unknown as MemberRecord;
}

const service = (e: Partial<ServiceEntry>): ServiceEntry => ({
  establishment: "Test Establishment",
  memberId: "TSTST99990000000000001",
  joinDate: "2018-01-01",
  exitDate: null,
  exitMarked: false,
  current: false,
  ...e,
});

const firedRules = (record: MemberRecord, claim: Claim): string[] =>
  scan(record, claim, rules, NOW).findings.map((f) => f.ruleId);

describe("R06 — Aadhaar linkage means linked AND verified", () => {
  it("fires when Aadhaar is linked to the UAN but never verified", () => {
    // The rule reads "Aadhaar not linked/verified against UAN" and the record carries
    // kyc.aadhaar.verified, but the check only ever read uan.aadhaarLinked.
    const record = withRecord("clean-asha", {
      uan: { aadhaarLinked: true },
      kyc: { aadhaar: { verified: false } },
    });
    expect(firedRules(record, ADVANCE)).toContain("R06_AADHAAR_LINK");
  });

  it("stays quiet when Aadhaar is both linked and verified", () => {
    const record = withRecord("clean-asha", { uan: { aadhaarLinked: true }, kyc: { aadhaar: { verified: true } } });
    expect(firedRules(record, ADVANCE)).not.toContain("R06_AADHAAR_LINK");
  });
});

describe("R05 — exit actually closed, not merely flagged", () => {
  it("fires when an exit is flagged as marked but carries no exit date", () => {
    // exitMarked: true with a null exitDate is precisely the '3A ABSENT' shape:
    // the flag says closed, the record has no date to settle against.
    const record = withRecord("clean-asha", {
      serviceHistory: [service({ joinDate: "2017-02-01", exitDate: null, exitMarked: true, current: false })],
    });
    expect(firedRules(record, FINAL)).toContain("R05_EXIT_DATE");
  });

  it("fires on final settlement while an employment is still current", () => {
    // You cannot finally settle a PF account you are still contributing to.
    const record = withRecord("clean-asha", {
      serviceHistory: [service({ joinDate: "2018-07-02", exitDate: null, exitMarked: false, current: true })],
    });
    expect(firedRules(record, FINAL)).toContain("R05_EXIT_DATE");
  });

  it("does not fire on a transfer merely because the new job is current", () => {
    // Guard against the fix over-firing: a current employment is the NORMAL state
    // for a transfer — you are transferring into it.
    const record = withRecord("clean-asha", {
      serviceHistory: [
        service({ joinDate: "2016-01-11", exitDate: "2021-05-31", exitMarked: true, current: false }),
        service({ joinDate: "2021-06-01", exitDate: null, exitMarked: false, current: true }),
      ],
    });
    expect(firedRules(record, TRANSFER)).not.toContain("R05_EXIT_DATE");
  });
});

describe("R07 — overlap detection covers open-ended service", () => {
  it("fires when two employments are open at the same time", () => {
    // Overlap was only ever tested when the earlier row had an exitDate, so the
    // most obvious overlap of all — two jobs still running — read as clean.
    const record = withRecord("clean-asha", {
      serviceHistory: [
        service({ establishment: "Alpha Works", joinDate: "2020-03-01", exitDate: null, current: true }),
        service({ establishment: "Beta Industries", joinDate: "2022-09-15", exitDate: null, current: true }),
      ],
    });
    expect(firedRules(record, FINAL)).toContain("R07_SERVICE_OVERLAP");
  });
});

describe("R10 — service length measured in calendar months, counted once", () => {
  const panless = { kyc: { pan: { present: false, name: null } } };

  it("does not fire at exactly five calendar years of service", () => {
    // 2021-01-01 → 2026-01-01 is 1826 days; at 30.44 days/month that is 59.99,
    // so the approximation reported under 5 years for a span that is exactly 5.
    const record = withRecord("clean-asha", {
      ...panless,
      serviceHistory: [service({ joinDate: "2021-01-01", exitDate: "2026-01-01", exitMarked: true, current: false })],
    });
    expect(firedRules(record, FINAL)).not.toContain("R10_PAN_TDS");
  });

  it("counts overlapping service once instead of double-counting it", () => {
    // Two overlapping rows summing to 72 months but spanning only 41 actual months.
    // Double-counting cleared a member who is genuinely under 5 years and exposed to TDS.
    const record = withRecord("clean-asha", {
      ...panless,
      serviceHistory: [
        service({ establishment: "Alpha Works", joinDate: "2021-01-01", exitDate: "2024-01-01", exitMarked: true }),
        service({ establishment: "Beta Industries", joinDate: "2021-06-01", exitDate: "2024-06-01", exitMarked: true }),
      ],
    });
    expect(firedRules(record, FINAL)).toContain("R10_PAN_TDS");
  });

  it("does not silently clear a member whose service dates are unparseable", () => {
    // NaN months made `serviceMonths < 60` false, so a garbage record read as
    // "over five years, no TDS risk" — a confident answer from no information.
    const record = withRecord("clean-asha", {
      ...panless,
      serviceHistory: [service({ joinDate: "not-a-date", exitDate: "2024-01-01", exitMarked: true })],
    });
    expect(firedRules(record, FINAL)).toContain("R10_PAN_TDS");
  });
});

describe("R03 — impossible dates fail honestly instead of normalising", () => {
  it("does not treat an impossible date of birth as a match", () => {
    // Date.parse("1990-02-31") silently yields 1990-03-03, so an impossible DOB
    // compared clean against a real 1990-03-03 Aadhaar date.
    const record = withRecord("clean-asha", {
      uan: { dob: "1990-02-31" },
      kyc: { aadhaar: { dob: "1990-03-03" } },
    });
    expect(firedRules(record, ADVANCE)).toContain("R03_DOB_GAP");
  });
});

describe("partial records degrade honestly rather than crashing the scan", () => {
  it("returns findings instead of throwing when KYC blocks are missing", () => {
    // scan() had no error boundary: one absent nested object took down the whole
    // health scan, so the user saw a crash instead of the defects that were found.
    const record = withRecord("clean-asha", {});
    delete (record as unknown as Deep).kyc;
    delete (record as unknown as Deep).balance;

    expect(() => scan(record, ADVANCE, rules, NOW)).not.toThrow();
    const result = scan(record, ADVANCE, rules, NOW);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.readiness).not.toBe("green");
  });
});
