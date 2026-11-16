const { app, BrowserWindow, ipcMain, dialog, shell, Notification } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const { autoUpdater } = require('electron-updater');

// Importar módulos
const ytdlp = require('./services/ytdlp');
const { applyMetadata } = require('./services/tags');
const logger = require('./services/logger');
const YtDlpUpdater = require('./services/updater');

// ============================================================
//  CONFIGURACIÓN DE LA APLICACIÓN
// ============================================================

let mainWindow = null;
let editorWindow = null;
let isQuitting = false;
let logForwardingConfigured = false;
let activeDownloadSession = null;
let appUpdateState = { state: 'not-configured', version: app.getVersion() };
let githubRelease = null;

// Evitar múltiples instancias
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  return;
}

// Instancia del actualizador
const updater = new YtDlpUpdater();

app.whenReady().then(() => {
  createMainWindow();
  configureApplicationUpdater();
  // Iniciar verificación de actualizaciones en segundo plano
  updater.run().catch(err => logger.error('Error en updater.run:', err));
});

// ============================================================
//  MANEJO DE CIERRE DE APLICACIÓN
// ============================================================

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

// ============================================================
//  VENTANA PRINCIPAL
// ============================================================

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: true,
    backgroundColor: '#0f1a16',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'main-window', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    activeDownloadSession = null;
    if (editorWindow) {
      editorWindow.close();
      editorWindow = null;
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('main-window-ready');
  });

  if (!logForwardingConfigured) {
    logForwardingConfigured = true;
    logger.setLogHandler(sendLogToRenderer);
  }
}

function sendLogToRenderer(level, message) {
  if (activeDownloadSession && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log-message', {
      timestamp: new Date().toISOString(),
      level,
      message: String(message),
      sessionId: activeDownloadSession.id,
    });
  }
}

function getGithubRepository() {
  const configured = process.env.GH_REPOSITORY || process.env.GITHUB_REPOSITORY;
  let value = configured;
  if (!value) {
    try {
      const packageInfo = require(path.join(app.getAppPath(), 'package.json'));
      value = typeof packageInfo.repository === 'string'
        ? packageInfo.repository
        : packageInfo.repository?.url || '';
    } catch (err) {
      logger.error(`No se pudo leer el repositorio de actualizaciones: ${err.message}`);
      return null;
    }
  }

  const match = String(value).match(/(?:github\.com[/:])?([^/:\s]+)\/([^/:\s]+?)(?:\.git)?$/i);
  return match ? { owner: match[1], repo: match[2] } : null;
}

function publishAppUpdateStatus(state, details = {}) {
  appUpdateState = { ...appUpdateState, state, ...details };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app-updater:status', appUpdateState);
  }
}

function configureApplicationUpdater() {
  if (!app.isPackaged) {
    publishAppUpdateStatus('development');
    return;
  }

  githubRelease = getGithubRepository();
  if (!githubRelease) {
    publishAppUpdateStatus('not-configured');
    logger.log('Actualizaciones de la aplicación pendientes: configura GH_REPOSITORY como propietario/repositorio.');
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.setFeedURL({ provider: 'github', ...githubRelease });

  autoUpdater.on('checking-for-update', () => publishAppUpdateStatus('checking'));
  autoUpdater.on('update-available', info => {
    publishAppUpdateStatus('available', { version: info.version });
    logger.log(`Nueva versión de OMC Downloader disponible: ${info.version}`);
  });
  autoUpdater.on('update-not-available', info => {
    publishAppUpdateStatus('up-to-date', { version: info.version || app.getVersion() });
  });
  autoUpdater.on('download-progress', progress => {
    publishAppUpdateStatus('downloading', {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
    });
  });
  autoUpdater.on('update-downloaded', info => {
    publishAppUpdateStatus('downloaded', { version: info.version });
    logger.log(`Actualización ${info.version} descargada; está lista para instalarse.`);
  });
  autoUpdater.on('error', error => {
    publishAppUpdateStatus('error', { message: error.message });
    logger.error(`Error del actualizador de OMC Downloader: ${error.message}`);
  });

  autoUpdater.checkForUpdates().catch(error => {
    publishAppUpdateStatus('error', { message: error.message });
    logger.error(`No se pudo comprobar actualizaciones de OMC Downloader: ${error.message}`);
  });
}

// ============================================================
//  VENTANA DEL EDITOR DE CAPÍTULOS
// ============================================================

function createEditorWindow(videoUrl) {
  if (editorWindow) {
    editorWindow.focus();
    editorWindow.webContents.send('editor:init', videoUrl);
    return;
  }

  editorWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    parent: mainWindow,
    modal: true,
    frame: true,
    backgroundColor: '#0f1a16',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  editorWindow.loadFile(path.join(__dirname, 'src', 'chapter-editor', 'index.html'));
  editorWindow.once('ready-to-show', () => {
    editorWindow.show();
    editorWindow.webContents.send('editor:init', videoUrl);
  });

  editorWindow.on('closed', () => {
    editorWindow = null;
  });
}

// ============================================================
//  MANEJADORES IPC
// ============================================================

ipcMain.handle('download-session:start', (event, sessionId) => {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) {
    throw new Error('Solo la ventana principal puede iniciar una sesión de descarga.');
  }
  if (activeDownloadSession) throw new Error('Ya hay una sesión de descarga activa.');
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    throw new Error('El identificador de sesión no es válido.');
  }
  activeDownloadSession = { id: sessionId, webContentsId: event.sender.id };
  return { success: true };
});

ipcMain.handle('download-session:end', (event, sessionId) => {
  if (!activeDownloadSession || activeDownloadSession.id !== sessionId ||
      activeDownloadSession.webContentsId !== event.sender.id) {
    throw new Error('La sesión de descarga no coincide con la sesión activa.');
  }
  activeDownloadSession = null;
  return { success: true };
});

// --- LOGS desde el renderer (para que la consola en vivo los capture) ---
ipcMain.on('log-message', (event, data) => {
  if (!activeDownloadSession || activeDownloadSession.webContentsId !== event.sender.id) return;
  // Reenviar el log a la ventana principal (para la consola en vivo)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log-message', {
      timestamp: new Date().toISOString(),
      level: data?.level || 'info',
      message: data?.message || '',
      sessionId: activeDownloadSession.id,
    });
  }
  // También registrar en la consola del proceso principal (para depuración)
  if (data?.level === 'error') {
    console.error(`[Renderer Error] ${data.message}`);
  } else {
    console.log(`[Renderer Log] ${data?.message || ''}`);
  }
});

// --- YT-DLP ---
ipcMain.handle('ytdlp:getMetadata', async (event, url) => {
  try {
    return await ytdlp.getMetadata(url);
  } catch (err) {
    logger.error(`Error en getMetadata: ${err.message}`);
    throw err;
  }
});

ipcMain.handle('ytdlp:download', async (event, item, outputFolder, sessionId) => {
  if (!sessionId) throw new Error('No se recibió el identificador de sesión de descarga.');
  if (!activeDownloadSession || activeDownloadSession.id !== sessionId ||
      activeDownloadSession.webContentsId !== event.sender.id) {
    throw new Error('La descarga no pertenece a la sesión activa.');
  }
  try {
    const result = await ytdlp.download(item, outputFolder, (progress, status) => {
      event.sender.send('download-progress', { id: item.id, progress, status, sessionId });
    });
    return result;
  } catch (err) {
    logger.error(`Error en download: ${err.message}`);
    throw err;
  }
});

// --- Descarga de audio temporal para el editor ---
ipcMain.handle('downloadAudio', async (event, url) => {
  try {
    const tempDir = path.join(app.getPath('temp'), 'omc_audio');
    await fs.ensureDir(tempDir);
    return await ytdlp.downloadAudioForEditor(url, tempDir, `audio_${Date.now()}`);
  } catch (err) {
    logger.error(`Error en downloadAudio: ${err.message}`);
    throw err;
  }
});

// --- EDITOR ---
ipcMain.handle('editor:open', async (event, videoUrl) => {
  createEditorWindow(videoUrl);
});

ipcMain.on('editor:save', (event, chapters) => {
  if (mainWindow) {
    mainWindow.webContents.send('editor:result', chapters);
  }
  if (editorWindow) editorWindow.close();
});

ipcMain.on('editor:cancel', () => {
  if (editorWindow) editorWindow.close();
});

// --- METADATOS ---
ipcMain.handle('tags:apply', async (event, filePath, albumInfo, trackInfo, coverPath) => {
  try {
    await applyMetadata(filePath, albumInfo, trackInfo, coverPath);
    return { success: true };
  } catch (err) {
    logger.error(`Error en tags:apply: ${err.message}`);
    throw err;
  }
});

// --- DIÁLOGOS ---
ipcMain.handle('dialog:selectFolder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('dialog:selectFile', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png'] }],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// --- SHELL ---
ipcMain.handle('shell:openPath', async (event, pathToOpen) => {
  try {
    await shell.openPath(pathToOpen);
  } catch (err) {
    logger.error(`Error al abrir ${pathToOpen}: ${err.message}`);
    throw err;
  }
});

// --- NOTIFICACIONES ---
ipcMain.handle('notification:show', (event, message, type = 'info') => {
  const notification = new Notification({
    title: type === 'error' ? 'Error' : 'OMC Downloader',
    body: message,
    silent: true,
  });
  notification.show();
});

// --- UPDATER ---
ipcMain.handle('updater:getStatus', async () => {
  try {
    return await updater.getStatus();
  } catch (err) {
    logger.error(`Error en updater:getStatus: ${err.message}`);
    return {
      currentVersion: 'desconocida',
      latestVersion: 'desconocida',
      isUpToDate: true,
      binaryPath: '',
    };
  }
});

ipcMain.handle('updater:check', async () => {
  return new Promise((resolve) => {
    updater.run((message, progress) => {
      if (mainWindow) {
        mainWindow.webContents.send('updater-progress', { message, progress });
      }
    }).then((updated) => {
      updater.getStatus().then(status => {
        if (mainWindow) {
          mainWindow.webContents.send('updater-complete', {
            success: updated,
            status,
          });
        }
        resolve({ success: updated, status });
      }).catch(err => {
        logger.error(`Error obteniendo estado después de update: ${err.message}`);
        resolve({ success: false, error: err.message });
      });
    }).catch(err => {
      logger.error(`Error en updater.check: ${err.message}`);
      if (mainWindow) {
        mainWindow.webContents.send('updater-error', { message: err.message });
      }
      resolve({ success: false, error: err.message });
    });
  });
});

ipcMain.handle('app-updater:getStatus', () => appUpdateState);

ipcMain.handle('app-updater:check', async () => {
  if (!app.isPackaged) {
    return { state: 'development', version: app.getVersion() };
  }
  if (!githubRelease) {
    return {
      state: 'not-configured',
      version: app.getVersion(),
      message: 'Configura GH_REPOSITORY (propietario/repositorio) al generar la publicación.',
    };
  }

  publishAppUpdateStatus('checking');
  try {
    await autoUpdater.checkForUpdates();
    return appUpdateState;
  } catch (error) {
    publishAppUpdateStatus('error', { message: error.message });
    throw error;
  }
});

ipcMain.handle('app-updater:install', () => {
  if (appUpdateState.state !== 'downloaded') {
    throw new Error('No hay una actualización descargada para instalar.');
  }
  autoUpdater.quitAndInstall();
  return { success: true };
});

// ============================================================
//  EXPORTAR (si es necesario)
// ============================================================

module.exports = { app };