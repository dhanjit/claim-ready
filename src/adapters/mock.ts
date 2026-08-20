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

export function createMockAdapters(epochIso: string): Adapters {
  return {
    directory: new MockDirectory(),
    otp: new MockOtp(),
    submission: new MockSubmission(),
    clock: new FastForwardClock(epochIso),
  };
}
