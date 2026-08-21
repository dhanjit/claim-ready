// Claim Ready Worker — API over the engine + mock adapters. UI assets mount in D4.
import rulesJson from "./generated/rules.json";
import { scan } from "./engine";
import type { Claim, Rule } from "./engine";
import { claimStatusAt } from "./engine/lifecycle";
import { CLAIM_TYPES } from "./engine/claimTypes";
import { applyFixes, createMockAdapters, getPersona } from "./adapters/mock";
import { decodeClaimToken, encodeClaimToken } from "./claimToken";
import { explainRemark, mapIntent } from "./llm/explain";

export interface Env {
  OPENAI_BASE_URL?: string;
  OPENAI_API_KEY?: string;
  EXPLAIN_MODEL?: string;
}

const rules = (rulesJson as { rules: Rule[] }).rules;
const ruleIds = new Set(rules.map((r) => r.id));
// Demo epoch: the simulated "today". A CONSTANT, never advanced — see #26.
// Fast-forward is a client-supplied `day` offset, so every isolate answers
// identically and a reload reproduces the same state.
const DEMO_EPOCH = "2026-08-20T00:00:00.000Z";
const adapters = createMockAdapters(DEMO_EPOCH);

const MAX_DEMO_DAYS = 365;

/** Blockers as Findings, rebuilt from their rule ids — the lifecycle needs the
 *  count and the first rule id, both carried in the claim token. */
const blockersFromIds = (ids: string[]) =>
  ids
    .map((id) => rules.find((r) => r.id === id))
    .filter((r): r is Rule => Boolean(r))
    .map((r) => ({
      ruleId: r.id,
      title: r.title,
      category: r.category,
      severity: r.severity,
      kills: r.kills,
      fix: r.fix,
      source: r.source,
      details: {},
    }));

const json = (data: unknown, status = 400): Response =>
  new Response(JSON.stringify(data, null, 2), { status, headers: { "content-type": "application/json" } });
const ok = (data: unknown): Response => json(data, 200);
const notFound = (what: string): Response => json({ error: `${what} not found` }, 404);

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    if (pathname === "/api/health") return ok({ ok: true, mock: true, now: DEMO_EPOCH });

    if (pathname === "/api/personas" && method === "GET") {
      return ok({ personas: await adapters.directory.listPersonas() });
    }

    if (pathname === "/api/otp/send" && method === "POST") {
      const body = await readBody(request);
      const uan = String(body?.uan ?? "");
      if (!getPersona(uan)) return notFound("UAN");
      return ok(await adapters.otp.send(uan));
    }

    if (pathname === "/api/otp/verify" && method === "POST") {
      const body = await readBody(request);
      return ok(await adapters.otp.verify(String(body?.challengeId ?? ""), String(body?.code ?? "")));
    }

    if (pathname === "/api/scan" && method === "GET") {
      const uan = url.searchParams.get("uan") ?? "";
      const persona = getPersona(uan);
      if (!persona) return notFound("UAN");
      const fixedRules = (url.searchParams.get("fixed") ?? "").split(",").filter(Boolean);
      const { record, claim } = applyFixes(persona.record, persona.claim, fixedRules);
      const result = scan(record, claim, rules, DEMO_EPOCH);
      return ok({ personaId: persona.id, claim, claimType: CLAIM_TYPES[claim.type], fixedRules, result });
    }

    if (pathname === "/api/claims" && method === "POST") {
      const body = await readBody(request);
      const uan = String(body?.uan ?? "");
      const persona = getPersona(uan);
      if (!persona) return notFound("UAN");
      const scanSkipped = body?.scanSkipped === true;
      const fixedRules = Array.isArray(body?.fixedRules) ? (body.fixedRules as string[]) : [];
      const baseClaim: Claim = { ...persona.claim, ...(typeof body?.amount_requested === "number" ? { amount_requested: body.amount_requested } : {}) };
      const { record, claim } = applyFixes(persona.record, baseClaim, fixedRules);
      const result = scan(record, claim, rules, DEMO_EPOCH);
      // Still goes through the submission seam — that adapter is the integration
      // point a real EPFO deployment would implement.
      const { claimId: submissionRef } = await adapters.submission.submit(uan, claim);
      // The claim id IS the claim — no server-side store to fall out of sync.
      const claimId = encodeClaimToken({
        uan,
        personaId: persona.id,
        claim,
        filedAtIso: DEMO_EPOCH,
        blockerRuleIds: result.findings.filter((f) => f.severity === "blocker").map((f) => f.ruleId),
        scanSkipped,
        submissionRef,
      });
      return ok({ claimId, submissionRef });
    }

    const claimMatch = pathname.match(/^\/api\/claims\/([\w-]+)$/);
    if (claimMatch && method === "GET") {
      const filed = decodeClaimToken(claimMatch[1], {
        isKnownUan: (u) => getPersona(u) !== null,
        isKnownRuleId: (id) => ruleIds.has(id),
      });
      if (!filed) return notFound("claim");
      // Fast-forward is the caller's, not the server's: no shared clock to race on.
      const dayParam = Number(url.searchParams.get("day") ?? "0");
      if (!Number.isFinite(dayParam) || dayParam < 0 || dayParam > MAX_DEMO_DAYS) return json({ error: `day must be 0–${MAX_DEMO_DAYS}` }, 400);
      const daysElapsed = Math.floor(dayParam);
      const blockers = blockersFromIds(filed.blockerRuleIds);
      return ok({
        claimId: claimMatch[1],
        submissionRef: filed.submissionRef,
        personaId: filed.personaId,
        claim: filed.claim,
        filedAtIso: filed.filedAtIso,
        scanSkipped: filed.scanSkipped,
        firstBlockerRuleId: filed.blockerRuleIds[0] ?? null,
        status: claimStatusAt(daysElapsed, blockers),
      });
    }

    if (pathname === "/api/explain" && method === "POST") {
      const body = await readBody(request);
      const rule = rules.find((r) => r.id === String(body?.ruleId ?? ""));
      if (!rule) return notFound("rule");
      return ok(await explainRemark(env, String(body?.remark ?? ""), rule));
    }

    if (pathname === "/api/intent" && method === "POST") {
      const body = await readBody(request);
      const text = String(body?.text ?? "").trim();
      if (!text) return json({ error: "text required" }, 400);
      const intent = await mapIntent(env, text);
      return ok({ ...intent, claimType: intent.claim_type !== "unknown" ? CLAIM_TYPES[intent.claim_type] : null });
    }

    // /api/clock/advance is gone: fast-forward is now a client-held `day` offset
    // passed to /api/claims/:token. A server clock was shared across every user
    // hitting the same isolate, and differed between isolates — see #26.

    return notFound("route");
  },
};
