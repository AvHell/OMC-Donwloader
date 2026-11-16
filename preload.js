const { contextBridge, ipcRenderer } = require('electron');

/**
 * API expuesta al renderer (ventanas principales y editor)
 * Todos los métodos son seguros y están aislados por contexto
 */
contextBridge.exposeInMainWorld('api', {
  downloadSession: {
    start: (sessionId) => ipcRenderer.invoke('download-session:start', sessionId),
    end: (sessionId) => ipcRenderer.invoke('download-session:end', sessionId),
  },

  // ===== CONFIGURACIÓN =====
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  },

  // ===== LOGGER =====
  log: {
    info: (msg) => ipcRenderer.invoke('log:info', msg),
    error: (msg) => ipcRenderer.invoke('log:error', msg),
  },

  // ===== YT-DLP (descargas y metadatos) =====
  ytdlp: {
    getMetadata: (url) => ipcRenderer.invoke('ytdlp:getMetadata', url),
    download: (item, outputFolder, onProgress, sessionId) => {
      const listener = (event, data) => {
        if (data.id === item.id && typeof onProgress === 'function') {
          onProgress(data.progress, data.status);
        }
      };
      ipcRenderer.on('download-progress', listener);
      return ipcRenderer.invoke('ytdlp:download', item, outputFolder, sessionId)
        .then((result) => result)
        .finally(() => ipcRenderer.removeListener('download-progress', listener));
    },
  },

  // ===== COLA (gestión de items) =====
  queue: {
    addItem: (item) => ipcRenderer.invoke('queue:addItem', item),
    getItem: (id) => ipcRenderer.invoke('queue:getItem', id),
    updateItem: (id, newData) => ipcRenderer.invoke('queue:updateItem', id, newData),
  },

  // ===== METADATOS (tags ID3) =====
  tags: {
    apply: (filePath, albumInfo, trackInfo, coverPath) => 
      ipcRenderer.invoke('tags:apply', filePath, albumInfo, trackInfo, coverPath),
  },

  // ===== NOTIFICACIONES =====
  notification: {
    show: (message, type) => ipcRenderer.invoke('notification:show', message, type),
  },

  // ===== DIÁLOGOS DEL SISTEMA =====
  dialog: {
    selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
    selectFile: () => ipcRenderer.invoke('dialog:selectFile'),
  },

  // ===== SHELL (abrir archivos/carpetas/navegador) =====
  shell: {
    openPath: (path) => ipcRenderer.invoke('shell:openPath', path),
  },

  // ===== EDITOR DE CAPÍTULOS =====
  editor: {
    open: (videoUrl) => ipcRenderer.invoke('editor:open', videoUrl),
  },

  // ===== UPDATER (yt-dlp) =====
  updater: {
    getStatus: () => ipcRenderer.invoke('updater:getStatus'),
    check: () => ipcRenderer.invoke('updater:check'),
    onProgress: (callback) => {
      ipcRenderer.on('updater-progress', (event, data) => {
        if (typeof callback === 'function') callback(data);
      });
    },
    onComplete: (callback) => {
      ipcRenderer.on('updater-complete', (event, data) => {
        if (typeof callback === 'function') callback(data);
      });
    },
    onError: (callback) => {
      ipcRenderer.on('updater-error', (event, data) => {
        if (typeof callback === 'function') callback(data);
      });
    },
  },

  appUpdater: {
    getStatus: () => ipcRenderer.invoke('app-updater:getStatus'),
    check: () => ipcRenderer.invoke('app-updater:check'),
    install: () => ipcRenderer.invoke('app-updater:install'),
    onStatus: (callback) => {
      ipcRenderer.on('app-updater:status', (event, status) => {
        if (typeof callback === 'function') callback(status);
      });
    },
  },

  // ===== NUEVO: Descargar audio temporal (para el editor) =====
  downloadAudio: (url) => ipcRenderer.invoke('downloadAudio', url),

  // ===== SUSCRIPCIÓN A EVENTOS (desde main) =====
  on: (channel, callback) => {
    const valid = [
      'download-progress',
      'editor:result',
      'editor:init',
      'ytdlp-update-progress',
      'ytdlp-update-status',
      'updater-progress',
      'updater-complete',
      'updater-error',
      'log-message', // <-- NUEVO: para logs en vivo
    ];
    if (valid.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },

  // ===== ENVÍO DE EVENTOS (hacia main) =====
  send: (channel, data) => {
    const valid = [
      'editor:save',
      'editor:cancel',
      'log-message', // <-- NUEVO: para enviar logs al main
    ];
    if (valid.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
});