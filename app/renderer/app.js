'use strict';
// RedCell renderer (v2). Operations-first. No Node here — all privileged calls
// go through window.redcell (preload.js). Pure UI state + rendering.

const rc = window.redcell;

// MITRE ATT&CK tactics used as kill-chain stages.
const TACTICS = [
  ['reconnaissance', 'Reconnaissance', 'TA0043'],
  ['resource-development', 'Resource Dev', 'TA0042'],
  ['initial-access', 'Initial Access', 'TA0001'],
  ['execution', 'Execution', 'TA0002'],
  ['persistence', 'Persistence', 'TA0003'],
  ['privilege-escalation', 'Priv Esc', 'TA0004'],
  ['defense-evasion', 'Defense Evasion', 'TA0005'],
  ['credential-access', 'Cred Access', 'TA0006'],
  ['discovery', 'Discovery', 'TA0007'],
  ['lateral-movement', 'Lateral Movement', 'TA0008'],
  ['collection', 'Collection', 'TA0009'],
  ['command-and-control', 'Command & Control', 'TA0011'],
  ['exfiltration', 'Exfiltration', 'TA0010'],
  ['impact', 'Impact', 'TA0040']
];
const TAC_LABEL = Object.fromEntries(TACTICS.map(t => [t[0], t[1]]));
const TAC_ID = Object.fromEntries(TACTICS.map(t => [t[0], t[2]]));

const state = {
  catalog: { tools: [], categories: [] },
  settings: {},
  store: {},
  view: 'dashboard',
  filter: 'All', search: '',
  favorites: JSON.parse(localStorage.getItem('rc.favs') || '[]'),
  activeChainId: null,
  runner: { runId: null, running: false, onLine: null }
};

const $ = (s, e = document) => e.querySelector(s);
const uid = (p) => p + Math.random().toString(36).slice(2, 9);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const now = () => new Date().toISOString();
const fmt = (iso) => { try { return new Date(iso).toLocaleString(); } catch { return iso; } };

function activeEng() { return state.store.engagements.find(e => e.id === state.store.activeId) || null; }
function scopeList() { const e = activeEng(); return e ? e.scope : []; }
async function persist() { state.store = await rc.store.save(state.store); renderEngPill(); }
function saveFavs() { localStorage.setItem('rc.favs', JSON.stringify(state.favorites)); }

// ---------- boot ----------
async function boot() {
  state.catalog = await rc.catalog.get();
  state.settings = await rc.settings.get();
  state.store = await rc.store.get();
  document.body.className = state.settings.theme === 'light' ? 'theme-light' : 'theme-dark';
  document.querySelectorAll('.nav-item').forEach(b => b.addEventListener('click', () => go(b.dataset.view)));
  $('#themeToggle').addEventListener('click', toggleTheme);
  $('#globalSearch').addEventListener('input', e => { state.search = e.target.value.toLowerCase(); if (state.view !== 'arsenal') go('arsenal'); else renderArsenal(); });
  wireRun();
  renderEngPill();
  render();
}
async function toggleTheme() {
  const next = document.body.classList.contains('theme-dark') ? 'light' : 'dark';
  document.body.className = 'theme-' + next;
  state.settings = await rc.settings.set({ theme: next });
}
function go(view) {
  state.view = view;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  const names = { dashboard: 'Dashboard', chains: 'Attack Chains', c2: 'C2', phishing: 'Phishing', payloads: 'Payloads', engagements: 'Engagements', activity: 'Activity Log', arsenal: 'Arsenal', settings: 'Settings' };
  $('#crumb').textContent = names[view];
  render();
}
function render() {
  ({ dashboard: renderDashboard, chains: renderChains, c2: renderC2, phishing: renderPhishing,
     payloads: renderPayloads, engagements: renderEngagements, activity: renderActivity,
     arsenal: renderArsenal, settings: renderSettings }[state.view])();
}
function renderEngPill() {
  const e = activeEng();
  $('#engPillName').textContent = e ? e.name : 'None';
  $('#engPillScope').textContent = e ? (e.scope.length ? e.scope.length + ' in-scope host(s)' : 'no scope set') : 'no scope set';
}

// ---------- dashboard ----------
function renderDashboard() {
  const s = state.store;
  const funcN = state.catalog.tools.filter(t => t.status === 'tool').length;
  const eng = activeEng();
  const recent = s.activity.slice(0, 6);
  $('#view').innerHTML = `
    <div class="notice"><span>⚠️</span><div><b>Authorised testing only.</b> RedCell drives real operations against
      the scope you define. C2 and phishing modules manage infrastructure and campaigns and integrate your tools;
      live beacon callback and email delivery require your own infrastructure (configured in each module).</div></div>

    <div class="tiles">
      <div class="tile"><div class="t-num t-accent">${s.chains.length}</div><div class="t-lbl">attack chains</div></div>
      <div class="tile"><div class="t-num">${s.c2.listeners.length}</div><div class="t-lbl">C2 listeners</div></div>
      <div class="tile"><div class="t-num">${s.phishing.campaigns.length}</div><div class="t-lbl">phishing campaigns</div></div>
      <div class="tile"><div class="t-num">${state.catalog.tools.length}</div><div class="t-lbl">tools · ${funcN} working</div></div>
    </div>

    <div class="split">
      <div class="panel">
        <div class="head-row"><h2>Active engagement</h2></div>
        ${eng ? `<div class="metric-row">
            <div class="metric"><div class="m-num">${eng.scope.length}</div><div class="m-lbl">scope hosts</div></div>
            <div class="metric"><div class="m-num">${eng.targets.length}</div><div class="m-lbl">targets</div></div>
            <div class="metric"><div class="m-num">${s.chains.filter(c=>c.engagementId===eng.id).length}</div><div class="m-lbl">chains</div></div>
          </div>
          <div class="row mt"><button class="btn small" onclick="app.go('engagements')">manage</button>
            <button class="btn small primary" onclick="app.go('chains')">build a chain</button></div>`
          : `<div class="empty">No active engagement. <a class="link" onclick="app.go('engagements')">Create one</a> to set scope.</div>`}
      </div>
      <div class="panel">
        <div class="head-row"><h2>Recent activity</h2><div class="grow"></div><button class="btn small" onclick="app.go('activity')">all</button></div>
        ${recent.length ? recent.map(a => `<div class="row" style="padding:7px 0;border-bottom:1px solid var(--line)">
            <span class="tag att">${esc(a.attack || a.kind || 'event')}</span>
            <span class="grow" style="font-size:13px">${esc(a.label || '')}</span>
            <span style="font-size:11px;color:var(--ink-3)">${fmt(a.ts).split(',')[1] || ''}</span></div>`).join('')
          : `<div class="empty">No activity yet.</div>`}
      </div>
    </div>`;
}

// ---------- attack chains ----------
function renderChains() {
  const chains = state.store.chains;
  if (!state.activeChainId && chains.length) state.activeChainId = chains[0].id;
  const chain = chains.find(c => c.id === state.activeChainId);
  $('#view').innerHTML = `
    <div class="head-row">
      <h2>Attack Chains</h2><div class="sub">compose a kill-chain, bind tools per stage, run it in order</div>
      <div class="grow"></div>
      <select id="chainSel" class="btn" style="min-width:180px">
        ${chains.map(c => `<option value="${c.id}" ${c.id===state.activeChainId?'selected':''}>${esc(c.name)}</option>`).join('')}
      </select>
      <button class="btn small" onclick="app.newChain()">+ new</button>
    </div>
    ${chain ? chainBoard(chain) : `<div class="empty">No chains yet. <a class="link" onclick="app.newChain()">Create your first chain.</a><br><br>
      A chain is your engagement plan as executable steps: pick a tactic (Recon → Initial Access → C2 → Lateral → Exfil…),
      attach a tool and target, then run the whole sequence with output and ATT&CK logging.</div>`}`;
  if (chain) $('#chainSel').addEventListener('change', e => { state.activeChainId = e.target.value; renderChains(); });
}
function chainBoard(chain) {
  const used = [...new Set(chain.steps.map(s => s.tactic))];
  const order = TACTICS.map(t => t[0]).filter(t => used.includes(t));
  const stages = order.length ? order : ['reconnaissance'];
  return `
    <div class="row" style="margin-bottom:14px">
      <button class="btn primary" onclick="app.runChain('${chain.id}')" id="runChainBtn">▶ Run chain (${chain.steps.length} steps)</button>
      <button class="btn" onclick="app.addStep('${chain.id}')">+ add step</button>
      <button class="btn ghost" onclick="app.exportChain('${chain.id}')">copy as checklist</button>
      <div class="grow"></div>
      <button class="btn ghost small" onclick="app.deleteChain('${chain.id}')">delete chain</button>
    </div>
    <div class="board">
      ${stages.map(tac => `
        <div class="stage">
          <div class="stage-head"><span class="stage-name">${esc(TAC_LABEL[tac]||tac)}</span><span class="stage-tac">${esc(TAC_ID[tac]||'')}</span></div>
          ${chain.steps.filter(s => s.tactic === tac).map(s => stepCard(chain, s)).join('')}
          <button class="step-add" onclick="app.addStep('${chain.id}','${tac}')">+ step</button>
        </div>`).join('')}
      <div class="stage" style="border-style:dashed">
        <div class="stage-head"><span class="stage-name" style="color:var(--ink-3)">+ add stage</span></div>
        <select class="btn" style="width:100%" onchange="if(this.value)app.addStep('${chain.id}',this.value)">
          <option value="">choose tactic…</option>
          ${TACTICS.filter(t=>!used.includes(t[0])).map(t=>`<option value="${t[0]}">${t[1]}</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="chainConsole" class="code-out mt" style="max-height:220px">chain console — run the chain to stream tool output here.</div>`;
}
function stepCard(chain, s) {
  return `<div class="step ${s.status||''}" onclick="app.editStep('${chain.id}','${s.id}')">
    <div class="step-name">${esc(s.name || (s.tool || 'step'))}</div>
    <div class="step-tool">${s.tool ? '⚔ '+esc(s.tool) : '☐ manual'} ${s.target ? '· '+esc(s.target) : ''}</div>
  </div>`;
}

// ---------- C2 ----------
function renderC2() {
  const c2 = state.store.c2;
  $('#view').innerHTML = `
    <div class="head-row"><h2>Command &amp; Control</h2>
      <div class="sub">manage listeners and track sessions · integrates phantom-c2, redirector, dns-beacon</div>
      <div class="grow"></div><button class="btn small primary" onclick="app.newListener()">+ listener</button></div>

    <div class="panel" style="margin-bottom:16px">
      <h2 class="section">Listeners</h2>
      ${c2.listeners.length ? `<table class="data"><thead><tr><th>Name</th><th>Type</th><th>Bind</th><th>Profile</th><th>Status</th><th></th></tr></thead><tbody>
        ${c2.listeners.map(l => `<tr>
          <td><b>${esc(l.name)}</b></td><td><span class="tag">${esc(l.type)}</span></td>
          <td class="mono">${esc(l.host)}:${esc(l.port)}</td><td>${esc(l.profile||'default')}</td>
          <td><span class="status-dot ${l.status==='running'?'s-active':'s-idle'}"></span>${esc(l.status)}</td>
          <td class="row">
            <button class="btn small" onclick="app.toggleListener('${l.id}')">${l.status==='running'?'stop':'start'}</button>
            <button class="btn small ghost" onclick="app.copyListenerCmd('${l.id}')">copy cmd</button>
            <button class="btn small ghost" onclick="app.delListener('${l.id}')">✕</button>
          </td></tr>`).join('')}
      </tbody></table>` : `<div class="empty">No listeners. A listener is a channel a beacon calls back to (HTTP/DNS/SMB).</div>`}
    </div>

    <div class="panel">
      <h2 class="section">Sessions</h2>
      ${c2.implants.length ? `<table class="data"><thead><tr><th>ID</th><th>Host</th><th>User</th><th>Listener</th><th>Last seen</th><th></th></tr></thead><tbody>
        ${c2.implants.map(i => `<tr>
          <td class="mono">${esc(i.id.slice(0,8))}</td><td>${esc(i.host)}</td><td>${esc(i.user)}</td>
          <td>${esc((c2.listeners.find(l=>l.id===i.listenerId)||{}).name || '—')}</td>
          <td style="font-size:12px;color:var(--ink-3)">${fmt(i.lastSeen)}</td>
          <td><button class="btn small ghost" onclick="app.delImplant('${i.id}')">✕</button></td></tr>`).join('')}
      </tbody></table>`
      : `<div class="empty">No live sessions. RedCell tracks sessions here; a real beacon callback requires your own
         implant and the listener running. Use <b>+ session (manual)</b> to log one during an engagement.
         <br><br><button class="btn small" onclick="app.newImplant()">+ session (manual)</button></div>`}
      ${c2.implants.length ? `<div class="mt"><button class="btn small" onclick="app.newImplant()">+ session (manual)</button></div>` : ''}
    </div>`;
}

// ---------- phishing ----------
function renderPhishing() {
  const camps = state.store.phishing.campaigns;
  $('#view').innerHTML = `
    <div class="head-row"><h2>Phishing</h2>
      <div class="sub">plan campaigns and track engagement · integrates phish-planner, macro-gen, hta-builder</div>
      <div class="grow"></div><button class="btn small primary" onclick="app.newCampaign()">+ campaign</button></div>
    ${camps.length ? camps.map(campCard).join('') : `<div class="empty">No campaigns yet.
      A campaign holds your pretext, targets, and tracking (sent / opened / clicked / submitted). Delivery uses your
      own SMTP or an Evilginx/GoPhish-style setup; RedCell manages the campaign and generates the payloads.</div>`}`;
}
function campCard(c) {
  const rate = (n) => c.targets.length ? Math.round(n / c.targets.length * 100) : 0;
  return `<div class="panel" style="margin-bottom:14px">
    <div class="head-row"><h2 style="font-size:16px">${esc(c.name)}</h2>
      <span class="tag">${esc(c.status)}</span><div class="grow"></div>
      <button class="btn small" onclick="app.editCampaign('${c.id}')">edit</button>
      <button class="btn small ghost" onclick="app.delCampaign('${c.id}')">✕</button></div>
    <div style="color:var(--ink-2);font-size:13px;margin-bottom:12px">${esc(c.pretext||'no pretext set')}</div>
    <div class="metric-row">
      <div class="metric"><div class="m-num">${c.targets.length}</div><div class="m-lbl">targets</div></div>
      <div class="metric"><div class="m-num">${c.sent||0}</div><div class="m-lbl">sent</div></div>
      <div class="metric"><div class="m-num">${c.opened||0}</div><div class="m-lbl">opened ${rate(c.opened||0)}%</div></div>
      <div class="metric"><div class="m-num">${c.clicked||0}</div><div class="m-lbl">clicked ${rate(c.clicked||0)}%</div></div>
      <div class="metric"><div class="m-num t-accent">${c.submitted||0}</div><div class="m-lbl">submitted ${rate(c.submitted||0)}%</div></div>
    </div></div>`;
}

// ---------- payloads ----------
const PAYLOAD_RECIPES = [
  { id: 'rev-python', name: 'Reverse shell — Python', tool: 'Rev_Shell', hint: 'menu-driven, 11+ languages' },
  { id: 'macro', name: 'Office macro', tool: 'macro-gen', hint: 'phishing initial access' },
  { id: 'hta', name: 'HTA loader', tool: 'hta-builder', hint: 'mshta initial access' },
  { id: 'lnk', name: 'LNK shortcut', tool: 'lnk-forge', hint: 'delivery' },
  { id: 'shellcode', name: 'Shellcode', tool: 'shellcode-gen', hint: 'raw stage' },
  { id: 'iso', name: 'ISO package', tool: 'iso-pack', hint: 'container delivery / mark-of-web bypass' }
];
function renderPayloads() {
  $('#view').innerHTML = `
    <div class="head-row"><h2>Payloads</h2><div class="sub">generate delivery payloads through the arsenal</div></div>
    <div class="tool-grid">
      ${PAYLOAD_RECIPES.map(r => {
        const t = state.catalog.tools.find(x => x.name === r.tool);
        const st = t ? t.status : 'scaffold';
        return `<div class="tool-card">
          <div class="tc-head"><div class="tc-name">${esc(r.name)}</div>
            <span class="badge ${st}">${st==='tool'?'working':'scaffold'}</span></div>
          <div class="tc-cat">${esc(r.tool)}</div>
          <div class="tc-desc">${esc(r.hint)}</div>
          <div class="tc-actions"><button class="btn primary small" onclick="app.launch('${esc(r.tool)}')">▶ Generate</button></div>
        </div>`; }).join('')}
    </div>`;
}

// ---------- engagements ----------
function renderEngagements() {
  const s = state.store;
  $('#view').innerHTML = `
    <div class="head-row"><h2>Engagements</h2><div class="grow"></div>
      <button class="btn small primary" onclick="app.newEngagement()">+ new</button></div>
    ${s.engagements.length ? `<div class="eng-list">${s.engagements.map(engRow).join('')}</div>`
      : `<div class="empty">No engagements. Create one to define scope, targets, and notes.</div>`}
    <div id="engEditor"></div>`;
}
function engRow(e) {
  const active = e.id === state.store.activeId;
  return `<div class="eng-row ${active?'active':''}" onclick="app.editEngagement('${e.id}')">
    <div><div class="er-name">${esc(e.name)} ${active?'<span class="badge tool">active</span>':''}</div>
      <div class="er-meta">${e.scope.length} scope · ${e.targets.length} targets</div></div>
    <button class="btn small" onclick="event.stopPropagation();app.activate('${e.id}')">${active?'active':'set active'}</button></div>`;
}
function editEngagement(id) {
  const e = state.store.engagements.find(x => x.id === id); if (!e) return;
  $('#engEditor').innerHTML = `<div class="panel mt">
    <h2 class="section">Edit — ${esc(e.name)}</h2>
    <div class="field"><label>Name</label><input id="eName" value="${esc(e.name)}"></div>
    <div class="field"><label>In-scope hosts <span class="hint" style="display:inline">(one per line; *.example.com ok)</span></label>
      <textarea id="eScope" rows="4">${esc(e.scope.join('\n'))}</textarea></div>
    <div class="field"><label>Targets</label><textarea id="eTargets" rows="4">${esc(e.targets.join('\n'))}</textarea></div>
    <div class="field"><label>Notes</label><textarea id="eNotes" rows="5">${esc(e.notes||'')}</textarea></div>
    <div class="row"><button class="btn primary" onclick="app.saveEngagement('${e.id}')">Save</button>
      <button class="btn ghost" onclick="app.activate('${e.id}')">Set active</button>
      <div class="grow"></div><button class="btn ghost" onclick="app.deleteEngagement('${e.id}')">Delete</button></div></div>`;
}

// ---------- activity ----------
function renderActivity() {
  const a = state.store.activity;
  $('#view').innerHTML = `<div class="head-row"><h2>Activity Log</h2><div class="sub">timestamped, ATT&CK-tagged</div>
    <div class="grow"></div><button class="btn small ghost" onclick="app.clearActivity()">clear</button></div>
    ${a.length ? `<table class="data"><thead><tr><th>Time</th><th>Tactic</th><th>Event</th><th>Target</th></tr></thead><tbody>
      ${a.map(x => `<tr><td style="font-size:12px;color:var(--ink-3)">${fmt(x.ts)}</td>
        <td>${x.attack?`<span class="tag att">${esc(x.attack)}</span>`:`<span class="tag">${esc(x.kind||'')}</span>`}</td>
        <td>${esc(x.label||'')}</td><td class="mono" style="font-size:12px">${esc(x.target||'')}</td></tr>`).join('')}
    </tbody></table>` : `<div class="empty">No activity recorded yet.</div>`}`;
}

// ---------- arsenal (secondary) ----------
function renderArsenal() {
  const cats = ['All', '★ Favorites', ...state.catalog.categories];
  const list = state.catalog.tools.filter(t => {
    if (state.filter === '★ Favorites' && !state.favorites.includes(t.name)) return false;
    if (state.filter !== 'All' && state.filter !== '★ Favorites' && t.category !== state.filter) return false;
    if (state.search) { const h = (t.name + t.description + t.category).toLowerCase(); if (!h.includes(state.search)) return false; }
    return true;
  });
  $('#view').innerHTML = `
    <div class="head-row"><h2>Arsenal</h2><div class="sub">100 tools · the building blocks your operations call on</div></div>
    <div class="filters">${cats.map(c => `<button class="chip ${state.filter===c?'active':''}" onclick="app.setFilter('${esc(c)}')">${esc(c)}</button>`).join('')}</div>
    <div class="tool-grid">${list.length ? list.map(toolCard).join('') : `<div class="empty">No tools match.</div>`}</div>`;
}
function toolCard(t) {
  const fav = state.favorites.includes(t.name);
  return `<div class="tool-card"><div class="tc-head"><div class="tc-name">${esc(t.name)}</div>
    <div class="tc-badges"><span class="badge ${t.status}">${t.status==='tool'?'working':'scaffold'}</span>
      <span class="star ${fav?'on':''}" onclick="app.toggleFav('${esc(t.name)}')">${fav?'★':'☆'}</span></div></div>
    <div class="tc-cat">${esc(t.category)}</div><div class="tc-desc">${esc(t.description)}</div>
    <div class="tc-actions"><button class="btn primary small" onclick="app.launch('${esc(t.name)}')">▶ Run</button>
      <button class="btn ghost small" onclick="app.openRepo('${esc(t.repo)}')">repo ↗</button></div></div>`;
}

// ---------- settings ----------
function renderSettings() {
  const s = state.settings;
  $('#view').innerHTML = `<div class="panel" style="max-width:660px">
    <h2 class="section">Settings</h2>
    <div class="field"><label>Operator handle</label><input id="sOp" value="${esc(s.operator||'')}"></div>
    <div class="field"><label>Python interpreter</label><input id="sPy" value="${esc(s.pythonPath||'')}">
      <div class="hint">Used to launch Python tools (e.g. <code>python</code>, <code>py -3</code>, venv path).</div></div>
    <div class="field"><label>Tools directory</label>
      <div class="row"><input id="sDir" class="grow" value="${esc(s.toolsDir||'')}"><button class="btn small" onclick="app.pickDir()">browse…</button></div>
      <div class="hint">Where tool repos are cloned: <code>&lt;dir&gt;/&lt;tool&gt;/</code>. RedCell's own modules work without this.</div></div>
    <div class="field"><label class="row"><input type="checkbox" id="sScope" ${s.confirmOutOfScope?'checked':''} style="width:auto"> &nbsp;Block launches against out-of-scope targets</label></div>
    <button class="btn primary" onclick="app.saveSettings()">Save</button>
    <div class="hint mt">Clone every tool at once (PowerShell):</div>
    <div class="code-out mt">gh repo list amooryx --limit 200 --json name -q '.[].name' | %% { gh repo clone amooryx/$_ "${esc(s.toolsDir||'TOOLS')}/$_" }</div>
  </div>`;
}

// ---------- run plumbing ----------
function wireRun() {
  rc.run.onData(({ runId, stream, chunk }) => {
    if (runId !== state.runner.runId) return;
    if (state.runner.onLine) state.runner.onLine(chunk, stream);
  });
  rc.run.onEnd(({ runId, code }) => {
    if (runId !== state.runner.runId) return;
    if (state.runner.onLine) state.runner.onLine(`\n[finished] exit ${code}\n`, 'sys');
    state.runner.running = false;
    if (state.runner.onEnd) state.runner.onEnd(code);
  });
  rc.onActivity(() => { if (state.view === 'activity') renderActivity(); if (state.view === 'dashboard') renderDashboard(); });
}
async function runTool({ tool, target, extraArgs, label, attack, onLine, onEnd }) {
  const runId = uid('r');
  state.runner = { runId, running: true, onLine, onEnd };
  const res = await rc.run.start({ runId, tool, target, extraArgs, scope: scopeList(), label, attack });
  if (!res.started) { onLine && onLine(`[blocked] ${res.reason}\n`, 'err'); state.runner.running = false; onEnd && onEnd(-1); return false; }
  onLine && onLine(`[exec] ${res.command}\n`, 'sys');
  return true;
}

// ---------- modal ----------
function modal(title, bodyHTML, onOk) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal"><h3>${esc(title)}</h3>${bodyHTML}
    <div class="row-btns"><button class="btn ghost" data-x>Cancel</button><button class="btn primary" data-ok>Save</button></div></div>`;
  document.body.appendChild(back);
  const close = () => back.remove();
  back.querySelector('[data-x]').onclick = close;
  back.addEventListener('click', e => { if (e.target === back) close(); });
  back.querySelector('[data-ok]').onclick = () => { if (onOk(back) !== false) close(); };
  return back;
}

// ---------- public API ----------
window.app = {
  go,
  setFilter(c) { state.filter = c; renderArsenal(); },
  toggleFav(n) { const i = state.favorites.indexOf(n); i>=0?state.favorites.splice(i,1):state.favorites.push(n); saveFavs(); renderArsenal(); },
  openRepo(u) { rc.openExternal(u); },
  openCategory(c) { state.filter = c; go('arsenal'); },

  // launch a tool into a live output modal
  async launch(name) {
    const tool = state.catalog.tools.find(t => t.name === name); if (!tool) return;
    const back = modal(`Run — ${tool.name}`, `
      <div class="field"><label>Target</label><input id="mTarget" placeholder="host, domain, or file"></div>
      <div class="field"><label>Extra args</label><input id="mArgs" placeholder="-o out.txt --verbose"></div>
      ${tool.status==='scaffold'?'<div class="hint" style="color:#ffb300">This tool is a scaffold — it will run but is still under development.</div>':''}
      <div class="code-out mt" id="mOut" style="min-height:120px">ready.</div>`, (b) => {
        const out = b.querySelector('#mOut'); out.textContent = '';
        const line = (t, s) => { const span = document.createElement('span'); if (s==='err') span.style.color='#ff7a7a'; if (s==='sys') span.style.color='var(--ink-3)'; span.textContent = t; out.appendChild(span); out.scrollTop = out.scrollHeight; };
        runTool({ tool, target: b.querySelector('#mTarget').value.trim(), extraArgs: b.querySelector('#mArgs').value.trim(),
          label: tool.name, attack: TAC_ID[tool.tactics?.[0]] || null, onLine: line, onEnd: () => {} });
        b.querySelector('[data-ok]').textContent = 'Run again';
        return false; // keep modal open to watch output
      });
    back.querySelector('[data-ok]').textContent = 'Execute';
  },

  // chains
  async newChain() {
    const eng = activeEng();
    const c = { id: uid('c'), name: 'New chain', engagementId: eng ? eng.id : null, steps: [] };
    state.store.chains.push(c); state.activeChainId = c.id; await persist(); renderChains();
  },
  async deleteChain(id) { state.store.chains = state.store.chains.filter(c => c.id !== id); state.activeChainId = state.store.chains[0]?.id || null; await persist(); renderChains(); },
  addStep(chainId, tactic) {
    const chain = state.store.chains.find(c => c.id === chainId); if (!chain) return;
    const suggest = state.catalog.tools.filter(t => (t.tactics||[]).includes(tactic || 'reconnaissance'));
    const opts = `<option value="">— manual step (no tool) —</option>` +
      suggest.map(t => `<option value="${esc(t.name)}">${esc(t.name)} (${t.status})</option>`).join('') +
      `<optgroup label="all tools">${state.catalog.tools.map(t=>`<option value="${esc(t.name)}">${esc(t.name)}</option>`).join('')}</optgroup>`;
    modal('Add step', `
      <div class="field"><label>Tactic (stage)</label><select id="pTac">
        ${TACTICS.map(t=>`<option value="${t[0]}" ${t[0]===tactic?'selected':''}>${t[1]} · ${t[2]}</option>`).join('')}</select></div>
      <div class="field"><label>Step name</label><input id="pName" placeholder="e.g. roast service accounts"></div>
      <div class="field"><label>Tool</label><select id="pTool">${opts}</select></div>
      <div class="field"><label>Target</label><input id="pTarget" placeholder="optional"></div>
      <div class="field"><label>Extra args</label><input id="pArgs" placeholder="optional"></div>`, (b) => {
        chain.steps.push({ id: uid('s'), tactic: b.querySelector('#pTac').value,
          name: b.querySelector('#pName').value.trim(), tool: b.querySelector('#pTool').value || null,
          target: b.querySelector('#pTarget').value.trim(), args: b.querySelector('#pArgs').value.trim(), status: '' });
        persist().then(renderChains);
      });
  },
  editStep(chainId, stepId) {
    const chain = state.store.chains.find(c => c.id === chainId); const s = chain.steps.find(x => x.id === stepId); if (!s) return;
    modal('Edit step', `
      <div class="field"><label>Name</label><input id="pName" value="${esc(s.name||'')}"></div>
      <div class="field"><label>Tool</label><select id="pTool"><option value="">— manual —</option>
        ${state.catalog.tools.map(t=>`<option value="${esc(t.name)}" ${t.name===s.tool?'selected':''}>${esc(t.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Target</label><input id="pTarget" value="${esc(s.target||'')}"></div>
      <div class="field"><label>Extra args</label><input id="pArgs" value="${esc(s.args||'')}"></div>
      <div class="field"><label>Status</label><select id="pStatus">
        ${['', 'done', 'fail'].map(v=>`<option value="${v}" ${v===s.status?'selected':''}>${v||'pending'}</option>`).join('')}</select></div>
      <div class="row"><button class="btn ghost small" onclick="app.delStep('${chainId}','${stepId}')">delete step</button></div>`, (b) => {
        s.name = b.querySelector('#pName').value.trim(); s.tool = b.querySelector('#pTool').value || null;
        s.target = b.querySelector('#pTarget').value.trim(); s.args = b.querySelector('#pArgs').value.trim();
        s.status = b.querySelector('#pStatus').value; persist().then(renderChains);
      });
  },
  async delStep(chainId, stepId) { const c = state.store.chains.find(x=>x.id===chainId); c.steps = c.steps.filter(s=>s.id!==stepId); await persist(); document.querySelector('.modal-back')?.remove(); renderChains(); },
  async runChain(chainId) {
    const chain = state.store.chains.find(c => c.id === chainId); if (!chain || !chain.steps.length) return;
    const con = $('#chainConsole'); con.textContent = '';
    const w = (t, cls) => { const s = document.createElement('span'); if (cls==='err') s.style.color='#ff7a7a'; if (cls==='sys') s.style.color='#7fb0ff'; if (cls==='ok') s.style.color='#7ee787'; s.textContent = t; con.appendChild(s); con.scrollTop = con.scrollHeight; };
    $('#runChainBtn').disabled = true;
    for (const step of chain.steps) {
      step.status = 'run'; renderChainSteps(chain);
      w(`\n▶ [${TAC_LABEL[step.tactic]}] ${step.name || step.tool || 'step'}\n`, 'sys');
      const tool = step.tool ? state.catalog.tools.find(t => t.name === step.tool) : null;
      if (!tool) { w(`  ☐ manual step — marked done\n`, 'ok'); step.status = 'done'; await rc.log({ kind:'chain', label:`${chain.name}: ${step.name||'manual'}`, attack: TAC_ID[step.tactic], target: step.target||'' }); renderChainSteps(chain); continue; }
      const okp = await new Promise(res => {
        runTool({ tool, target: step.target, extraArgs: step.args, label: `${chain.name}: ${step.name||tool.name}`, attack: TAC_ID[step.tactic],
          onLine: (t, s) => w('  ' + t, s), onEnd: (code) => res(code === 0) });
      });
      step.status = okp ? 'done' : 'fail'; renderChainSteps(chain);
    }
    w(`\n✔ chain complete\n`, 'ok');
    $('#runChainBtn').disabled = false; await persist();
  },
  exportChain(chainId) {
    const c = state.store.chains.find(x=>x.id===chainId);
    const md = `# ${c.name}\n\n` + c.steps.map((s,i)=>`${i+1}. [${TAC_LABEL[s.tactic]} ${TAC_ID[s.tactic]}] ${s.name||s.tool||'step'}${s.tool?` — \`${s.tool} ${s.target||''}\``:''}`).join('\n');
    rc.copy(md); toast('chain copied as checklist');
  },

  // C2
  newListener() {
    modal('New listener', `
      <div class="field"><label>Name</label><input id="lName" value="http-1"></div>
      <div class="field"><label>Type</label><select id="lType"><option>HTTP</option><option>HTTPS</option><option>DNS</option><option>SMB</option><option>TCP</option></select></div>
      <div class="field"><label>Bind host</label><input id="lHost" value="0.0.0.0"></div>
      <div class="field"><label>Port</label><input id="lPort" value="443"></div>
      <div class="field"><label>Malleable profile</label><input id="lProfile" placeholder="default"></div>`, (b) => {
        state.store.c2.listeners.push({ id: uid('l'), name: b.querySelector('#lName').value.trim(),
          type: b.querySelector('#lType').value, host: b.querySelector('#lHost').value.trim(),
          port: b.querySelector('#lPort').value.trim(), profile: b.querySelector('#lProfile').value.trim(), status: 'stopped' });
        persist().then(renderC2);
      });
  },
  async toggleListener(id) {
    const l = state.store.c2.listeners.find(x=>x.id===id);
    if (l.status === 'running') { l.status = 'stopped'; if (l.runId) rc.run.stop(l.runId); }
    else {
      const tool = state.catalog.tools.find(t => t.name === 'phantom-c2');
      l.status = 'running';
      await rc.log({ kind:'c2', label:`listener ${l.name} started (${l.type} ${l.host}:${l.port})`, attack:'TA0011' });
      if (tool) { const runId = uid('l'); l.runId = runId; state.runner = { runId, running:true, onLine:null, onEnd:null };
        rc.run.start({ runId, tool, target:'', extraArgs:`--port ${l.port}`, scope: scopeList(), label:`c2:${l.name}`, attack:'TA0011' }); }
    }
    await persist(); renderC2();
  },
  async copyListenerCmd(id) { const l = state.store.c2.listeners.find(x=>x.id===id);
    const tool = state.catalog.tools.find(t=>t.name==='phantom-c2');
    const cmd = await rc.tool.command({ tool, target:'', extraArgs:`--port ${l.port}` }); rc.copy(cmd); toast('listener command copied'); },
  async delListener(id) { state.store.c2.listeners = state.store.c2.listeners.filter(x=>x.id!==id); await persist(); renderC2(); },
  newImplant() {
    modal('Log session', `
      <div class="field"><label>Host</label><input id="iHost" placeholder="WIN-DC01"></div>
      <div class="field"><label>User</label><input id="iUser" placeholder="CORP\\\\svc_sql"></div>
      <div class="field"><label>Listener</label><select id="iList"><option value="">—</option>
        ${state.store.c2.listeners.map(l=>`<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select></div>`, (b) => {
        state.store.c2.implants.push({ id: uid('i'), host: b.querySelector('#iHost').value.trim(),
          user: b.querySelector('#iUser').value.trim(), listenerId: b.querySelector('#iList').value, lastSeen: now() });
        rc.log({ kind:'c2', label:`session from ${b.querySelector('#iHost').value.trim()}`, attack:'TA0011' });
        persist().then(renderC2);
      });
  },
  async delImplant(id) { state.store.c2.implants = state.store.c2.implants.filter(x=>x.id!==id); await persist(); renderC2(); },

  // phishing
  newCampaign() { app._campModal({ id: uid('p'), name:'New campaign', pretext:'', targets:[], status:'draft', sent:0, opened:0, clicked:0, submitted:0 }, true); },
  editCampaign(id) { const c = state.store.phishing.campaigns.find(x=>x.id===id); app._campModal(c, false); },
  _campModal(c, isNew) {
    modal(isNew?'New campaign':'Edit campaign', `
      <div class="field"><label>Name</label><input id="cName" value="${esc(c.name)}"></div>
      <div class="field"><label>Pretext</label><textarea id="cPre" rows="3">${esc(c.pretext||'')}</textarea></div>
      <div class="field"><label>Targets (one email per line)</label><textarea id="cTargets" rows="4">${esc((c.targets||[]).join('\n'))}</textarea></div>
      <div class="field"><label>Status</label><select id="cStatus">${['draft','sending','live','done'].map(s=>`<option ${s===c.status?'selected':''}>${s}</option>`).join('')}</select></div>
      <div class="split">
        <div class="field"><label>Sent</label><input id="cSent" value="${c.sent||0}"></div>
        <div class="field"><label>Opened</label><input id="cOpened" value="${c.opened||0}"></div>
        <div class="field"><label>Clicked</label><input id="cClicked" value="${c.clicked||0}"></div>
        <div class="field"><label>Submitted</label><input id="cSub" value="${c.submitted||0}"></div>
      </div>`, (b) => {
        c.name = b.querySelector('#cName').value.trim(); c.pretext = b.querySelector('#cPre').value.trim();
        c.targets = b.querySelector('#cTargets').value.split('\n').map(x=>x.trim()).filter(Boolean);
        c.status = b.querySelector('#cStatus').value;
        c.sent=+b.querySelector('#cSent').value||0; c.opened=+b.querySelector('#cOpened').value||0;
        c.clicked=+b.querySelector('#cClicked').value||0; c.submitted=+b.querySelector('#cSub').value||0;
        if (isNew) state.store.phishing.campaigns.push(c);
        persist().then(renderPhishing);
      });
  },
  async delCampaign(id) { state.store.phishing.campaigns = state.store.phishing.campaigns.filter(x=>x.id!==id); await persist(); renderPhishing(); },

  // engagements
  async newEngagement() { const id = uid('e'); state.store.engagements.push({ id, name:'New engagement', scope:[], targets:[], notes:'' }); state.store.activeId = state.store.activeId || id; await persist(); renderEngagements(); editEngagement(id); },
  editEngagement,
  async saveEngagement(id) { const e = state.store.engagements.find(x=>x.id===id);
    e.name = $('#eName').value.trim()||'Untitled'; e.scope = $('#eScope').value.split('\n').map(s=>s.trim()).filter(Boolean);
    e.targets = $('#eTargets').value.split('\n').map(s=>s.trim()).filter(Boolean); e.notes = $('#eNotes').value; await persist(); renderEngagements(); },
  async deleteEngagement(id) { state.store.engagements = state.store.engagements.filter(x=>x.id!==id); if (state.store.activeId===id) state.store.activeId = state.store.engagements[0]?.id||null; await persist(); renderEngagements(); },
  async activate(id) { state.store.activeId = id; await persist(); renderEngagements(); },

  async clearActivity() { state.store.activity = []; await persist(); renderActivity(); },

  async pickDir() { const d = await rc.settings.pickDir(); if (d) $('#sDir').value = d; },
  async saveSettings() { state.settings = await rc.settings.set({ operator: $('#sOp').value.trim(), pythonPath: $('#sPy').value.trim(), toolsDir: $('#sDir').value.trim(), confirmOutOfScope: $('#sScope').checked }); toast('settings saved'); }
};

// re-render only the step cards during a chain run (avoid rebuilding the console)
function renderChainSteps(chain) {
  document.querySelectorAll('.board .stage').forEach(stage => {
    // cheap: re-render whole board region is fine since console is separate
  });
  const chosen = state.store.chains.find(c => c.id === chain.id);
  if (state.view === 'chains' && state.activeChainId === chain.id) {
    // update step classes in place
    chain.steps.forEach(s => {
      const nodes = document.querySelectorAll('.step');
      nodes.forEach(n => { if (n.getAttribute('onclick')?.includes(s.id)) { n.className = 'step ' + (s.status||''); } });
    });
  }
}

function toast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:var(--panel);border:1px solid var(--accent);color:var(--ink);padding:10px 18px;border-radius:10px;box-shadow:var(--shadow);z-index:99;font-size:13px';
  document.body.appendChild(t); setTimeout(() => t.remove(), 1800);
}

boot();
