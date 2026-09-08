'use strict';
// Headless sanity checks: files present, JSON valid, JS parses, catalog sane.
// Does not open a window (CI/background friendly).

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };

// required files
for (const f of ['app/main.js', 'app/preload.js', 'app/renderer/index.html',
                 'app/renderer/styles.css', 'app/renderer/app.js', 'app/renderer/tools.json',
                 'package.json']) {
  ok(fs.existsSync(path.join(root, f)), 'exists: ' + f);
}

// package.json valid + main points to a real file
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
ok(!!pkg.main && fs.existsSync(path.join(root, pkg.main)), 'package.main resolves: ' + pkg.main);

// catalog valid
const cat = JSON.parse(fs.readFileSync(path.join(root, 'app/renderer/tools.json'), 'utf-8'));
ok(Array.isArray(cat.tools) && cat.tools.length === 100, `catalog has 100 tools (got ${cat.tools.length})`);
ok(cat.tools.every(t => t.name && t.category && t.entry && t.status), 'every tool has name/category/entry/status');
ok(cat.tools.every(t => Array.isArray(t.tactics) && t.tactics.length), 'every tool has ATT&CK tactics');
ok(new Set(cat.tools.map(t => t.name)).size === cat.tools.length, 'no duplicate tool names');
const funcN = cat.tools.filter(t => t.status === 'tool').length;
ok(funcN === 60, `60 working tools flagged (got ${funcN})`);

// JS parses (syntax check main, preload, renderer)
for (const f of ['app/main.js', 'app/preload.js', 'app/renderer/app.js', 'scripts/smoke.js']) {
  try { new vm.Script(fs.readFileSync(path.join(root, f), 'utf-8'), { filename: f }); ok(true, 'parses: ' + f); }
  catch (e) { ok(false, `parses: ${f} — ${e.message}`); }
}

// HTML references its assets
const html = fs.readFileSync(path.join(root, 'app/renderer/index.html'), 'utf-8');
ok(html.includes('styles.css') && html.includes('app.js'), 'index.html wires css + js');

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed');
process.exit(fail ? 1 : 0);
