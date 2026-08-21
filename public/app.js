// Claim Ready journey — plain JS, no deps. State lives here; verdicts come only
// from the server's deterministic engine.
const $ = (id) => document.getElementById(id);
const screens = ["pick", "connect", "scan", "file", "track"];

const state = {
  persona: null, // {uan, id, label, story}
  fixed: new Set(), // rule ids marked fixed (simulated)
  scan: null, // last /api/scan payload
  claimId: null, // self-contained claim token — the claim IS the id
  dayOffset: 0, // simulated days since filing, held here not on the server
};

function show(name) {
  for (const s of screens) $(`screen-${s}`).hidden = s !== name;
  window.scrollTo({ top: 0 });
}

async function api(path, body) {
  const res = await fetch(path, body ? { method: "POST", body: JSON.stringify(body) } : undefined);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/* ---------- pick ---------- */
async function renderPersonas() {
  const { personas } = await api("/api/personas");
  $("persona-list").innerHTML = personas
    .map(
      (p) => `<button class="card persona-card" data-uan="${p.uan}">
        <span class="label">${esc(p.label)}</span> <span class="chip mock">synthetic</span>
        <span class="story">${esc(p.story)}</span>
      </button>`,
    )
    .join("");
  for (const el of document.querySelectorAll(".persona-card")) {
    el.addEventListener("click", () => {
      state.persona = personas.find((p) => p.uan === el.dataset.uan);
      state.fixed = new Set();
      state.claimId = null;
      renderConnect();
      show("connect");
    });
  }
}

/* ---------- connect ---------- */
function renderConnect() {
  const p = state.persona;
  $("connect-card").innerHTML = `
    <p><strong>${esc(p.label)}</strong></p>
    <p>UAN <code>${p.uan}</code> <span class="chip mock">mock</span></p>
    <p class="hint">We sign you in with an OTP to your Aadhaar-linked mobile — exactly where real filings stumble.</p>`;
  $("otp-block").innerHTML = `<div class="actions"><button id="btn-otp" class="primary">Send OTP</button></div>`;
  $("btn-otp").addEventListener("click", sendOtp);
}

async function sendOtp() {
  const r = await api("/api/otp/send", { uan: state.persona.uan });
  if (!r.delivered) {
    $("otp-block").innerHTML = `
      <p class="otp-note fail"><strong>OTP could not be delivered.</strong> ${esc(r.reason)}</p>
      <p class="hint">In the real journey this is where you would be stuck with no explanation. Run the health scan to see the fix.</p>
      <div class="actions"><button id="btn-skip-otp" class="primary">Continue to health scan</button></div>`;
    $("btn-skip-otp").addEventListener("click", runScan);
    return;
  }
  $("otp-block").innerHTML = `
    <p class="otp-note">OTP sent <span class="chip mock">mock — any 6 digits work</span></p>
    <div class="actions">
      <input type="tel" id="otp-code" inputmode="numeric" maxlength="6" placeholder="••••••" autocomplete="one-time-code">
      <button id="btn-verify" class="primary">Verify</button>
    </div>`;
  $("btn-verify").addEventListener("click", async () => {
    const { ok } = await api("/api/otp/verify", { challengeId: r.challengeId, code: $("otp-code").value });
    if (ok) runScan();
    else $("otp-code").value = "";
  });
}

/* ---------- scan ---------- */
async function runScan() {
  const fixed = [...state.fixed].join(",");
  state.scan = await api(`/api/scan?uan=${state.persona.uan}&fixed=${fixed}`);
  renderScan();
  show("scan");
}

function renderScan() {
  const { result, claim, claimType } = state.scan;
  const verdictText = {
    green: ["Ready to file", "Nothing found that kills claims like yours."],
    amber: ["File with care", "No outright blockers, but real risks below."],
    red: ["Do not file yet", "This claim would be rejected. Fix the blockers first — it is faster than a rejection cycle."],
  }[result.readiness];
  $("scan-summary").innerHTML = `
    <div class="score-wrap">
      <div class="score ${result.readiness}">${result.score}</div>
      <div class="verdict">${verdictText[0]}
        <small>${verdictText[1]}</small>
        <small>${result.findings.length} issue(s) · est. ${result.estDaysToReady} day(s) to fix · ${esc(claimType.form)} · ${esc(claimType.para)}</small>
      </div>
    </div>`;
  $("findings").innerHTML =
    result.findings
      .map(
        (f) => `<div class="card finding ${f.severity}">
        <span class="sev">${f.severity}</span>
        <h3>${esc(f.title)}</h3>
        <p>${esc(f.kills)}</p>
        <p class="fix"><strong>Fix (${esc(f.fix.owner)}, ~${f.fix.est_days} day(s)):</strong> ${f.fix.steps.map(esc).join(" ")}</p>
        <p class="src">Source: ${esc(f.source)}</p>
        <label class="done"><input type="checkbox" data-rule="${f.ruleId}" ${state.fixed.has(f.ruleId) ? "checked" : ""}>
          I've completed this fix <span class="chip mock">simulated</span></label>
      </div>`,
      )
      .join("") || `<div class="card"><p>All checks green for ${/^[aeiou]/i.test(claimType.label) ? "an" : "a"} ${esc(claimType.label.toLowerCase())}${claim.amount_requested ? ` of ₹${claim.amount_requested.toLocaleString("en-IN")}` : ""}.</p></div>`;
  for (const cb of document.querySelectorAll('#findings input[type="checkbox"]')) {
    cb.addEventListener("change", () => {
      cb.checked ? state.fixed.add(cb.dataset.rule) : state.fixed.delete(cb.dataset.rule);
    });
  }
  const red = state.scan.result.readiness === "red";
  const btn = $("btn-to-file");
  btn.textContent = red ? "File anyway (watch it fail)" : "Continue to filing";
  btn.className = red ? "danger-ghost" : "primary";
}

/* ---------- file ---------- */
function renderFile() {
  const { claim, claimType, result } = state.scan;
  $("file-card").innerHTML = `
    <p><strong>${esc(claimType.label)}</strong> — ${esc(claimType.form)} <span class="chip">${esc(claimType.para)}</span></p>
    <p>Purpose: ${esc(claim.purpose)}</p>
    ${claim.amount_requested ? `<p>Amount: ₹${claim.amount_requested.toLocaleString("en-IN")}</p>` : ""}
    <p class="hint">Documents this claim type needs:</p>
    <ul>${claimType.docs.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>
    ${
      result.readiness === "red"
        ? `<p class="otp-note fail"><strong>You are filing against a red scan.</strong> This is the old-world arc: it will be rejected around day 12.</p>`
        : `<p class="otp-note">Scan is ${result.readiness} — this should settle within the 20-day service norm.</p>`
    }
    <div class="intent">
      <p class="hint">Not sure this is the right claim type? Say what you need, in your words:</p>
      <div class="actions">
        <input type="text" id="intent-text" style="width:100%;letter-spacing:normal;text-align:left" value="${esc(claim.purpose)}">
        <button id="btn-intent" class="secondary">Check</button>
      </div>
      <div id="intent-out"></div>
    </div>`;
  $("btn-intent").addEventListener("click", checkIntent);
}

async function checkIntent() {
  const out = $("intent-out");
  out.innerHTML = `<p class="hint">Thinking…</p>`;
  try {
    const r = await api("/api/intent", { text: $("intent-text").value });
    if (r.source !== "llm" || !r.claimType) {
      out.innerHTML =
        r.source === "llm" && r.reason_en
          ? `<p class="otp-note">${esc(r.reason_en)} <span class="chip">AI suggestion</span><br>The pre-selected claim type below stands.</p>`
          : `<p class="hint">Could not map that to a claim type — the pre-selected one stands.</p>`;
      return;
    }
    const same = r.claim_type === state.scan.claim.type;
    out.innerHTML = `<p class="otp-note ${same ? "" : "fail"}">
      Sounds like: <strong>${esc(r.claimType.label)}</strong> (${esc(r.claimType.form)} · ${esc(r.claimType.para)})
      <span class="chip">AI suggestion</span><br>${esc(r.reason_en)}
      ${same ? " — matches what's prepared below." : " — different from the prepared claim; in the full product this would switch the form."}</p>`;
  } catch {
    out.innerHTML = `<p class="hint">Suggestion service unavailable.</p>`;
  }
}

async function fileClaim() {
  const { claimId } = await api("/api/claims", {
    uan: state.persona.uan,
    fixedRules: [...state.fixed],
    scanSkipped: state.scan.result.readiness === "red",
  });
  state.claimId = claimId;
  state.dayOffset = 0;
  await renderTrack();
  show("track");
}

/* ---------- track ---------- */
async function renderTrack() {
  const data = await api(`/api/claims/${state.claimId}?day=${state.dayOffset}`);
  const { status } = data;
  const doneIds = status.history.map((h) => h.id);
  const rows = status.history
    .map(
      (h, i) => `<li class="${i === status.history.length - 1 ? "now" : "done"}">
      <span class="dot"></span>
      <div><span class="state">${esc(h.label)}</span> <span class="meta">day ${h.dayOffset}</span>
        <div class="meta">Holder: ${esc(h.holder)}</div>
        <div>${esc(h.plainEn)}</div>
      </div></li>`,
    )
    .join("");
  const predicted = status.predicted
    ? `<li class="predicted"><span class="dot"></span>
        <div><span class="state">${esc(status.predicted.state.label)}</span>
        <span class="meta">expected in ~${status.predicted.inDays} day(s)</span></div></li>`
    : "";
  const pct = Math.min(100, Math.round((status.sla.daysElapsed / status.sla.totalDays) * 100));
  $("track-card").innerHTML = `
    <p>Claim <code>${esc(data.submissionRef)}</code> · filed ${data.filedAtIso.slice(0, 10)} <span class="chip mock">simulated</span></p>
    <div class="sla ${status.sla.breached ? "late" : ""}">
      <div class="bar"><div style="width:${pct}%"></div></div>
      <p>Day ${status.sla.daysElapsed} of the ${status.sla.totalDays}-day service norm${status.sla.breached ? " — norm breached" : ""}</p>
    </div>
    <ul class="timeline">${rows}${predicted}</ul>
    ${
      status.remark
        ? `<div class="remark"><p>Official rejection remark:</p><code>${esc(status.remark)}</code>
           <p class="hint">This is the jargon a real member gets. The scan on this same member showed the fix before filing — go back and run the new-world arc.</p>
           <div class="actions"><button id="btn-decode" class="primary">What does this actually mean?</button></div>
           <div id="decode-out"></div></div>`
        : ""
    }
    ${doneIds.includes("settled") ? `<p class="otp-note"><strong>Settled inside the norm.</strong> Same member, same records — the only difference was catching the defects before filing.</p>` : ""}`;
  const decodeBtn = $("btn-decode");
  if (decodeBtn) decodeBtn.addEventListener("click", () => decodeRemark(data));
}

async function decodeRemark(data) {
  const out = $("decode-out");
  out.innerHTML = `<p class="hint">Decoding…</p>`;
  try {
    const ex = await api("/api/explain", { ruleId: data.firstBlockerRuleId, remark: data.status.remark });
    const langs = [
      ["en", "English"],
      ...(ex.source === "llm" ? [["hi", "हिंदी"], ["as", "অসমীয়া"]] : []),
    ];
    const render = (lang) => {
      out.querySelector(".decode-body").innerHTML = `
        <p><strong>What happened:</strong> ${esc(ex[`meaning_${lang}`])}</p>
        <p><strong>What to do:</strong> ${esc(ex[`action_${lang}`])}</p>`;
      for (const b of out.querySelectorAll(".lang-pill")) b.classList.toggle("primary", b.dataset.lang === lang);
    };
    out.innerHTML = `
      <div class="actions">${langs.map(([l, label]) => `<button class="lang-pill" data-lang="${l}">${label}</button>`).join("")}
        <span class="chip">${ex.source === "llm" ? "AI-explained, rule-grounded" : "engine text"}</span></div>
      <div class="decode-body"></div>`;
    for (const b of out.querySelectorAll(".lang-pill")) b.addEventListener("click", () => render(b.dataset.lang));
    render("en");
  } catch {
    out.innerHTML = `<p class="hint">Explanation service unavailable — the engine's own text above still stands.</p>`;
  }
}

/* ---------- wiring ---------- */
$("btn-rescan").addEventListener("click", runScan);
$("btn-to-file").addEventListener("click", () => {
  renderFile();
  show("file");
});
$("btn-back-scan").addEventListener("click", () => show("scan"));
$("btn-file").addEventListener("click", fileClaim);
$("btn-ff1").addEventListener("click", () => {
  state.dayOffset += 1;
  renderTrack();
});
$("btn-ff5").addEventListener("click", () => {
  state.dayOffset += 5;
  renderTrack();
});
$("btn-restart").addEventListener("click", () => {
  state.persona = null;
  state.fixed = new Set();
  state.scan = null;
  state.claimId = null;
  state.dayOffset = 0;
  show("pick");
});

renderPersonas();
show("pick");
