'use strict';

// The only bridge between renderer and Node. Everything the UI can do is here.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('redcell', {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (p) => ipcRenderer.invoke('settings:set', p),
    pickDir: () => ipcRenderer.invoke('settings:pickDir')
  },
  catalog: { get: () => ipcRenderer.invoke('catalog:get') },
  store: {
    get: () => ipcRenderer.invoke('store:get'),
    save: (s) => ipcRenderer.invoke('store:save', s)
  },
  log: (entry) => ipcRenderer.invoke('log', entry),
  onActivity: (cb) => ipcRenderer.on('activity:new', (_e, d) => cb(d)),
  tool: { command: (p) => ipcRenderer.invoke('tool:command', p) },
  run: {
    start: (p) => ipcRenderer.invoke('run:start', p),
    stop: (id) => ipcRenderer.invoke('run:stop', id),
    onData: (cb) => ipcRenderer.on('run:data', (_e, d) => cb(d)),
    onEnd: (cb) => ipcRenderer.on('run:end', (_e, d) => cb(d))
  },
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  copy: (text) => ipcRenderer.invoke('clipboard:write', text)
});
