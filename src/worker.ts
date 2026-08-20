// Claim Ready Worker — API over the engine + mock adapters. UI assets mount in D4.
import rulesJson from "./generated/rules.json";
import { scan } from "./engine";
import type { Claim, Rule } from "./engine";
import { claimStatusAt } from "./engine/lifecycle";
import { CLAIM_TYPES } from "./engine/claimTypes";
import { applyFixes, createMockAdapters, getPersona } from "./adapters/mock";
import { getClaim, putClaim } from "./store";
import { explainRemark, mapIntent } from "./llm/explain";

export interface Env {
  OPENAI_BASE_URL?: string;
  OPENAI_API_KEY?: string;
  EXPLAIN_MODEL?: string;
}

const rules = (rulesJson as { rules: Rule[] }).rules;
// Demo epoch: the simulated "today". One adapter set per isolate, like the store.
const adapters = createMockAdapters("2026-08-20T00:00:00Z");

const DAY_MS = 86_400_000;

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

    if (pathname === "/api/health") return ok({ ok: true, mock: true, now: adapters.clock.nowIso() });

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
      const result = scan(record, claim, rules, adapters.clock.nowIso());
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
      const result = scan(record, claim, rules, adapters.clock.nowIso());
      const { claimId } = await adapters.submission.submit(uan, claim);
      putClaim({
        claimId,
        uan,
        personaId: persona.id,
        claim,
        filedAtIso: adapters.clock.nowIso(),
        blockersAtFiling: result.findings.filter((f) => f.severity === "blocker"),
        scanSkipped,
      });
      return ok({ claimId });
    }

    const claimMatch = pathname.match(/^\/api\/claims\/([\w-]+)$/);
    if (claimMatch && method === "GET") {
      const stored = getClaim(claimMatch[1]);
      if (!stored) return notFound("claim");
      const daysElapsed = Math.floor((Date.parse(adapters.clock.nowIso()) - Date.parse(stored.filedAtIso)) / DAY_MS);
      return ok({
        claimId: stored.claimId,
        personaId: stored.personaId,
        claim: stored.claim,
        filedAtIso: stored.filedAtIso,
        scanSkipped: stored.scanSkipped,
        firstBlockerRuleId: stored.blockersAtFiling[0]?.ruleId ?? null,
        status: claimStatusAt(daysElapsed, stored.blockersAtFiling),
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

    if (pathname === "/api/clock/advance" && method === "POST") {
      const body = await readBody(request);
      const days = Number(body?.days);
      if (!Number.isFinite(days) || days <= 0 || days > 365) return json({ error: "days must be 1–365" }, 400);
      adapters.clock.advanceDays(days);
      return ok({ now: adapters.clock.nowIso() });
    }

    return notFound("route");
  },
};
