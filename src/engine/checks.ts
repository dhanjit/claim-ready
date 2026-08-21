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
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]|$)/;

/** Strict ISO date → epoch ms, or NaN. Date.parse silently NORMALIZES impossible
 *  calendar dates ("1990-02-31" becomes 1990-03-03), which let a nonsense DOB
 *  compare clean against a real one. An unreadable date must fail honestly,
 *  never resolve to a confident wrong answer. */
export function parseIsoDate(value: unknown): number {
  const match = ISO_DATE.exec(String(value ?? ""));
  if (!match) return NaN;
  const [, year, month, day] = match;
  const ms = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const round = new Date(ms);
  const sameDate =
    round.getUTCFullYear() === Number(year) &&
    round.getUTCMonth() === Number(month) - 1 &&
    round.getUTCDate() === Number(day);
  return sameDate ? ms : NaN;
}

/** Whole calendar months between two instants — not days/30.44. The approximation
 *  made the verdict depend on where leap days happened to fall: an identical
 *  five-year span read as 59.99 months with one leap day and 60.02 with two. */
function calendarMonths(startMs: number, endMs: number): number {
  const a = new Date(startMs);
  const b = new Date(endMs);
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

interface Span {
  establishment: string;
  start: number;
  end: number;
  openEnded: boolean;
}

/** Service rows as date spans. A row with no exit date that is still `current`
 *  runs to now; an unclosed non-current row is R05's problem and is skipped here.
 *  Returns null if any row is unreadable — see parseIsoDate. */
function serviceSpans(entries: ServiceEntry[] | undefined, nowIso: string): Span[] | null {
  const spans: Span[] = [];
  for (const entry of entries ?? []) {
    const start = parseIsoDate(entry.joinDate);
    if (Number.isNaN(start)) return null;
    const openEnded = !entry.exitDate;
    if (openEnded && !entry.current) continue;
    const end = openEnded ? parseIsoDate(nowIso) : parseIsoDate(entry.exitDate);
    if (Number.isNaN(end) || end < start) return null;
    spans.push({ establishment: entry.establishment, start, end, openEnded });
  }
  return spans;
}

/** Total months actually served, counting overlapping employment once. Summing
 *  rows independently double-counted overlaps and could clear a member who is
 *  genuinely under five years — the exact case R10 exists to catch. */
function monthsOfService(spans: Span[]): number {
  if (spans.length === 0) return 0;
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const merged: Array<[number, number]> = [[sorted[0].start, sorted[0].end]];
  for (const span of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (span.start <= last[1]) last[1] = Math.max(last[1], span.end);
    else merged.push([span.start, span.end]);
  }
  return merged.reduce((total, [start, end]) => total + calendarMonths(start, end), 0);
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
      const leftMs = parseIsoDate(left);
      const rightMs = parseIsoDate(right);
      if (Number.isNaN(leftMs) || Number.isNaN(rightMs)) {
        return { pass: false, details: { left, right, gapDays: null, maxDays: spec.max_days!, unreadable: true } };
      }
      const gapDays = Math.round(Math.abs(leftMs - rightMs) / DAY_MS);
      return { pass: gapDays <= spec.max_days!, details: { left, right, gapDays, maxDays: spec.max_days! } };
    }
    case "bank_kyc_ok": {
      const bank = record.kyc?.bank;
      if (!bank) return { pass: false, details: { seeded: null, jointAccount: null, unreadable: true } };
      return { pass: bank.seeded === true && bank.jointAccount !== true, details: { seeded: bank.seeded, jointAccount: bank.jointAccount } };
    }
    case "exit_marked_latest": {
      const history = record.serviceHistory ?? [];
      // "Marked" means an exit date actually exists. exitMarked: true with a null
      // date is the '3A ABSENT' shape itself: the flag claims closed, the record
      // has nothing to settle against.
      const unmarked = history.filter((e) => !e.current && (!e.exitMarked || Number.isNaN(parseIsoDate(e.exitDate))));
      // A transfer moves INTO a current job, so current employment is normal there.
      // Final settlement and pension withdrawal cannot proceed while still employed.
      const stillEmployed = claim.type === "transfer" ? [] : history.filter((e) => e.current);
      return {
        pass: unmarked.length === 0 && stillEmployed.length === 0,
        details: {
          unmarkedEstablishments: unmarked.map((e) => e.establishment).join("; ") || null,
          stillEmployedAt: stillEmployed.map((e) => e.establishment).join("; ") || null,
        },
      };
    }
    case "flag_true": {
      const value = resolvePath(record, spec.path!);
      return {
        pass: value === true,
        details: { path: spec.path!, value: typeof value === "boolean" ? value : value === undefined ? null : String(value) },
      };
    }
    case "all_true": {
      // Some preconditions are two facts, not one — Aadhaar must be both linked to
      // the UAN and actually verified. Reporting the first failing path keeps the
      // fix instruction specific.
      const paths = spec.paths ?? [];
      const failing = paths.filter((p) => resolvePath(record, p) !== true);
      return {
        pass: failing.length === 0,
        details: { paths: paths.join(", "), failing: failing.join(", ") || null },
      };
    }
    case "no_service_overlap": {
      const spans = serviceSpans(record.serviceHistory, nowIso);
      if (spans === null) return { pass: false, details: { unreadable: true } };
      const sorted = [...spans].sort((a, b) => a.start - b.start);
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const a = sorted[i];
          const b = sorted[j];
          // Open-ended rows overlap too — two jobs still running is the most
          // obvious overlap there is, and it used to read as clean.
          if (b.start <= a.end) {
            return {
              pass: false,
              details: {
                a: a.establishment,
                b: b.establishment,
                overlapFrom: new Date(b.start).toISOString().slice(0, 10),
                overlapTo: new Date(Math.min(a.end, b.end)).toISOString().slice(0, 10),
                openEnded: a.openEnded || b.openEnded,
              },
            };
          }
        }
      }
      return { pass: true, details: {} };
    }
    case "amount_cap_68j": {
      const balance = record.balance;
      if (!balance) return { pass: false, details: { requested: claim.amount_requested, cap: null, unreadable: true } };
      const wageCap = 6 * balance.monthlyWage;
      const cap = Math.min(wageCap, balance.employeeShare);
      return {
        pass: claim.amount_requested <= cap,
        details: { requested: claim.amount_requested, cap, wageCap, employeeShare: balance.employeeShare },
      };
    }
    case "pan_tds": {
      const panPresent = record.kyc?.pan?.present === true;
      const settlementBalance = (record.balance?.employeeShare ?? 0) + (record.balance?.employerShare ?? 0);
      const spans = serviceSpans(record.serviceHistory, nowIso);
      if (spans === null) {
        // Unreadable service dates mean we cannot say the member has crossed five
        // years. Previously NaN months made `< 60` false and silently cleared them:
        // a confident "no TDS risk" derived from no information at all.
        return {
          pass: !(!panPresent && settlementBalance > 50_000),
          details: { panPresent, serviceMonths: null, settlementBalance, unreadable: true },
        };
      }
      const serviceMonths = monthsOfService(spans);
      const exposed = !panPresent && serviceMonths < 60 && settlementBalance > 50_000;
      return { pass: !exposed, details: { panPresent, serviceMonths, settlementBalance } };
    }
  }
}
