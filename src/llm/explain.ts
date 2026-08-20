// The two LLM jobs. Both are grounded in engine output — the model rephrases,
// translates, and maps language; it never produces an eligibility verdict.
import { chatJson } from "./client";
import type { LlmEnv } from "./client";
import type { Rule } from "../engine/types";

export interface RemarkExplanation {
  meaning_en: string;
  action_en: string;
  meaning_hi: string;
  action_hi: string;
  meaning_as: string;
  action_as: string;
  source: "llm" | "canned";
}

const REMARK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["meaning_en", "action_en", "meaning_hi", "action_hi", "meaning_as", "action_as"],
  properties: {
    meaning_en: { type: "string" },
    action_en: { type: "string" },
    meaning_hi: { type: "string" },
    action_hi: { type: "string" },
    meaning_as: { type: "string" },
    action_as: { type: "string" },
  },
};

export async function explainRemark(env: LlmEnv, remark: string, rule: Rule): Promise<RemarkExplanation> {
  const canned: RemarkExplanation = {
    meaning_en: rule.kills.trim(),
    action_en: rule.fix.steps.join(" "),
    meaning_hi: "",
    action_hi: "",
    meaning_as: "",
    action_as: "",
    source: "canned",
  };
  const result = await chatJson<Omit<RemarkExplanation, "source">>(env, {
    system:
      "You translate Indian EPFO rejection jargon into plain, kind, 8th-grade language for a worker who just lost weeks to this rejection. " +
      "You are given the authoritative explanation and fix from a deterministic rules engine. Rephrase and translate ONLY that content — do not add conditions, do not invent eligibility rules, do not speculate. " +
      "meaning_*: what happened, one or two short sentences. action_*: exactly what to do next, imperative, concrete. " +
      "_en = English, _hi = Hindi (Devanagari), _as = Assamese (Bengali-Assamese script). Keep each field under 220 characters.",
    user: JSON.stringify({
      official_remark: remark,
      engine_explanation: rule.kills,
      engine_fix_steps: rule.fix.steps,
      fix_owner: rule.fix.owner,
      estimated_days: rule.fix.est_days,
    }),
    schemaName: "remark_explanation",
    schema: REMARK_SCHEMA,
    // Reasoning models spend max_tokens on hidden reasoning before the JSON;
    // 900 truncates the six-field payload mid-string (finish_reason: length).
    maxTokens: 3000,
  });
  return result ? { ...result, source: "llm" } : canned;
}

export interface IntentResult {
  claim_type: "form31_68J" | "form19_final" | "form10c_pension" | "transfer" | "unknown";
  reason_en: string;
  source: "llm" | "unavailable";
}

const INTENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["claim_type", "reason_en"],
  properties: {
    claim_type: { type: "string", enum: ["form31_68J", "form19_final", "form10c_pension", "transfer", "unknown"] },
    reason_en: { type: "string" },
  },
};

export async function mapIntent(env: LlmEnv, text: string): Promise<IntentResult> {
  const result = await chatJson<Omit<IntentResult, "source">>(env, {
    system:
      "You map a PF member's plain-language need onto exactly one EPFO claim type. " +
      "form31_68J = advance for illness/medical treatment of self or family. " +
      "form19_final = final settlement after leaving employment. " +
      "form10c_pension = pension (EPS) withdrawal benefit. " +
      "transfer = move PF to a new employer. " +
      "Pick unknown when the need does not clearly fit one type. reason_en: one short sentence, plain English, why this type fits. " +
      "The mapping is a suggestion the member confirms; you decide nothing about eligibility.",
    user: text.slice(0, 500),
    schemaName: "intent_mapping",
    schema: INTENT_SCHEMA,
    maxTokens: 1000,
  });
  return result ? { ...result, source: "llm" } : { claim_type: "unknown", reason_en: "", source: "unavailable" };
}
