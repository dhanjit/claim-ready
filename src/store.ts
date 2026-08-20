// In-memory claim store — one isolate's memory, which is exactly right for a
// local demo (wrangler dev keeps a single isolate). Declared mock; a real
// deployment would live inside the portal's own systems anyway.
import type { Claim, Finding } from "./engine/types";

export interface StoredClaim {
  claimId: string;
  uan: string;
  personaId: string;
  claim: Claim;
  filedAtIso: string;
  blockersAtFiling: Finding[];
  scanSkipped: boolean; // true = the old-world "file blind" arc
}

const claims = new Map<string, StoredClaim>();

export function putClaim(c: StoredClaim): void {
  claims.set(c.claimId, c);
}

export function getClaim(claimId: string): StoredClaim | null {
  return claims.get(claimId) ?? null;
}

export function listClaims(): StoredClaim[] {
  return [...claims.values()];
}
