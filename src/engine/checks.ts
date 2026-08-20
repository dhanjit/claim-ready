import type { CheckSpec, Claim, MemberRecord, ServiceEntry } from "./types";

export interface CheckOutcome {
  pass: boolean;
  details: Record<string, string | number | boolean | null>;
}

/** Case/punctuation/spacing-insensitive normalization. Abbreviation differences
 *  ("Kumar" vs "Kr") deliberately do NOT match — that is exactly what field
 *  offices reject, and the fix is a joint declaration, not leniency here. */
export function normalizeName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z ]/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

function resolvePath(record: MemberRecord, path: string): unknown {
  let cur: unknown = record;
  for (const seg of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

const DAY_MS = 86_400_000;

function daysBetween(aIso: string, bIso: string): number {
  return Math.abs(Date.parse(aIso) - Date.parse(bIso)) / DAY_MS;
}

function monthsOfService(entries: ServiceEntry[], nowIso: string): number {
  let months = 0;
  for (const e of entries) {
    const end = e.exitDate ?? (e.current ? nowIso : null);
    if (!end) continue; // unclosed, non-current — R05's problem, not double-counted here
    months += Math.max(0, (Date.parse(end) - Date.parse(e.joinDate)) / (DAY_MS * 30.44));
  }
  return months;
}

export function runCheck(spec: CheckSpec, record: MemberRecord, claim: Claim, nowIso: string): CheckOutcome {
  switch (spec.type) {
    case "name_match": {
      const left = String(resolvePath(record, spec.left!) ?? "");
      const right = String(resolvePath(record, spec.right!) ?? "");
      const pass = normalizeName(left) === normalizeName(right) && left.length > 0;
      return { pass, details: { left, right } };
    }
    case "date_gap": {
      const left = String(resolvePath(record, spec.left!) ?? "");
      const right = String(resolvePath(record, spec.right!) ?? "");
      const gapDays = Math.round(daysBetween(left, right));
      return { pass: gapDays <= spec.max_days!, details: { left, right, gapDays, maxDays: spec.max_days! } };
    }
    case "bank_kyc_ok": {
      const { seeded, jointAccount } = record.kyc.bank;
      return { pass: seeded && !jointAccount, details: { seeded, jointAccount } };
    }
    case "exit_marked_latest": {
      const unclosed = record.serviceHistory.filter((e) => !e.current && !e.exitMarked);
      return {
        pass: unclosed.length === 0,
        details: { unmarkedEstablishments: unclosed.map((e) => e.establishment).join("; ") || null },
      };
    }
    case "flag_true": {
      const value = resolvePath(record, spec.path!);
      return { pass: value === true, details: { path: spec.path!, value: value === undefined ? null : Boolean(value) } };
    }
    case "no_service_overlap": {
      const sorted = [...record.serviceHistory].sort((a, b) => Date.parse(a.joinDate) - Date.parse(b.joinDate));
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        if (prev.exitDate && Date.parse(sorted[i].joinDate) <= Date.parse(prev.exitDate)) {
          return {
            pass: false,
            details: { a: prev.establishment, b: sorted[i].establishment, overlapFrom: sorted[i].joinDate, overlapTo: prev.exitDate },
          };
        }
      }
      return { pass: true, details: {} };
    }
    case "amount_cap_68j": {
      const wageCap = 6 * record.balance.monthlyWage;
      const cap = Math.min(wageCap, record.balance.employeeShare);
      return {
        pass: claim.amount_requested <= cap,
        details: { requested: claim.amount_requested, cap, wageCap, employeeShare: record.balance.employeeShare },
      };
    }
    case "pan_tds": {
      const serviceMonths = monthsOfService(record.serviceHistory, nowIso);
      const settlementBalance = record.balance.employeeShare + record.balance.employerShare;
      const exposed = !record.kyc.pan.present && serviceMonths < 60 && settlementBalance > 50_000;
      return {
        pass: !exposed,
        details: { panPresent: record.kyc.pan.present, serviceMonths: Math.round(serviceMonths), settlementBalance },
      };
    }
  }
}
