export type ClaimType = "form31_68J" | "form19_final" | "form10c_pension" | "transfer";
export type Severity = "blocker" | "risk" | "warning";

export interface ServiceEntry {
  establishment: string;
  memberId: string;
  joinDate: string; // ISO date
  exitDate: string | null;
  exitMarked: boolean;
  current: boolean;
}

export interface MemberRecord {
  uan: {
    number: string;
    name: string;
    dob: string;
    mobile: string;
    aadhaarLinked: boolean;
    panLinked: boolean;
  };
  serviceHistory: ServiceEntry[];
  kyc: {
    aadhaar: { name: string; dob: string; maskedRef: string; mobileLinked: boolean; verified: boolean };
    pan: { present: boolean; name: string | null };
    bank: { accountName: string; maskedAccount: string; ifsc: string; seeded: boolean; jointAccount: boolean };
  };
  balance: { employeeShare: number; employerShare: number; pensionShare: number; monthlyWage: number };
}

export interface Claim {
  type: ClaimType;
  amount_requested: number;
  purpose: string;
}

export interface CheckSpec {
  type:
    | "name_match"
    | "date_gap"
    | "bank_kyc_ok"
    | "exit_marked_latest"
    | "flag_true"
    | "no_service_overlap"
    | "amount_cap_68j"
    | "pan_tds";
  left?: string;
  right?: string;
  tolerance?: "fuzzy_minor";
  max_days?: number;
  path?: string;
}

export interface Rule {
  id: string;
  title: string;
  category: string;
  severity: Severity;
  applies_to: "all" | ClaimType[];
  check: CheckSpec;
  kills: string;
  fix: { owner: "member" | "employer" | "bank"; steps: string[]; est_days: number };
  source: string;
}

export interface Finding {
  ruleId: string;
  title: string;
  category: string;
  severity: Severity;
  kills: string;
  fix: Rule["fix"];
  source: string;
  /** Check-specific facts for the UI/LLM layer (compared values, computed caps). */
  details: Record<string, string | number | boolean | null>;
}

export interface ScanResult {
  readiness: "green" | "amber" | "red";
  score: number; // 0–100
  findings: Finding[];
  counts: { blocker: number; risk: number; warning: number };
  /** Longest single fix path among findings — the honest "days until fileable" estimate. */
  estDaysToReady: number;
}
