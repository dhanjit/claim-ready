// A filed claim, encoded into the claim id itself.
//
// This replaces an in-memory Map (see #26). Module-scope state on Cloudflare
// lives per ISOLATE, not per user: a claim filed on one isolate 404s on the
// next, and idle isolates are evicted outright. Carrying the claim in its own
// id removes the server state entirely — any isolate can answer, reloads are
// reproducible, and two people using the demo cannot collide.
//
// The token is NOT a security boundary and deliberately is not signed: every
// persona is synthetic and public, so the worst a forged token can express is a
// different mock claim. It IS untrusted input, so decode validates rather than
// trusting the shape.
import { CLAIM_TYPES } from "./engine/claimTypes";
import type { Claim } from "./engine/types";

export interface FiledClaim {
  uan: string;
  personaId: string;
  claim: Claim;
  filedAtIso: string;
  /** Blockers present at filing — what decides rejection vs settlement. */
  blockerRuleIds: string[];
  /** true = the old-world "file blind" arc. */
  scanSkipped: boolean;
  /** Acknowledgement from the submission adapter — the seam a real EPFO
   *  integration would sit behind. Frozen here so it survives isolate hops. */
  submissionRef: string;
}

export interface DecodeGuards {
  isKnownUan: (uan: string) => boolean;
  isKnownRuleId: (ruleId: string) => boolean;
}

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (token: string): Uint8Array => {
  const padded = token.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (token.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
};

export function encodeClaimToken(filed: FiledClaim): string {
  // Short keys keep the URL short; the shape is internal to this module.
  const payload = {
    u: filed.uan,
    p: filed.personaId,
    t: filed.claim.type,
    a: filed.claim.amount_requested,
    r: filed.claim.purpose,
    f: filed.filedAtIso,
    b: filed.blockerRuleIds,
    s: filed.scanSkipped,
    x: filed.submissionRef,
  };
  return toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

export function decodeClaimToken(token: string, guards: DecodeGuards): FiledClaim | null {
  if (typeof token !== "string" || token.length === 0 || !/^[\w-]+$/.test(token)) return null;

  let payload: Record<string, unknown>;
  try {
    const json = new TextDecoder("utf-8", { fatal: true }).decode(fromBase64Url(token));
    const parsed = JSON.parse(json) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    payload = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  const { u, p, t, a, r, f, b, s, x } = payload;

  if (typeof u !== "string" || !guards.isKnownUan(u)) return null;
  if (typeof p !== "string" || p.length === 0) return null;
  if (typeof t !== "string" || !Object.prototype.hasOwnProperty.call(CLAIM_TYPES, t)) return null;
  if (typeof a !== "number" || !Number.isFinite(a) || a < 0) return null;
  if (typeof r !== "string") return null;
  if (typeof f !== "string" || Number.isNaN(Date.parse(f))) return null;
  if (typeof s !== "boolean") return null;
  if (typeof x !== "string" || x.length === 0) return null;
  if (!Array.isArray(b) || !b.every((id) => typeof id === "string" && guards.isKnownRuleId(id))) return null;

  return {
    uan: u,
    personaId: p,
    claim: { type: t as Claim["type"], amount_requested: a, purpose: r },
    filedAtIso: f,
    blockerRuleIds: b as string[],
    scanSkipped: s,
    submissionRef: x,
  };
}
