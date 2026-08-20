import { runCheck } from "./checks";
import type { Claim, Finding, MemberRecord, Rule, ScanResult, Severity } from "./types";

export * from "./types";
export { normalizeName } from "./checks";

const SCORE_PENALTY: Record<Severity, number> = { blocker: 30, risk: 15, warning: 5 };

export function ruleApplies(rule: Rule, claim: Claim): boolean {
  return rule.applies_to === "all" || rule.applies_to.includes(claim.type);
}

/** The whole verdict layer. Pure and deterministic: same record + claim + rules
 *  + clock → same result. No I/O, no LLM — the model only ever narrates this. */
export function scan(record: MemberRecord, claim: Claim, rules: Rule[], nowIso: string): ScanResult {
  const findings: Finding[] = [];
  for (const rule of rules) {
    if (!ruleApplies(rule, claim)) continue;
    const outcome = runCheck(rule.check, record, claim, nowIso);
    if (!outcome.pass) {
      findings.push({
        ruleId: rule.id,
        title: rule.title,
        category: rule.category,
        severity: rule.severity,
        kills: rule.kills,
        fix: rule.fix,
        source: rule.source,
        details: outcome.details,
      });
    }
  }

  const counts = { blocker: 0, risk: 0, warning: 0 };
  for (const f of findings) counts[f.severity]++;

  const score = Math.max(
    0,
    findings.reduce((s, f) => s - SCORE_PENALTY[f.severity], 100),
  );
  const readiness = counts.blocker > 0 ? "red" : findings.length > 0 ? "amber" : "green";
  const estDaysToReady = findings.reduce((m, f) => Math.max(m, f.fix.est_days), 0);

  return { readiness, score, findings, counts, estDaysToReady };
}
