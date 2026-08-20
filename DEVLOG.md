# DEVLOG

Append-only. Never modify old entries. Entry format: date · decision/action · rationale.

---

## 2026-08-20 · Repo created

- Project: EPFO claim-readiness engine ("Claim Ready", working title) for the Build What Moves India hackathon. Selected as candidate A of six in a scored ideation round — see dhanjit/brain#12 for the full matrix and concept note v1.
- Repo scaffolded public from day 0; MIT license; builder retains full rights per hackathon terms.
- Core architecture locked at concept stage: deterministic rules engine decides, LLM explains; all external systems behind one adapter seam with mock implementations; explicit claim state machine with SLA clock.
- Stack: TypeScript on Cloudflare Workers; OpenAI SDK direct for in-product LLM (deliberate, disclosed exception to the OpenRouter house default — this is an OpenAI hackathon); model id env-configured.
- Tooling disclosure: repo setup done with Claude Code; Codex takes over as primary build tool from the first build commit. Both are logged in CODEX_LOG.md as required by the rules.

## 2026-08-20 · D1 · Rules as data, engine as interpreter; OCP for local LLM

- `rules.yaml` carries declarative check *specs* (`name_match`, `date_gap`, `amount_cap_68j`, …) that the engine interprets — rules stay inspectable/citable (each has a public source), and the one-test-per-rule suite keys off persona `expected_findings`.
- Synthetic-data guard is enforced mechanically: build fails unless UANs match `^9999\d{8}$`, tests also pin TEST-prefixed IFSC and masked Aadhaar refs. "No real data" is a gate, not a promise.
- Local LLM = OCP (Claude Max sub as OpenAI-compatible /v1 on 127.0.0.1:3456): free during the build loop, protocol-identical to the OpenAI endpoint used at submission. Structured output only — OCP never returns tool_calls, and the product doesn't need them. Zero runtime deps: plain fetch client.

## 2026-08-20 · Locally ready

- Build loop (5 PRs, #12–#17) took the prototype from empty repo to locally-ready in one evening: rules engine → adapters/mocks → lifecycle+API → journey UI with simulated fix loop → LLM layer over OCP. 71 tests; all three demo arcs verified in the running browser at mobile viewport.
- Page budget measured: ~7.8 KB compressed total, one origin, no webfonts. The slow-connection criterion is a number, not a vibe.
- Deliberately NOT local: deploy (#9), video (#10), write-up (#11) — submission-day work; Codex passes (#13) still owed to the mandate before submitting.
