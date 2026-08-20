// Claim lifecycle state machine — deterministic, driven only by (days elapsed,
// blockers at filing). Plain-language EN text is canned here; HI/AS renderings
// come from the LLM layer, which translates but never decides.
import type { Finding } from "./types";

export const SLA_DAYS = 20; // EPFO citizen-charter settlement norm

export type StateId = "submitted" | "under_scrutiny" | "approved" | "settled" | "rejected";

export interface StateInfo {
  id: StateId;
  label: string;
  holder: string;
  plainEn: string;
  terminal: boolean;
}

export const STATES: Record<StateId, StateInfo> = {
  submitted: {
    id: "submitted",
    label: "Submitted",
    holder: "EPFO regional office — inward queue",
    plainEn: "Your claim has been received. Nobody has looked at it yet; it is waiting in the office's inward queue.",
    terminal: false,
  },
  under_scrutiny: {
    id: "under_scrutiny",
    label: "Under scrutiny",
    holder: "Dealing assistant",
    plainEn: "A clerk is checking your papers against EPFO's records. Most rejections happen at this desk.",
    terminal: false,
  },
  approved: {
    id: "approved",
    label: "Approved",
    holder: "Accounts section",
    plainEn: "An officer has approved the claim. The payment is queued for transfer to your bank account.",
    terminal: false,
  },
  settled: {
    id: "settled",
    label: "Settled",
    holder: "—",
    plainEn: "Done — the money has been sent to your bank account. Allow a day or two for it to show up.",
    terminal: true,
  },
  rejected: {
    id: "rejected",
    label: "Rejected",
    holder: "—",
    plainEn: "The claim has been rejected. The official reason is below — and so is what it actually means and how to fix it.",
    terminal: true,
  },
};

/** Authentic-style rejection remarks per rule — the jargon the decoder translates. */
export const REJECTION_REMARKS: Record<string, string> = {
  R01_NAME_UAN_AADHAAR: "NAME NOT MATCHED WITH AADHAAR",
  R02_NAME_UAN_BANK: "NAME DIFFER IN BANK A/C",
  R03_DOB_GAP: "DOB NOT MATCHED / DIFFERENCE MORE THAN PERMISSIBLE",
  R04_BANK_KYC: "BANK KYC NOT SEEDED / JOINT A/C NOT ADMISSIBLE",
  R05_EXIT_DATE: "3A ABSENT / DOE NOT AVAILABLE",
  R06_AADHAAR_LINK: "UAN NOT SEEDED WITH AADHAAR",
  R07_SERVICE_OVERLAP: "SERVICE OVERLAPPING WITH OTHER MEMBER ID",
  R08_68J_CAP: "AMOUNT CLAIMED EXCEEDS ADMISSIBLE LIMIT UNDER PARA 68J",
  R09_MOBILE_AADHAAR: "OTP VERIFICATION FAILED",
};

interface TimelineStep {
  dayOffset: number;
  state: StateId;
}

const HAPPY_PATH: TimelineStep[] = [
  { dayOffset: 0, state: "submitted" },
  { dayOffset: 2, state: "under_scrutiny" },
  { dayOffset: 8, state: "approved" },
  { dayOffset: 10, state: "settled" },
];

const REJECTION_PATH: TimelineStep[] = [
  { dayOffset: 0, state: "submitted" },
  { dayOffset: 2, state: "under_scrutiny" },
  { dayOffset: 12, state: "rejected" },
];

export interface HistoryEntry extends StateInfo {
  dayOffset: number;
}

export interface ClaimStatus {
  current: HistoryEntry;
  history: HistoryEntry[];
  predicted: { state: StateInfo; inDays: number } | null;
  remark: string | null; // set when rejected
  sla: { totalDays: number; daysElapsed: number; daysRemaining: number; breached: boolean };
}

/** Where a claim stands `daysElapsed` days after filing, given the blockers that
 *  existed at filing. Same inputs → same status; the demo's fast-forward clock
 *  just changes daysElapsed. */
export function claimStatusAt(daysElapsed: number, blockersAtFiling: Finding[]): ClaimStatus {
  const rejected = blockersAtFiling.length > 0;
  const path = rejected ? REJECTION_PATH : HAPPY_PATH;

  const reached = path.filter((s) => s.dayOffset <= daysElapsed);
  const history = reached.map((s) => ({ ...STATES[s.state], dayOffset: s.dayOffset }));
  const current = history[history.length - 1];

  const nextStep = path.find((s) => s.dayOffset > daysElapsed) ?? null;
  const predicted = nextStep ? { state: STATES[nextStep.state], inDays: nextStep.dayOffset - daysElapsed } : null;

  const remark = current.id === "rejected" ? (REJECTION_REMARKS[blockersAtFiling[0].ruleId] ?? "CLAIM NOT ADMISSIBLE") : null;

  const daysRemaining = Math.max(0, SLA_DAYS - daysElapsed);
  return {
    current,
    history,
    predicted,
    remark,
    sla: { totalDays: SLA_DAYS, daysElapsed, daysRemaining, breached: daysElapsed > SLA_DAYS && !current.terminal },
  };
}
