// Compile rules.yaml + personas.yaml → src/generated/*.json for the Worker bundle.
// Fails loudly on schema violations — this is the first gate, before any test runs.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import yaml from "js-yaml";

const SEVERITIES = new Set(["blocker", "risk", "warning"]);
const CHECK_TYPES = new Set([
  "name_match", "date_gap", "bank_kyc_ok", "exit_marked_latest",
  "flag_true", "no_service_overlap", "amount_cap_68j", "pan_tds",
]);
const CLAIM_TYPES = new Set(["form31_68J", "form19_final", "form10c_pension", "transfer"]);

const fail = (msg) => { console.error(`build-rules: ${msg}`); process.exit(1); };

const rulesDoc = yaml.load(readFileSync("rules/rules.yaml", "utf8"));
const { rules } = rulesDoc;
if (!Array.isArray(rules) || rules.length === 0) fail("no rules");

const ids = new Set();
for (const r of rules) {
  for (const f of ["id", "title", "category", "severity", "applies_to", "check", "kills", "fix", "source"])
    if (r[f] === undefined) fail(`rule ${r.id ?? "?"} missing field '${f}'`);
  if (ids.has(r.id)) fail(`duplicate rule id ${r.id}`);
  ids.add(r.id);
  if (!SEVERITIES.has(r.severity)) fail(`rule ${r.id}: bad severity '${r.severity}'`);
  if (!CHECK_TYPES.has(r.check.type)) fail(`rule ${r.id}: unknown check type '${r.check.type}'`);
  if (r.applies_to !== "all") {
    if (!Array.isArray(r.applies_to)) fail(`rule ${r.id}: applies_to must be "all" or a list`);
    for (const t of r.applies_to) if (!CLAIM_TYPES.has(t)) fail(`rule ${r.id}: unknown claim type '${t}'`);
  }
  if (!Array.isArray(r.fix.steps) || r.fix.steps.length === 0) fail(`rule ${r.id}: fix.steps empty`);
  if (typeof r.fix.est_days !== "number") fail(`rule ${r.id}: fix.est_days must be a number`);
}

const personasDoc = yaml.load(readFileSync("fixtures/personas.yaml", "utf8"));
const { personas } = personasDoc;
if (!Array.isArray(personas) || personas.length === 0) fail("no personas");

const covered = new Set();
for (const p of personas) {
  for (const f of ["id", "label", "story", "expected_findings", "claim", "record"])
    if (p[f] === undefined) fail(`persona ${p.id ?? "?"} missing field '${f}'`);
  if (!CLAIM_TYPES.has(p.claim.type)) fail(`persona ${p.id}: unknown claim type '${p.claim.type}'`);
  for (const rid of p.expected_findings) {
    if (!ids.has(rid)) fail(`persona ${p.id}: expected finding '${rid}' is not a rule id`);
    covered.add(rid);
  }
  // hard rule: synthetic-only data — UANs must use the visibly-fake 9999 prefix
  if (!/^9999\d{8}$/.test(p.record.uan.number)) fail(`persona ${p.id}: UAN must match ^9999\\d{8}$ (synthetic marker)`);
}
const uncovered = [...ids].filter((id) => !covered.has(id));
if (uncovered.length) fail(`rules with no persona coverage: ${uncovered.join(", ")}`);
if (!personas.some((p) => p.expected_findings.length === 0)) fail("need at least one clean persona");

mkdirSync("src/generated", { recursive: true });
writeFileSync("src/generated/rules.json", JSON.stringify({ schema_version: rulesDoc.schema_version, rules }, null, 2));
writeFileSync("src/generated/personas.json", JSON.stringify({ personas }, null, 2));
console.log(`build-rules: ${rules.length} rules, ${personas.length} personas, all rules covered`);
