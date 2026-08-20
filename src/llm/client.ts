// OpenAI-compatible chat client, plain fetch, structured output only.
// Locally this points at OCP (Claude Max sub); at submission, api.openai.com.
// Every caller must survive a null return — the LLM explains, it never decides.

export interface LlmEnv {
  OPENAI_BASE_URL?: string;
  OPENAI_API_KEY?: string;
  EXPLAIN_MODEL?: string;
}

export interface ChatJsonRequest {
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>; // JSON Schema for the response object
  maxTokens?: number;
}

const TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;

export function llmConfigured(env: LlmEnv): boolean {
  return Boolean(env.OPENAI_BASE_URL && env.EXPLAIN_MODEL);
}

export async function chatJson<T>(env: LlmEnv, req: ChatJsonRequest): Promise<T | null> {
  if (!llmConfigured(env)) return null;

  const body = JSON.stringify({
    model: env.EXPLAIN_MODEL,
    max_tokens: req.maxTokens ?? 900,
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: req.schemaName, strict: true, schema: req.schema },
    },
  });

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${env.OPENAI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${env.OPENAI_API_KEY || "unused"}`,
        },
        body,
        signal: controller.signal,
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt === MAX_ATTEMPTS) return null;
        const retryAfter = Number(res.headers.get("retry-after"));
        await new Promise((r) => setTimeout(r, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : attempt * 1000));
        continue;
      }
      if (!res.ok) return null;
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content;
      if (!content) return null;
      return JSON.parse(content) as T;
    } catch {
      if (attempt === MAX_ATTEMPTS) return null;
      await new Promise((r) => setTimeout(r, attempt * 1000));
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
