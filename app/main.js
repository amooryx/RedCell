'use strict';

// RedCell — main process.
// Owns the window, all filesystem persistence, and the only place tools are
// spawned. The renderer can touch none of this directly; everything crosses
// the contextBridge in preload.js, so a compromised renderer cannot shell out
// on its own.

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DATA_DIR = path.join(app.getPath('userData'), 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const ENGAGEMENTS_FILE = path.join(DATA_DIR, 'engagements.json');

// Track live child processes so we can stop them and never leak on quit.
const running = new Map(); // runId -> child

function ensureData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SETTINGS_FILE)) writeJSON(SETTINGS_FILE, defaultSettings());
  if (!fs.existsSync(ENGAGEMENTS_FILE)) writeJSON(ENGAGEMENTS_FILE, { engagements: [], activeId: null });
}

function defaultSettings() {
  // Best-effort guesses; the user can correct these in Settings.
  const home = os.homedir();
  return {
    pythonPath: process.platform === 'win32' ? 'python' : 'python3',
    toolsDir: path.join(home, 'redcell-tools'),
    theme: 'dark',
    confirmOutOfScope: true
  };
}

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
  catch { return fallback; }
}
function writeJSON(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf-8');
}

function loadCatalog() {
  const p = path.join(__dirname, 'renderer', 'tools.json');
  return readJSON(p, { tools: [], categories: [] });
}

// ---- window ----
let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#0b0e14',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  ensureData();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  for (const child of running.values()) { try { child.kill(); } catch {} }
  if (process.platform !== 'darwin') app.quit();
});

// ---- scope helpers ----
function hostOf(target) {
  if (!target) return '';
  let t = String(target).trim();
  if (t.includes('://')) { try { return new URL(t).hostname.toLowerCase(); } catch {} }
  return t.split('/')[0].split(':')[0].toLowerCase();
}
function inScope(scopeList, target) {
  if (!scopeList || scopeList.length === 0) return null; // no scope defined = unknown
  const host = hostOf(target);
  return scopeList.some(rule => {
    const r = String(rule).trim().toLowerCase().replace(/^\*\./, '');
    return host === r || host.endsWith('.' + r);
  });
}

// ---- IPC: settings ----
ipcMain.handle('settings:get', () => readJSON(SETTINGS_FILE, defaultSettings()));
ipcMain.handle('settings:set', (_e, patch) => {
  const cur = readJSON(SETTINGS_FILE, defaultSettings());
  const next = { ...cur, ...patch };
  writeJSON(SETTINGS_FILE, next);
  return next;
});
ipcMain.handle('settings:pickDir', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

// ---- IPC: catalog ----
ipcMain.handle('catalog:get', () => loadCatalog());

// ---- IPC: engagements ----
ipcMain.handle('eng:get', () => readJSON(ENGAGEMENTS_FILE, { engagements: [], activeId: null }));
ipcMain.handle('eng:save', (_e, state) => { writeJSON(ENGAGEMENTS_FILE, state); return state; });

// ---- IPC: open external ----
ipcMain.handle('open:external', (_e, url) => { shell.openExternal(url); });

// ---- IPC: run a tool ----
// Resolves the tool's entry to a real command, checks scope, spawns, and
// streams stdout/stderr back to the renderer as 'run:data' events.
ipcMain.handle('tool:run', (e, { runId, tool, target, extraArgs, engagementScope }) => {
  const settings = readJSON(SETTINGS_FILE, defaultSettings());

  // scope gate
  if (settings.confirmOutOfScope && target) {
    const verdict = inScope(engagementScope, target);
    if (verdict === false) {
      return { started: false, reason: `"${hostOf(target)}" is not in the active engagement scope.` };
    }
  }

  const toolDir = path.join(settings.toolsDir, tool.name);
  let cmd = settings.pythonPath;
  let args = [];

  if (tool.module) {
    // package invocation: python -m reconpal <target>
    args = ['-m', 'reconpal'];
    if (target) args.push(target);
  } else {
    const script = path.join(toolDir, tool.entry);
    if (!fs.existsSync(script)) {
      return { started: false, reason: `Entry not found: ${script}\nSet the tools directory in Settings, and clone the tool there.` };
    }
    args = [script];
    if (target) args.push(target);
  }
  if (extraArgs && extraArgs.trim()) {
    args = args.concat(extraArgs.trim().split(/\s+/));
  }
  // auto-accept the tools' own authorisation prompt; RedCell gates scope itself
  args.push('-y');

  let child;
  try {
    child = spawn(cmd, args, { cwd: fs.existsSync(toolDir) ? toolDir : settings.toolsDir });
  } catch (err) {
    return { started: false, reason: String(err.message || err) };
  }

  running.set(runId, child);
  const send = (stream, chunk) => {
    if (win && !win.isDestroyed()) win.webContents.send('run:data', { runId, stream, chunk: chunk.toString() });
  };
  child.stdout.on('data', d => send('stdout', d));
  child.stderr.on('data', d => send('stderr', d));
  child.on('error', err => send('stderr', `[spawn error] ${err.message}\n`));
  child.on('close', code => {
    running.delete(runId);
    if (win && !win.isDestroyed()) win.webContents.send('run:end', { runId, code });
  });

  return { started: true, command: `${cmd} ${args.join(' ')}` };
});

ipcMain.handle('tool:stop', (_e, runId) => {
  const child = running.get(runId);
  if (child) { try { child.kill(); } catch {} running.delete(runId); return true; }
  return false;
});
