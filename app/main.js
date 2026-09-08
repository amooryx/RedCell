'use strict';

// RedCell — main process (v2, operations platform).
// Owns the window, all persistence, and the only place tools are spawned.
// The renderer reaches none of this directly; everything crosses the
// contextBridge in preload.js.

const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DATA_DIR = path.join(app.getPath('userData'), 'data');
const FILES = {
  settings: path.join(DATA_DIR, 'settings.json'),
  store: path.join(DATA_DIR, 'store.json') // engagements, chains, c2, phishing, payloads, activity
};

const running = new Map(); // runId -> child

// ---------- persistence ----------
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return fallback; }
}
function writeJSON(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf-8');
}
function defaultSettings() {
  return {
    pythonPath: process.platform === 'win32' ? 'python' : 'python3',
    toolsDir: path.join(os.homedir(), 'redcell-tools'),
    theme: 'dark',
    confirmOutOfScope: true,
    operator: os.userInfo().username || 'operator'
  };
}
function defaultStore() {
  return {
    engagements: [], activeId: null,
    chains: [], c2: { listeners: [], implants: [] },
    phishing: { campaigns: [] }, payloads: [], activity: []
  };
}
function ensureData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILES.settings)) writeJSON(FILES.settings, defaultSettings());
  if (!fs.existsSync(FILES.store)) writeJSON(FILES.store, defaultStore());
}
function loadCatalog() {
  return readJSON(path.join(__dirname, 'renderer', 'tools.json'), { tools: [], categories: [] });
}

// ---------- window ----------
let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1340, height: 860, minWidth: 1040, minHeight: 680,
    backgroundColor: '#0b0e14',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false
    }
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}
app.whenReady().then(() => { ensureData(); createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => {
  for (const c of running.values()) { try { c.kill(); } catch {} }
  if (process.platform !== 'darwin') app.quit();
});

// ---------- scope ----------
function hostOf(t) {
  if (!t) return '';
  let s = String(t).trim();
  if (s.includes('://')) { try { return new URL(s).hostname.toLowerCase(); } catch {} }
  return s.split('/')[0].split(':')[0].toLowerCase();
}
function inScope(scope, target) {
  if (!scope || !scope.length) return null;
  const host = hostOf(target);
  return scope.some(r => {
    const rule = String(r).trim().toLowerCase().replace(/^\*\./, '');
    return host === rule || host.endsWith('.' + rule);
  });
}

// ---------- activity log ----------
function logActivity(entry) {
  const store = readJSON(FILES.store, defaultStore());
  store.activity.unshift({ ts: new Date().toISOString(), ...entry });
  store.activity = store.activity.slice(0, 500);
  writeJSON(FILES.store, store);
  if (win && !win.isDestroyed()) win.webContents.send('activity:new', store.activity[0]);
}

// ---------- IPC: settings ----------
ipcMain.handle('settings:get', () => readJSON(FILES.settings, defaultSettings()));
ipcMain.handle('settings:set', (_e, patch) => {
  const next = { ...readJSON(FILES.settings, defaultSettings()), ...patch };
  writeJSON(FILES.settings, next); return next;
});
ipcMain.handle('settings:pickDir', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

// ---------- IPC: catalog + store ----------
ipcMain.handle('catalog:get', () => loadCatalog());
ipcMain.handle('store:get', () => readJSON(FILES.store, defaultStore()));
ipcMain.handle('store:save', (_e, store) => { writeJSON(FILES.store, store); return store; });
ipcMain.handle('log', (_e, entry) => { logActivity(entry); return true; });

// ---------- IPC: misc ----------
ipcMain.handle('open:external', (_e, url) => shell.openExternal(url));
ipcMain.handle('clipboard:write', (_e, text) => { clipboard.writeText(text || ''); return true; });

// ---------- IPC: resolve a tool to a command (no spawn) ----------
function resolveCommand(tool, target, extraArgs) {
  const s = readJSON(FILES.settings, defaultSettings());
  let cmd = s.pythonPath, args = [];
  const toolDir = tool ? path.join(s.toolsDir, tool.name) : s.toolsDir;
  if (tool && tool.module) { args = ['-m', 'reconpal']; if (target) args.push(target); }
  else if (tool) {
    args = [path.join(toolDir, tool.entry)];
    if (target) args.push(target);
  }
  if (extraArgs && extraArgs.trim()) args = args.concat(extraArgs.trim().split(/\s+/));
  if (tool) args.push('-y');
  return { cmd, args, toolDir };
}
ipcMain.handle('tool:command', (_e, { tool, target, extraArgs }) => {
  const { cmd, args } = resolveCommand(tool, target, extraArgs);
  return `${cmd} ${args.join(' ')}`;
});

// ---------- IPC: run a tool / command, stream output ----------
ipcMain.handle('run:start', (_e, { runId, tool, target, extraArgs, scope, label, attack }) => {
  const s = readJSON(FILES.settings, defaultSettings());
  if (s.confirmOutOfScope && target) {
    const v = inScope(scope, target);
    if (v === false) return { started: false, reason: `"${hostOf(target)}" is not in the active engagement scope.` };
  }
  const { cmd, args, toolDir } = resolveCommand(tool, target, extraArgs);
  if (tool && !tool.module) {
    const script = args[0];
    if (!fs.existsSync(script)) {
      return { started: false, reason: `Not found: ${script}\nSet the tools directory in Settings and clone the tool there. RedCell's own modules work without it.` };
    }
  }
  let child;
  try { child = spawn(cmd, args, { cwd: fs.existsSync(toolDir) ? toolDir : s.toolsDir }); }
  catch (err) { return { started: false, reason: String(err.message || err) }; }

  running.set(runId, child);
  const send = (stream, chunk) => win && !win.isDestroyed() &&
    win.webContents.send('run:data', { runId, stream, chunk: chunk.toString() });
  child.stdout.on('data', d => send('stdout', d));
  child.stderr.on('data', d => send('stderr', d));
  child.on('error', e => send('stderr', `[spawn error] ${e.message}\n`));
  child.on('close', code => {
    running.delete(runId);
    win && !win.isDestroyed() && win.webContents.send('run:end', { runId, code });
  });
  logActivity({ kind: 'run', label: label || (tool ? tool.name : 'command'), target: target || '', attack: attack || null });
  return { started: true, command: `${cmd} ${args.join(' ')}` };
});
ipcMain.handle('run:stop', (_e, runId) => {
  const c = running.get(runId);
  if (c) { try { c.kill(); } catch {} running.delete(runId); return true; }
  return false;
});
