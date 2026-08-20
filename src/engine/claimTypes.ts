import type { ClaimType } from "./types";

export interface ClaimTypeInfo {
  id: ClaimType;
  form: string;
  para: string;
  label: string;
  docs: string[];
}

export const CLAIM_TYPES: Record<ClaimType, ClaimTypeInfo> = {
  form31_68J: {
    id: "form31_68J",
    form: "Form 31",
    para: "Para 68-J, EPF Scheme 1952",
    label: "Advance for illness (self/family)",
    docs: ["Doctor's certificate (Form 31 Annexure)", "Aadhaar-seeded UAN", "KYC-verified bank account"],
  },
  form19_final: {
    id: "form19_final",
    form: "Form 19",
    para: "Para 69, EPF Scheme 1952",
    label: "Final PF settlement",
    docs: ["Date of exit marked", "Aadhaar-seeded UAN", "KYC-verified bank account", "PAN (to avoid punitive TDS)"],
  },
  form10c_pension: {
    id: "form10c_pension",
    form: "Form 10C",
    para: "EPS 1995",
    label: "Pension withdrawal benefit",
    docs: ["Date of exit marked", "Aadhaar-seeded UAN", "Service history ≥ 6 months"],
  },
  transfer: {
    id: "transfer",
    form: "Form 13",
    para: "Para 57, EPF Scheme 1952",
    label: "Transfer PF to new employer",
    docs: ["Both member IDs under one UAN", "Date of exit at previous employer"],
  },
};
