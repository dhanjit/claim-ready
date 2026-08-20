// Mock implementations over the synthetic persona fixtures. Everything here is
// declared fake in the UI. See fixtures/personas.yaml for the data rules.
import personasJson from "../generated/personas.json";
import type { Claim, MemberRecord } from "../engine/types";
import type { Adapters, Clock, MemberDirectory, OtpService, SubmissionService } from "./types";

interface PersonaEntry {
  id: string;
  label: string;
  story: string;
  expected_findings: string[];
  claim: Claim;
  record: MemberRecord;
}

const personas = (personasJson as { personas: PersonaEntry[] }).personas;

export function getPersona(idOrUan: string): PersonaEntry | null {
  return personas.find((p) => p.id === idOrUan || p.record.uan.number === idOrUan) ?? null;
}

export class MockDirectory implements MemberDirectory {
  async getByUan(uan: string): Promise<MemberRecord | null> {
    return getPersona(uan)?.record ?? null;
  }
  async listPersonas() {
    return personas.map((p) => ({ uan: p.record.uan.number, id: p.id, label: p.label, story: p.story }));
  }
}

/** OTP delivery honestly mirrors rule R09: no Aadhaar-linked mobile, no OTP. */
export class MockOtp implements OtpService {
  #counter = 0;
  async send(uan: string) {
    const persona = getPersona(uan);
    if (!persona) return { challengeId: "", delivered: false, reason: "unknown UAN" };
    if (!persona.record.kyc.aadhaar.mobileLinked) {
      return { challengeId: "", delivered: false, reason: "Mobile number not linked to Aadhaar — OTP cannot be delivered" };
    }
    return { challengeId: `chal-${++this.#counter}-${uan.slice(-4)}`, delivered: true };
  }
  async verify(challengeId: string, code: string) {
    // Demo rule, stated in the UI: any 6-digit code passes. Nothing real is verified.
    return { ok: challengeId.length > 0 && /^\d{6}$/.test(code) };
  }
}

export class FastForwardClock implements Clock {
  #offsetMs = 0;
  constructor(private readonly epochIso: string) {}
  nowIso(): string {
    return new Date(Date.parse(this.epochIso) + this.#offsetMs).toISOString();
  }
  advanceDays(days: number): void {
    this.#offsetMs += days * 86_400_000;
  }
}

export class MockSubmission implements SubmissionService {
  #counter = 0;
  async submit(uan: string, _claim: Claim) {
    return { claimId: `CR-${uan.slice(-4)}-${String(++this.#counter).padStart(4, "0")}` };
  }
}

/** Fix-loop simulation: what the member's record looks like AFTER completing a
 *  rule's fix path. This models the real-world fix (joint declaration processed,
 *  KYC seeded, exit marked), clearly labelled in the UI as simulated. */
const FIX_PATCHES: Record<string, (record: MemberRecord, claim: Claim) => void> = {
  R01_NAME_UAN_AADHAAR: (r) => {
    r.uan.name = r.kyc.aadhaar.name;
  },
  R02_NAME_UAN_BANK: (r) => {
    r.kyc.bank.accountName = r.uan.name;
  },
  R03_DOB_GAP: (r) => {
    r.uan.dob = r.kyc.aadhaar.dob;
  },
  R04_BANK_KYC: (r) => {
    r.kyc.bank.seeded = true;
    r.kyc.bank.jointAccount = false;
  },
  R05_EXIT_DATE: (r) => {
    for (const e of r.serviceHistory) {
      if (!e.current && !e.exitMarked) {
        e.exitMarked = true;
        e.exitDate = e.exitDate ?? "2026-08-01";
      }
    }
  },
  R06_AADHAAR_LINK: (r) => {
    r.uan.aadhaarLinked = true;
  },
  R07_SERVICE_OVERLAP: (r) => {
    const sorted = [...r.serviceHistory].sort((a, b) => Date.parse(a.joinDate) - Date.parse(b.joinDate));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      if (prev.exitDate && Date.parse(sorted[i].joinDate) <= Date.parse(prev.exitDate)) {
        prev.exitDate = new Date(Date.parse(sorted[i].joinDate) - 86_400_000).toISOString().slice(0, 10);
      }
    }
  },
  R08_68J_CAP: (r, c) => {
    c.amount_requested = Math.min(6 * r.balance.monthlyWage, r.balance.employeeShare);
  },
  R09_MOBILE_AADHAAR: (r) => {
    r.kyc.aadhaar.mobileLinked = true;
  },
  R10_PAN_TDS: (r) => {
    r.kyc.pan.present = true;
    r.kyc.pan.name = r.uan.name;
  },
};

/** Returns a patched deep copy — fixtures are never mutated. Unknown rule ids are ignored. */
export function applyFixes(record: MemberRecord, claim: Claim, fixedRuleIds: string[]): { record: MemberRecord; claim: Claim } {
  const r = structuredClone(record);
  const c = structuredClone(claim);
  for (const id of fixedRuleIds) FIX_PATCHES[id]?.(r, c);
  return { record: r, claim: c };
}

export function createMockAdapters(epochIso: string): Adapters {
  return {
    directory: new MockDirectory(),
    otp: new MockOtp(),
    submission: new MockSubmission(),
    clock: new FastForwardClock(epochIso),
  };
}
