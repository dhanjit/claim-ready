# DEVLOG

Append-only. Never modify old entries. Entry format: date · decision/action · rationale.

---

## 2026-08-20 · Repo created

- Project: EPFO claim-readiness engine ("Claim Ready", working title) for the Build What Moves India hackathon. Selected as candidate A of six in a scored ideation round — see dhanjit/brain#12 for the full matrix and concept note v1.
- Repo scaffolded public from day 0; MIT license; builder retains full rights per hackathon terms.
- Core architecture locked at concept stage: deterministic rules engine decides, LLM explains; all external systems behind one adapter seam with mock implementations; explicit claim state machine with SLA clock.
- Stack: TypeScript on Cloudflare Workers; OpenAI SDK direct for in-product LLM (deliberate, disclosed exception to the OpenRouter house default — this is an OpenAI hackathon); model id env-configured.
- Tooling disclosure: repo setup done with Claude Code; Codex takes over as primary build tool from the first build commit. Both are logged in CODEX_LOG.md as required by the rules.
