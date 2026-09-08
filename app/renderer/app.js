'use strict';

// RedCell renderer. No Node here — everything privileged goes through
// window.redcell (see preload.js). This file is pure UI state + rendering.

const rc = window.redcell;

const state = {
  catalog: { tools: [], categories: [] },
  settings: {},
  eng: { engagements: [], activeId: null },
  view: 'dashboard',
  filter: 'All',
  search: '',
  favorites: JSON.parse(localStorage.getItem('rc.favs') || '[]'),
  runner: { tool: null, runId: null, running: false }
};

const $ = (sel, el = document) => el.querySelector(sel);
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function activeEngagement() {
  return state.eng.engagements.find(e => e.id === state.eng.activeId) || null;
}
function saveFavs() { localStorage.setItem('rc.favs', JSON.stringify(state.favorites)); }

// ---------- boot ----------
async function boot() {
  state.catalog = await rc.catalog.get();
  state.settings = await rc.settings.get();
  state.eng = await rc.engagements.get();
  document.body.className = state.settings.theme === 'light' ? 'theme-light' : 'theme-dark';

  bindChrome();
  wireRunEvents();
  renderEngPill();
  render();
}

function bindChrome() {
  document.querySelectorAll('.nav-item').forEach(b =>
    b.addEventListener('click', () => go(b.dataset.view)));
  $('#themeToggle').addEventListener('click', toggleTheme);
  $('#globalSearch').addEventListener('input', e => {
    state.search = e.target.value.toLowerCase();
    if (state.view !== 'arsenal') go('arsenal');
    else renderArsenal();
  });
}

function go(view) {
  state.view = view;
  document.querySelectorAll('.nav-item').forEach(b =>
    b.classList.toggle('active', b.dataset.view === view));
  $('#crumb').textContent = { dashboard: 'Dashboard', arsenal: 'Arsenal', runner: 'Runner', engagements: 'Engagements', settings: 'Settings' }[view];
  render();
}

async function toggleTheme() {
  const next = document.body.classList.contains('theme-dark') ? 'light' : 'dark';
  document.body.className = 'theme-' + next;
  state.settings = await rc.settings.set({ theme: next });
}

function render() {
  ({ dashboard: renderDashboard, arsenal: renderArsenal, runner: renderRunner,
     engagements: renderEngagements, settings: renderSettings }[state.view])();
}

// ---------- dashboard ----------
function renderDashboard() {
  const tools = state.catalog.tools;
  const funcCount = tools.filter(t => t.status === 'tool').length;
  const scaffoldCount = tools.filter(t => t.status === 'scaffold').length;
  const eng = activeEngagement();
  const cats = {};
  tools.forEach(t => cats[t.category] = (cats[t.category] || 0) + 1);
  const maxCat = Math.max(...Object.values(cats));

  const v = $('#view');
  v.innerHTML = `
    <div class="notice">
      <span>ℹ️</span>
      <div><b>Authorised testing only.</b> RedCell launches your tools against targets you scope in an
      engagement. Of ${tools.length} tools, <b>${funcCount}</b> are working and <b>${scaffoldCount}</b>
      are scaffolds under active development — each is labelled honestly in the Arsenal.</div>
    </div>

    <div class="tiles">
      <div class="tile"><div class="t-num t-accent">${tools.length}</div><div class="t-lbl">tools catalogued</div></div>
      <div class="tile"><div class="t-num">${funcCount}</div><div class="t-lbl">working now</div></div>
      <div class="tile"><div class="t-num">${state.catalog.categories.length}</div><div class="t-lbl">categories</div></div>
      <div class="tile"><div class="t-num">${state.eng.engagements.length}</div><div class="t-lbl">engagements</div></div>
    </div>

    <h2 class="section">Active engagement</h2>
    ${eng ? `
      <div class="eng-row active">
        <div>
          <div class="er-name">${esc(eng.name)}</div>
          <div class="er-meta">${eng.scope.length} in-scope host(s) · ${eng.targets.length} target(s) · ${eng.notes ? 'notes present' : 'no notes'}</div>
        </div>
        <button class="btn small" onclick="app.go('engagements')">manage</button>
      </div>` : `
      <div class="empty">No active engagement. <a class="link" onclick="app.go('engagements')">Create one</a> to set scope before you run anything.</div>`}

    <h2 class="section" style="margin-top:26px">Arsenal by category</h2>
    <div class="cat-grid">
      ${Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([c, n]) => `
        <div class="cat-card" onclick="app.openCategory('${esc(c)}')">
          <div class="cc-name">${esc(c)}</div>
          <div class="cc-count">${n} tools</div>
          <div class="cat-bar"><i style="width:${Math.round(n/maxCat*100)}%"></i></div>
        </div>`).join('')}
    </div>`;
}

// ---------- arsenal ----------
function toolMatches(t) {
  if (state.filter !== 'All' && t.category !== state.filter) return false;
  if (state.filter === '★ Favorites' && !state.favorites.includes(t.name)) return false;
  if (state.search) {
    const hay = (t.name + ' ' + t.description + ' ' + t.category).toLowerCase();
    if (!hay.includes(state.search)) return false;
  }
  return true;
}

function renderArsenal() {
  const cats = ['All', '★ Favorites', ...state.catalog.categories];
  const list = state.catalog.tools.filter(t => {
    if (state.filter === '★ Favorites') return state.favorites.includes(t.name) &&
      (!state.search || (t.name + t.description).toLowerCase().includes(state.search));
    return toolMatches(t);
  });

  const v = $('#view');
  v.innerHTML = `
    <div class="filters">
      ${cats.map(c => `<button class="chip ${state.filter === c ? 'active' : ''}" onclick="app.setFilter('${esc(c)}')">${esc(c)}</button>`).join('')}
    </div>
    <div class="tool-grid">
      ${list.length ? list.map(toolCard).join('') : `<div class="empty">No tools match.</div>`}
    </div>`;
}

function toolCard(t) {
  const fav = state.favorites.includes(t.name);
  return `
    <div class="tool-card">
      <div class="tc-head">
        <div class="tc-name">${esc(t.name)}</div>
        <div class="tc-badges">
          <span class="badge ${t.status}">${t.status === 'tool' ? 'working' : 'scaffold'}</span>
          <span class="star ${fav ? 'on' : ''}" onclick="app.toggleFav('${esc(t.name)}')">${fav ? '★' : '☆'}</span>
        </div>
      </div>
      <div class="tc-cat">${esc(t.category)}</div>
      <div class="tc-desc">${esc(t.description)}</div>
      <div class="tc-actions">
        <button class="btn primary small" onclick="app.launch('${esc(t.name)}')">▶ Run</button>
        <button class="btn ghost small" onclick="app.openRepo('${esc(t.repo)}')">repo ↗</button>
      </div>
    </div>`;
}

// ---------- runner ----------
function renderRunner() {
  const t = state.runner.tool;
  const eng = activeEngagement();
  const v = $('#view');
  v.innerHTML = `
    <div class="runner-grid">
      <div class="panel">
        <h2 class="section">Run a tool</h2>
        <div class="field">
          <label>Tool</label>
          <select id="rTool">
            ${state.catalog.tools.map(x =>
              `<option value="${esc(x.name)}" ${t && t.name === x.name ? 'selected' : ''}>${esc(x.name)} — ${esc(x.category)}</option>`).join('')}
          </select>
          <div class="hint" id="rToolHint"></div>
        </div>
        <div class="field">
          <label>Target</label>
          <input id="rTarget" placeholder="host, domain, or file" list="targetList">
          <datalist id="targetList">${eng ? eng.targets.map(x => `<option value="${esc(x)}">`).join('') : ''}</datalist>
          <div class="hint">${eng ? `scope-checked against <b>${esc(eng.name)}</b>` : 'no active engagement — scope check skipped'}</div>
        </div>
        <div class="field">
          <label>Extra arguments <span class="hint" style="display:inline">(optional)</span></label>
          <input id="rArgs" placeholder="-o out.txt --verbose">
        </div>
        <div class="row">
          <button class="btn primary" id="rGo">▶ Execute</button>
          <button class="btn ghost" id="rStop" disabled>■ Stop</button>
        </div>
      </div>

      <div class="panel" style="display:flex; flex-direction:column; min-height:0;">
        <div class="run-head">
          <div><span class="dot idle" id="rDot"></span><span class="run-status" id="rStatus">idle</span></div>
          <button class="btn ghost small" id="rClear">clear</button>
        </div>
        <div class="console" id="rConsole"><span class="sys">RedCell console ready. Select a tool and execute.\n</span></div>
      </div>
    </div>`;

  const sel = $('#rTool');
  const hint = () => {
    const tool = state.catalog.tools.find(x => x.name === sel.value);
    $('#rToolHint').innerHTML = tool
      ? `${tool.status === 'scaffold' ? '<b style="color:#ffb300">scaffold</b> — ' : ''}${esc(tool.description)}`
      : '';
    state.runner.tool = tool;
  };
  sel.addEventListener('change', hint); hint();
  $('#rGo').addEventListener('click', execute);
  $('#rStop').addEventListener('click', stop);
  $('#rClear').addEventListener('click', () => { $('#rConsole').innerHTML = ''; });
}

function cLine(text, cls) {
  const c = $('#rConsole'); if (!c) return;
  const span = document.createElement('span');
  if (cls) span.className = cls;
  span.textContent = text;
  c.appendChild(span);
  c.scrollTop = c.scrollHeight;
}

async function execute() {
  const tool = state.catalog.tools.find(x => x.name === $('#rTool').value);
  const target = $('#rTarget').value.trim();
  const extraArgs = $('#rArgs').value.trim();
  const eng = activeEngagement();
  if (!tool) return;

  const runId = 'r' + Date.now();
  state.runner = { tool, runId, running: true };
  setRunUI(true);
  cLine(`\n$ ${tool.name}${target ? ' ' + target : ''}${extraArgs ? ' ' + extraArgs : ''}\n`, 'cmd');

  const res = await rc.tool.run({
    runId, tool, target, extraArgs,
    engagementScope: eng ? eng.scope : []
  });
  if (!res.started) {
    cLine(`[blocked] ${res.reason}\n`, 'err');
    state.runner.running = false; setRunUI(false, 'err');
    return;
  }
  cLine(`[exec] ${res.command}\n`, 'sys');
}

function stop() {
  if (state.runner.runId) rc.tool.stop(state.runner.runId);
}

function wireRunEvents() {
  rc.tool.onData(({ runId, stream, chunk }) => {
    if (runId !== state.runner.runId) return;
    cLine(chunk, stream === 'stderr' ? 'err' : null);
  });
  rc.tool.onEnd(({ runId, code }) => {
    if (runId !== state.runner.runId) return;
    cLine(`\n[finished] exit code ${code}\n`, 'sys');
    state.runner.running = false;
    setRunUI(false, code === 0 ? 'done' : 'err');
  });
}

function setRunUI(running, endState) {
  const dot = $('#rDot'), status = $('#rStatus'), go = $('#rGo'), stopB = $('#rStop');
  if (!dot) return;
  if (running) { dot.className = 'dot run'; status.textContent = 'running…'; go.disabled = true; stopB.disabled = false; }
  else {
    dot.className = 'dot ' + (endState || 'idle');
    status.textContent = endState === 'err' ? 'error / stopped' : endState === 'done' ? 'completed' : 'idle';
    go.disabled = false; stopB.disabled = true;
  }
}

// ---------- engagements ----------
function renderEngagements() {
  const v = $('#view');
  v.innerHTML = `
    <div class="row" style="margin-bottom:18px">
      <h2 class="section" style="margin:0">Engagements</h2><div class="grow"></div>
      <button class="btn primary small" onclick="app.newEngagement()">+ New engagement</button>
    </div>
    ${state.eng.engagements.length ? `<div class="eng-list">${state.eng.engagements.map(engRow).join('')}</div>`
      : `<div class="empty">No engagements yet. Create one to define scope, targets, and notes.</div>`}
    <div id="engEditor"></div>`;
}

function engRow(e) {
  const active = e.id === state.eng.activeId;
  return `
    <div class="eng-row ${active ? 'active' : ''}" onclick="app.editEngagement('${e.id}')">
      <div>
        <div class="er-name">${esc(e.name)} ${active ? '<span class="badge tool">active</span>' : ''}</div>
        <div class="er-meta">${e.scope.length} scope · ${e.targets.length} targets</div>
      </div>
      <button class="btn small" onclick="event.stopPropagation(); app.activate('${e.id}')">${active ? 'active' : 'set active'}</button>
    </div>`;
}

function editEngagement(id) {
  const e = state.eng.engagements.find(x => x.id === id);
  if (!e) return;
  $('#engEditor').innerHTML = `
    <div class="panel mt">
      <h2 class="section">Edit — ${esc(e.name)}</h2>
      <div class="field"><label>Name</label><input id="eName" value="${esc(e.name)}"></div>
      <div class="field"><label>In-scope hosts <span class="hint" style="display:inline">(one per line; supports *.example.com)</span></label>
        <textarea id="eScope" rows="4">${esc(e.scope.join('\n'))}</textarea></div>
      <div class="field"><label>Targets <span class="hint" style="display:inline">(one per line)</span></label>
        <textarea id="eTargets" rows="4">${esc(e.targets.join('\n'))}</textarea></div>
      <div class="field"><label>Notes</label><textarea id="eNotes" rows="5">${esc(e.notes || '')}</textarea></div>
      <div class="row">
        <button class="btn primary" onclick="app.saveEngagement('${e.id}')">Save</button>
        <button class="btn ghost" onclick="app.activate('${e.id}')">Set active</button>
        <div class="grow"></div>
        <button class="btn ghost" onclick="app.deleteEngagement('${e.id}')">Delete</button>
      </div>
    </div>`;
}

async function persistEng() { state.eng = await rc.engagements.save(state.eng); renderEngPill(); }

function renderEngPill() {
  const e = activeEngagement();
  $('#engPillName').textContent = e ? e.name : 'None';
  $('#engPillScope').textContent = e ? (e.scope.length ? e.scope.length + ' in-scope host(s)' : 'no scope set') : 'no scope set';
}

// ---------- settings ----------
function renderSettings() {
  const s = state.settings;
  const v = $('#view');
  v.innerHTML = `
    <div class="panel" style="max-width:640px">
      <h2 class="section">Settings</h2>
      <div class="field">
        <label>Python interpreter</label>
        <input id="sPy" value="${esc(s.pythonPath || '')}">
        <div class="hint">Command RedCell uses to launch Python tools (e.g. <code>python</code>, <code>py -3</code>, or a venv path).</div>
      </div>
      <div class="field">
        <label>Tools directory</label>
        <div class="row"><input id="sDir" class="grow" value="${esc(s.toolsDir || '')}"><button class="btn small" onclick="app.pickDir()">browse…</button></div>
        <div class="hint">Where the tool repos are cloned. Each tool lives in <code>&lt;toolsDir&gt;/&lt;tool-name&gt;/</code>.</div>
      </div>
      <div class="field">
        <label class="row"><input type="checkbox" id="sScope" ${s.confirmOutOfScope ? 'checked' : ''} style="width:auto"> &nbsp;Block launches against out-of-scope targets</label>
      </div>
      <button class="btn primary" onclick="app.saveSettings()">Save settings</button>
      <div class="hint mt">Clone all tools at once (PowerShell):</div>
      <div class="console" style="height:auto; max-height:130px; margin-top:8px">gh repo list amooryx --limit 200 --json name -q '.[].name' | %% { gh repo clone amooryx/$_ "${esc(s.toolsDir || 'TOOLS')}/$_" }</div>
    </div>`;
}

// ---------- public API (used by inline onclick) ----------
window.app = {
  go,
  openCategory(c) { state.filter = c; state.search = ''; $('#globalSearch').value = ''; go('arsenal'); },
  setFilter(c) { state.filter = c; renderArsenal(); },
  toggleFav(name) {
    const i = state.favorites.indexOf(name);
    if (i >= 0) state.favorites.splice(i, 1); else state.favorites.push(name);
    saveFavs(); renderArsenal();
  },
  launch(name) { state.runner.tool = state.catalog.tools.find(t => t.name === name); go('runner'); },
  openRepo(url) { rc.openExternal(url); },
  openCategory(c) { state.filter = c; go('arsenal'); },
  async newEngagement() {
    const id = 'e' + Date.now();
    state.eng.engagements.push({ id, name: 'New engagement', scope: [], targets: [], notes: '' });
    state.eng.activeId = state.eng.activeId || id;
    await persistEng(); renderEngagements(); editEngagement(id);
  },
  editEngagement,
  async saveEngagement(id) {
    const e = state.eng.engagements.find(x => x.id === id);
    e.name = $('#eName').value.trim() || 'Untitled';
    e.scope = $('#eScope').value.split('\n').map(s => s.trim()).filter(Boolean);
    e.targets = $('#eTargets').value.split('\n').map(s => s.trim()).filter(Boolean);
    e.notes = $('#eNotes').value;
    await persistEng(); renderEngagements();
  },
  async deleteEngagement(id) {
    state.eng.engagements = state.eng.engagements.filter(x => x.id !== id);
    if (state.eng.activeId === id) state.eng.activeId = state.eng.engagements[0]?.id || null;
    await persistEng(); renderEngagements();
  },
  async activate(id) { state.eng.activeId = id; await persistEng(); renderEngagements(); },
  async pickDir() { const d = await rc.settings.pickDir(); if (d) { $('#sDir').value = d; } },
  async saveSettings() {
    state.settings = await rc.settings.set({
      pythonPath: $('#sPy').value.trim(),
      toolsDir: $('#sDir').value.trim(),
      confirmOutOfScope: $('#sScope').checked
    });
    renderSettings();
  }
};

boot();
