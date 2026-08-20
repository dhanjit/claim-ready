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
