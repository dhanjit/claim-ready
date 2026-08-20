# Claim Ready

> Know your PF claim will clear — **before** you file it.

**Independent prototype.** Not affiliated with, endorsed by, or connected to EPFO, the Ministry of Labour & Employment, or the Government of India. All identity, verification, and government-system data in this project is mock/synthetic. Built for the [Build What Moves India](https://buildwhatmovesindia.com/) hackathon (submission Aug 27, 2026).

## The problem

Salaried workers filed ~796 lakh PF claims in FY24-25. Roughly 1 in 4 was rejected — ~1 in 3 for final settlements — and the worker finds out **weeks later**, via a cryptic remark like `3A ABSENT / NAME NOT MATCHED`, with no fix path. Most of those rejections (name mismatch across UAN↔Aadhaar↔bank, DOB gap, unmarked exit date, incomplete KYC) were detectable *before* filing. ~16 lakh EPFiGMS grievances a year are the downstream exhaust.

A cleaner screen over the same broken process is not a fix. The broken part is the process: file blind → wait weeks → rejected → decode jargon → refile. Claim Ready inverts it.

## The journey

1. **Connect UAN** (mock OTP)
2. **Health scan** — ~10 deterministic rules over mock UAN/Aadhaar/PAN/bank records → readiness score + fix-it list: what's wrong, why it kills claims, the exact fix path, estimated days
3. **Fix loop** — complete a fix, re-scan goes green
4. **File** — intent-based: "need ₹80k for mother's surgery" → Form 31, para 68J, docs auto-listed
5. **Track** — transparent claim state machine: plain-language state meaning, current holder, 20-day SLA clock, predicted next state (EN/HI/AS)

## What's real vs what's mocked

Honesty about mocking is a design principle here, not a disclaimer.

| Real | Mocked (declared) |
|---|---|
| Rejection taxonomy from public sources (EPFO circulars, RTI/Factly data) | UAN identity + member records: defect-seeded personas + 1 clean |
| Deterministic rules engine (`rules.yaml`, one test per rule) | Aadhaar/PAN/bank verification, OTP |
| Claim-type logic from EPF scheme paras (68J/68B/68K…) | Employer actions (exit-date marking) |
| SLA/state machine from the published 20-day norm | Time (fast-forward clock for the demo) |
| LLM explanation layer, live | EPFO submission API — behind one clean adapter seam |

**Rules decide, the model explains.** Eligibility and readiness verdicts come only from the deterministic rules engine. The LLM layer translates: rejection-remark decoding, intent→claim-type mapping, fix instructions in EN/HI/AS. It never invents eligibility.

**Why a third party can't ship this:** it can never legally hold this data — EPFO already holds every record the scan checks. Claim Ready is a *reference implementation* of a pre-submission validation layer that belongs inside the portal; the adapter seam marks the integration point.

## Stack

- TypeScript on Cloudflare Workers (static assets + API)
- OpenAI SDK (in-product LLM; model set via env var)
- Built with OpenAI Codex as the primary coding tool — usage documented in [CODEX_LOG.md](CODEX_LOG.md)

## Development

```bash
npm install
npm run dev      # wrangler dev
npm test         # rules engine: one test per rule
npm run deploy   # wrangler deploy
```

(Scaffold pending — commands land with the first build commit.)

## Repo conventions

- [DEVLOG.md](DEVLOG.md) — append-only decision log
- [CODEX_LOG.md](CODEX_LOG.md) — how Codex was used, day by day (a scored submission artifact)
- Issues tracked on GitHub Issues in this repo

## License

MIT — see [LICENSE](LICENSE). Builder retains full rights per hackathon terms.
