# Codex build log

Hackathon rule: Codex must be meaningfully used in the build, and its contribution is a scored part of the write-up. This log is the evidence — **append-only, written as the work happens**, not reconstructed later.

Entry format: date · task · tool · how it was used (prompts/approach) · what it produced · what was kept/changed by hand.

Full-disclosure policy: every AI tool touching this repo gets logged here, not just Codex.

---

## 2026-08-20 · Repo scaffold · Claude Code (disclosed non-Codex tool)

- Repository created and scaffolded (README, CLAUDE.md, DEVLOG, this log, CI release workflow, license, gitignore) with Claude Code, resuming the concept note from dhanjit/brain#12.
- No product code yet. Codex becomes the primary coding tool from the first build task; entries from there on record concrete Codex usage per task.

## 2026-08-20 · D1: rules.yaml v1 + personas + scaffold · Claude Code (disclosed non-Codex tool)

- Rejection taxonomy distilled into `rules/rules.yaml` (10 declarative rules with severity, fix path, public source) and `fixtures/personas.yaml` (8 synthetic personas, every rule covered, clean persona included). Build gate `scripts/build-rules.mjs` + 20 vitest schema tests, all green.
- Codex CLI is not installed on this machine yet — Codex passes over the codebase are tracked as a repo issue so the mandate is met before submission.

## 2026-08-20 · D2: engine + adapter seam · Claude Code (disclosed non-Codex tool)

- Deterministic engine (`src/engine`): check interpreter for all 8 spec types, pure `scan()` with score/readiness/est-days roll-up. Adapter seam (`src/adapters`): MemberDirectory/OtpService/SubmissionService/Clock interfaces + mocks over persona fixtures; OTP mock honestly mirrors R09 (unlinked mobile → no delivery). 46 tests green (one-per-rule + exact-set per persona + edges).

## 2026-08-20 · D3: lifecycle + Worker API · Claude Code (disclosed non-Codex tool)

- Deterministic claim state machine (`src/engine/lifecycle.ts`): 5 states with plain-EN meaning + holder, happy/rejection paths, authentic rejection remarks per rule, 20-day SLA clock with prediction. Worker API (`src/worker.ts`) over mock adapters: personas/otp/scan/claims/clock endpoints. 52 tests green; both demo arcs smoke-tested live on wrangler dev.

## 2026-08-20 · D4: journey UI + fix loop · Claude Code (disclosed non-Codex tool)

- Mobile-first journey (plain HTML/CSS/JS, zero deps, no webfonts): persona picker → UAN connect with mock OTP (delivery honestly fails for the unlinked-mobile persona) → health scan with fix-it cards → simulated fix loop (per-rule record overlays, re-scan goes green) → intent-prefilled filing with doc list → track view (timeline, holder, plain meaning, SLA bar, prediction, rejection-remark decode hook). Worker serves it as static assets.
- 63 tests green. Both demo arcs + the OTP-failure arc verified in the running browser UI on a 375px viewport.

## 2026-08-20 · D5: LLM explanation layer · Claude Code (disclosed non-Codex tool)

- Plain-fetch OpenAI-compatible client (`src/llm/client.ts`): strict json_schema output, 30s timeout, bounded retries honoring Retry-After, null on any failure. Two grounded jobs (`src/llm/explain.ts`): rejection-remark decoder (EN/HI/AS, rephrases engine text only) and intent→claim-type mapper (enum-constrained). Worker routes /api/explain + /api/intent; UI decode pills + intent check. Degradation to engine canned text tested.
- Verified live in the browser over OCP (claude-sonnet-5 on the Max sub): three-language decode of "NAME NOT MATCHED WITH AADHAAR", and "quit my job, withdraw everything" → Form 19 with mismatch warning. 71 tests green.

## 2026-08-20 · D6 pre-deploy: full E2E pass + UI fixes · Claude Code (disclosed non-Codex tool)

- Complete-journey browser pass on wrangler dev: green arc (Rahul, both fixes → filed → settled day 10 inside norm), red arc (file-anyway → rejected day 12 → "NAME NOT MATCHED WITH AADHAAR" decoded in EN/HI/অসমীয়া over OCP), Devraj's R06 door, Hindi intent → Form 19, Assamese out-of-scope intent → honest unknown.
- Three UI fixes found by the pass, all in public/app.js: intent-unknown now surfaces the model's reason_en (was a generic "could not map" that threw the explanation away); a/an article on the green-scan summary ("an advance", not "a advance"); zero-amount claims no longer render "of ₹0". 71 tests green after.

## 2026-08-20 · D6: deployed · Claude Code (disclosed non-Codex tool)

- Live at claimready.dhanjit.me (Worker + custom domain). LLM via OpenRouter (`openai/gpt-5-mini`) — no direct OpenAI key exists in the vault; the OpenRouter key rides the `OPENAI_API_KEY` wrangler secret and the client is provider-agnostic anyway.
- Deployed decode silently degraded to canned EN: reasoning models spend `max_tokens` on hidden reasoning, so 900 truncated the six-field JSON (`finish_reason: length`). Reproduced directly against OpenRouter, sized budgets (explain 3000, intent 1000), redeployed, verified live twice — trilingual decode `source=llm`, Devanagari + Bengali-Assamese scripts populated.

## 2026-08-21 · D7: adversarial review of the rules engine · Codex (review) + Claude Code (implementation)

- **Codex CLI installed** on the Windows build machine: winget `OpenAI.Codex`, which pulls the official `openai/codex` release binary (installer hash verified, Rust, no npm dependency tree). Already ChatGPT-authed. This closes the "Codex CLI not installed on this machine" gap recorded on D1.
- **Two independent Codex passes** over `rules/rules.yaml`, `fixtures/personas.yaml`, `src/engine/*` and `test/*` — model `gpt-5.5`, reasoning effort `xhigh`, prompt scoped strictly to engine correctness (no rule-policy changes, no LLM layer, no UI, no deploy config). The two passes converged on the same defect set, which is the reason it is trusted here.
- **Codex found 6 defects**, every one a case where the engine returned a *confidently wrong verdict* rather than an honest one — the worst failure mode for this product, since a wrong "green" sends a claim to exactly the three-week death the scan exists to prevent:
  - R06 read only `uan.aadhaarLinked`, so an Aadhaar linked but never verified passed.
  - R05 ignored `current: true` rows and accepted `exitMarked: true` with a null exit date.
  - R07 only tested overlap when the earlier row had an exit date, so two still-running jobs read as clean.
  - R10 summed 30.44-day months, making the five-year TDS boundary depend on leap-day placement, and double-counted overlapping service.
  - `Date.parse` silently normalised impossible dates (`1990-02-31` → `1990-03-03`).
  - `scan()` had no error boundary; one missing nested block threw past it and took down the whole health scan.
- **Codex could not write to the workspace.** `~/.codex/config.toml` on this machine is the macOS config synced from the Mac — every `[projects."…"]` trust entry is a `/Users/dhanjit/…` path, and `~/.codex/rules/default.rules` allow-lists Mac-era commands — so the Windows workspace fell back to a read-only sandbox and `npm test` was rejected by policy. Re-running with `--ignore-user-config --ignore-rules -s workspace-write` did not restore writes on the reachable 0.138 binary, and winget's sandbox-capable 0.146.1 is not reachable from this session (MSIX container virtualization).
- **So the split is: Codex located the defects, Claude Code implemented the fixes and the regression tests.** Recorded plainly rather than blurred into "built with Codex" — the honesty ledger in the README is the whole argument of this entry, and it would be worth nothing if this line were fudged.
- Two of Codex's claims were **verified empirically before being acted on** rather than taken on trust: `Date.parse("1990-02-31")` does return 1990-03-03, and a five-calendar-year span computes to 59.99 months with one leap day but 60.02 with two. Both reproduced in node first.
- Result: 11 new regression tests, each watched failing before the fix. Suite 71 → 82, all green.
