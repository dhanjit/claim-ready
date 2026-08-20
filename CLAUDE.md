# Claim Ready — Claude Code Notes

EPFO claim-readiness prototype for the Build What Moves India hackathon. Deadline: **Aug 27, 2026**. Parent tracker: dhanjit/brain#12.

## Architecture

```
UI (mobile-first) → Worker API → rules engine (deterministic) → verdict
                              → LLM layer (explains only)      → prose EN/HI/AS
                              → adapter seam (mock EPFO/Aadhaar/PAN/bank)
```

- **Rules decide, model explains.** The LLM never produces an eligibility or readiness verdict. All verdicts come from `rules.yaml` via the deterministic engine. The LLM only translates: remark decoding, intent→claim-type, fix instructions.
- **Adapter seam.** Every external system (EPFO submission, Aadhaar/PAN/bank verification, OTP) sits behind one adapter interface with a mock implementation. The seam is the integration point argument for the write-up.
- **State machine.** Claim lifecycle is an explicit state machine with plain-language meaning, holder, SLA clock, and predicted next state per state.
- Mock personas: defect-seeded records (one per rule family) + 1 clean, in fixtures — never generated at runtime.

## Hard rules (hackathon terms — non-negotiable)

- **No real data, ever** — no real Aadhaar, PAN, UAN, OTP, bank, or payment data, including in tests, fixtures, screenshots, and commit history. Synthetic only, visibly fake formats where possible.
- **No live government systems** — no calls to, scraping of, or reverse-engineering of EPFO/UIDAI/NSDL or any govt endpoint.
- **No official-looking branding** — label everything as an independent prototype; no EPFO/GoI logos or lookalike trade dress.
- **Codex is the mandatory build tool.** Meaningful use must be documented — append to `CODEX_LOG.md` as you work, not retroactively. Other tools (including Claude Code) are allowed but must be disclosed there too.

## Stack

- TypeScript on Cloudflare Workers, static assets on the same Worker. Deploy target: `claimready.dhanjit.me` (manual `npx wrangler deploy`).
- **Deliberate exception to the OpenRouter default:** in-product LLM calls use the OpenAI SDK directly (hackathon is OpenAI-run). Model id still env-configured (`EXPLAIN_MODEL`), never hard-coded.
- No heavyweight frameworks. Keep the dep tree minimal (supply-chain discipline applies).

## Commands

Populate as the scaffold lands. Target set:

```bash
npm run dev      # wrangler dev
npm test         # rules engine tests — one test per rule in rules.yaml
npm run deploy   # wrangler deploy
```

## Code style

- Rules live in `rules.yaml`; each rule ships with exactly one test (id, defect persona, expected finding). Engine stays pure/deterministic — no I/O inside rule evaluation.
- LLM calls: validated I/O, timeouts, bounded retries; a failed LLM call degrades to the rule's canned English text, never blocks the verdict.
- Mobile-first, slow-connection budget: judge criteria include usability on cheap phones. No heavy client JS.

## Testing

`npm test` must pass before any deploy. The rules engine is the correctness core — a rule change without a matching test change is a review flag.

## Docs conventions

- `DEVLOG.md` — append-only decision log; never edit old entries.
- `CODEX_LOG.md` — Codex usage log, append-only, scored submission artifact. Every working session adds an entry.

## Release

Push to `master` → GitHub Actions creates a date-tagged release with generated notes (`.github/workflows/release.yml`). Master is protected; work lands via PR.
