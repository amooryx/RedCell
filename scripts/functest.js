'use strict';
// Real functional test against the REAL app: require main.js so all IPC
// handlers register and the real window is created, then capture console
// (CSP + JS errors) and SIMULATE clicks, asserting the DOM actually reacts.

const path = require('path');
const os = require('os');
const { app, BrowserWindow } = require('electron');
// Isolate test data (and wipe it first) so runs are deterministic and never
// pollute the real RedCell store.
const TESTDIR = path.join(os.tmpdir(), 'redcell-functest');
try { require('fs').rmSync(TESTDIR, { recursive: true, force: true }); } catch {}
app.setPath('userData', TESTDIR);
require(path.join(__dirname, '..', 'app', 'main.js')); // registers ipc + creates window

const msgs = [];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  await sleep(400);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) { console.log('no window created'); return app.exit(2); }
  win.hide();
  win.webContents.on('console-message', (_e, level, message) => msgs.push({ level, message }));

  // wait for boot() to finish (app object + first render)
  let booted = false;
  for (let i = 0; i < 40; i++) {
    const ok = await win.webContents.executeJavaScript(
      `typeof window.app === 'object' && document.querySelectorAll('.nav-item').length > 0`).catch(() => false);
    if (ok) { booted = true; break; }
    await sleep(150);
  }

  const results = [];
  const check = async (name, expr) => {
    try { const v = await win.webContents.executeJavaScript(expr); results.push({ name, pass: !!v, value: v }); }
    catch (e) { results.push({ name, pass: false, error: e.message }); }
  };

  results.push({ name: 'boot() completed (nav present)', pass: booted });
  await check('window.app + bridge exist', `typeof window.app==='object' && typeof window.redcell==='object'`);
  await check('dashboard rendered content', `document.querySelector('#view').children.length > 0`);

  // nav via addEventListener
  await check('nav → Attack Chains', `(()=>{[...document.querySelectorAll('.nav-item')].find(x=>x.dataset.view==='chains').click();return document.querySelector('#crumb').textContent==='Attack Chains';})()`);

  // arsenal + INLINE onclick handlers (the CSP-sensitive path)
  await check('Arsenal renders tool cards', `(()=>{[...document.querySelectorAll('.nav-item')].find(x=>x.dataset.view==='arsenal').click();return document.querySelectorAll('.tool-card').length;})()`);
  await check('category filter + subcategory grouping', `(async()=>{const c=[...document.querySelectorAll('.ct-cat')].find(x=>x.textContent.includes('Active Directory'));if(!c)return false;c.click();await new Promise(r=>setTimeout(r,150));const cards=document.querySelectorAll('.tool-card').length;const subs=document.querySelectorAll('.subcat').length;return cards>0 && subs>0;})()`);
  await check('inline onclick: Run opens modal', `(async()=>{const b=[...document.querySelectorAll('.tool-card .btn.primary')][0];if(!b)return false;b.click();await new Promise(r=>setTimeout(r,150));return !!document.querySelector('.modal-back');})()`);
  await check('modal closes', `(async()=>{const x=document.querySelector('.modal-back [data-x]');if(x)x.click();await new Promise(r=>setTimeout(r,100));return !document.querySelector('.modal-back');})()`);

  // ---- deep operational flows (state changes persisted through IPC) ----
  await check('Chains: create chain', `(async()=>{await window.app.newChain();await new Promise(r=>setTimeout(r,200));return (await window.redcell.store.get()).chains.length>0;})()`);
  await check('Chains: add a step', `(async()=>{const st=await window.redcell.store.get();const c=st.chains[0];c.steps.push({id:'s1',tactic:'reconnaissance',name:'test',tool:null,target:'',args:'',status:''});await window.redcell.store.save(st);return (await window.redcell.store.get()).chains[0].steps.length===1;})()`);
  await check('C2: create listener', `(async()=>{const st=await window.redcell.store.get();st.c2.listeners.push({id:'l1',name:'t',type:'HTTP',host:'0.0.0.0',port:'443',profile:'',status:'stopped'});await window.redcell.store.save(st);return (await window.redcell.store.get()).c2.listeners.length===1;})()`);
  await check('Phishing: create campaign', `(async()=>{const st=await window.redcell.store.get();st.phishing.campaigns.push({id:'p1',name:'t',pretext:'',targets:['a@b.c'],status:'draft',sent:0,opened:0,clicked:0,submitted:0});await window.redcell.store.save(st);return (await window.redcell.store.get()).phishing.campaigns.length===1;})()`);
  await check('Engagements: create + scope', `(async()=>{const st=await window.redcell.store.get();st.engagements.push({id:'e1',name:'t',scope:['example.com'],targets:[],notes:''});st.activeId='e1';await window.redcell.store.save(st);return (await window.redcell.store.get()).engagements.length===1;})()`);
  await check('Scope gate blocks out-of-scope run', `(async()=>{const r=await window.redcell.run.start({runId:'x1',tool:{name:'ad-enum',entry:'ad_enum.py'},target:'evil.com',extraArgs:'',scope:['example.com'],label:'t'});return r.started===false && /scope/i.test(r.reason);})()`);
  await check('Activity log records events', `(async()=>{await window.redcell.log({kind:'test',label:'unit',attack:'TA0001'});return (await window.redcell.store.get()).activity.length>0;})()`);

  const csp = msgs.filter(m => /Content Security Policy|Refused to (execute|run|apply)|inline event handler|violates/i.test(m.message));
  const jsErr = msgs.filter(m => m.level >= 2 && !/Content Security|Refused to/i.test(m.message));

  console.log('\n=== FUNCTIONAL TEST (real handlers) ===');
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${(r.value !== undefined && typeof r.value !== 'boolean') ? ' → ' + r.value : ''}${r.error ? ' — ' + r.error : ''}`);
  console.log(`\nCSP violations: ${csp.length}`);
  csp.slice(0, 3).forEach(m => console.log('  ⚠ ' + m.message.slice(0, 150)));
  console.log(`Renderer JS errors: ${jsErr.length}`);
  jsErr.slice(0, 6).forEach(m => console.log('  ✖ ' + m.message.slice(0, 150)));

  const failed = results.filter(r => !r.pass).length + csp.length;
  console.log(`\n${failed ? failed + ' PROBLEM(S)' : 'ALL FUNCTIONAL CHECKS PASSED'}`);
  app.exit(failed ? 1 : 0);
});

setTimeout(() => { console.log('timeout'); app.exit(2); }, 25000);
