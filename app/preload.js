'use strict';

// The only bridge between the renderer and Node. Everything the UI is allowed
// to do is enumerated here; the renderer gets no direct fs, child_process, or
// ipcRenderer access.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('redcell', {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
    pickDir: () => ipcRenderer.invoke('settings:pickDir')
  },
  catalog: {
    get: () => ipcRenderer.invoke('catalog:get')
  },
  engagements: {
    get: () => ipcRenderer.invoke('eng:get'),
    save: (state) => ipcRenderer.invoke('eng:save', state)
  },
  tool: {
    run: (payload) => ipcRenderer.invoke('tool:run', payload),
    stop: (runId) => ipcRenderer.invoke('tool:stop', runId),
    onData: (cb) => ipcRenderer.on('run:data', (_e, d) => cb(d)),
    onEnd: (cb) => ipcRenderer.on('run:end', (_e, d) => cb(d))
  },
  openExternal: (url) => ipcRenderer.invoke('open:external', url)
});
