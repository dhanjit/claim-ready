// The adapter seam. Every system Claim Ready cannot legally or safely touch sits
// behind one of these interfaces with a mock implementation. In a real deployment
// inside the EPFO portal, these are the integration points — that argument is part
// of the submission write-up, so keep the seam honest: nothing outside src/adapters
// may know it is talking to a mock.
import type { Claim, MemberRecord } from "../engine/types";

/** EPFO member database — the records the scan reads. EPFO already holds all of this. */
export interface MemberDirectory {
  getByUan(uan: string): Promise<MemberRecord | null>;
  /** Demo affordance: list available synthetic personas. */
  listPersonas(): Promise<{ uan: string; id: string; label: string; story: string }[]>;
}

/** Aadhaar-OTP authentication (UIDAI in reality). */
export interface OtpService {
  send(uan: string): Promise<{ challengeId: string; delivered: boolean; reason?: string }>;
  verify(challengeId: string, code: string): Promise<{ ok: boolean }>;
}

/** EPFO claim submission + lifecycle. Mock drives the simulated state machine. */
export interface SubmissionService {
  submit(uan: string, claim: Claim): Promise<{ claimId: string }>;
}

/** Time. The demo fast-forwards it; production would not. */
export interface Clock {
  nowIso(): string;
  advanceDays(days: number): void;
}

export interface Adapters {
  directory: MemberDirectory;
  otp: OtpService;
  submission: SubmissionService;
  clock: Clock;
}
