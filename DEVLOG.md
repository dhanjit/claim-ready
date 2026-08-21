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

## 2026-08-21 · D7 · Engine correctness pass — measure in calendar months, fail honestly

- An adversarial Codex review of the rules engine found 6 defects, all of the same species: the engine answering *confidently* where it should have answered *honestly*. Fixed with a test per defect (`test/engine-correctness.test.ts`), each watched failing first.
- **Calendar months, not days/30.44.** The old approximation made R10's five-year TDS boundary depend on where leap days fell — an identical span read 59.99 months with one leap day and 60.02 with two. Service is now measured in whole calendar months, and overlapping employment is merged before counting, so two overlapping rows can no longer sum a member past five years they never served.
- **Strict ISO dates.** `Date.parse` normalises impossible calendar dates, so `1990-02-31` compared clean against a real 1990-03-03 Aadhaar record. `parseIsoDate` round-trips the parse and rejects any date that moved. Unreadable dates now fail the check with `unreadable: true` in details instead of resolving to a confident wrong answer.
- **Preconditions that are two facts get a `all_true` check.** R06's text always said "linked/verified" while the check read one boolean. Rather than special-case it, the engine gained an `all_true` spec type and R06 declares both paths. Rule policy is unchanged — the rule now simply does what it always claimed.
- **`scan()` has an error boundary.** A partial record used to throw straight past it, so the user saw a crash instead of the defects already found. An unevaluable check now reports as unmet, never as passed. Failing open would have been the one unacceptable choice here.
- Deliberately left alone: R10 ignores `uan.panLinked` and keys only off `kyc.pan.present`. Seeding PAN against the UAN is arguably the real precondition, but changing that is a rule-policy decision needing a public source, not an engine correctness fix. Logged rather than silently widened.
- Suite 71 → 82 green. All four demo arcs re-verified against a running dev server; per-persona findings unchanged, so the demo is intact.

## 2026-08-21 · D7 · The claim id IS the claim — killing per-isolate state

- Pre-submission verification against the *deployed* demo caught what local testing structurally could not: filing a claim and reading it straight back **404'd**, and twelve parallel `/api/health` calls returned **three different values for "today"**.
- Root cause: `store.ts` held claims in a module-scope `Map` and `worker.ts` held a mutable clock in a module-scope const. On Cloudflare that is one copy **per isolate**, not per user. `wrangler dev` runs a single isolate, so every local test passed. The store's own comment ("one isolate's memory, which is exactly right for a local demo") was true when written and quietly stopped being true at deploy.
- Fix: **encode the filed claim into its own id** (`src/claimToken.ts`) and make fast-forward a client-supplied `day` offset. Server state is now zero. Any isolate can answer, a reload reproduces the same result, and two people using the demo cannot collide. Chosen over a Durable Object because this is mock demo state, and over client-held state because the lifecycle belongs server-side — it is the thing being demonstrated.
- The token is deliberately **unsigned**: every persona is synthetic and public, so a forged token can at most express a different mock claim. It is still untrusted input, so `decodeClaimToken` validates shape, UAN, claim type, amount, date and rule ids rather than trusting the payload — a garbage token 404s instead of crashing.
- The submission adapter is still called on the file path. It would have been easy to drop it once the token replaced its generated id, but that seam **is** the integration argument in the write-up; its acknowledgement now rides in the token so it stays stable across isolates and shows in the UI instead of a long opaque token.
- Lesson worth keeping: "works on `wrangler dev`" and "works deployed" differ precisely where module scope is involved. The demo arcs had been verified in a browser on D6 and still shipped this bug — it took hitting production concurrently to surface it.
- 95 tests green (12 new for the token). Full 53-check verification pass against the deployed site.
