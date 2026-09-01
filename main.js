const { app, BrowserWindow, ipcMain, dialog, shell, Notification } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const { spawn } = require('child_process');

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
  // Iniciar verificación de actualizaciones en segundo plano
  updater.run().catch(err => logger.error('Error en updater.run:', err));
});

// ============================================================
//  MANEJO DE CIERRE DE APLICACIÓN
// ============================================================

// Cuando todas las ventanas se cierran, salir (excepto en macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// En macOS, recrear la ventana al hacer clic en el dock
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

// ============================================================
//  VENTANA PRINCIPAL (CIERRE REAL)
// ============================================================

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 1100,
    minWidth: 800,
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

  // Cargar el HTML de la ventana principal
  mainWindow.loadFile(path.join(__dirname, 'src', 'main-window', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // --- ELIMINADO: Evento 'close' que prevenía el cierre ---
  // Ahora al hacer clic en la "X", la ventana se cierra realmente.
  // Si el editor está abierto, se cierra también (ver abajo).

  // Cuando la ventana principal se cierra, limpiar referencia
  mainWindow.on('closed', () => {
    mainWindow = null;
    // Si el editor sigue abierto, cerrarlo también
    if (editorWindow) {
      editorWindow.close();
      editorWindow = null;
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('main-window-ready');
  });
}

// ============================================================
//  VENTANA DEL EDITOR DE CAPÍTULOS
// ============================================================

function createEditorWindow(videoUrl) {
  // Si el editor ya está abierto, enfocarlo y enviar la URL
  if (editorWindow) {
    editorWindow.focus();
    editorWindow.webContents.send('editor:init', videoUrl);
    return;
  }

  editorWindow = new BrowserWindow({
    width: 1400,
    height: 1100,
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

  // Cargar el HTML del editor
  editorWindow.loadFile(path.join(__dirname, 'src', 'chapter-editor', 'index.html'));
  editorWindow.once('ready-to-show', () => {
    editorWindow.show();
    editorWindow.webContents.send('editor:init', videoUrl);
  });

  editorWindow.on('closed', () => {
    editorWindow = null;
  });

  // Si la ventana principal se cierra, el editor también se cierra (ver mainWindow.on('closed'))
}

// ============================================================
//  MANEJADORES IPC
// ============================================================

// --- YT-DLP ---
ipcMain.handle('ytdlp:getMetadata', async (event, url) => {
  try {
    return await ytdlp.getMetadata(url);
  } catch (err) {
    logger.error(`Error en getMetadata: ${err.message}`);
    throw err;
  }
});

ipcMain.handle('ytdlp:download', async (event, item, outputFolder) => {
  try {
    const result = await ytdlp.download(item, outputFolder, (progress, status) => {
      event.sender.send('download-progress', { id: item.id, progress, status });
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
    fs.ensureDirSync(tempDir);
    const output = path.join(tempDir, `audio_${Date.now()}.mp3`);

    const { ytPath } = ytdlp.getBinaryPaths();
    if (!ytPath) throw new Error('No se encontró yt-dlp');

    const args = [
      '-x',
      '--audio-format=mp3',
      '--audio-quality=320k',
      '--no-check-certificate',
      '--no-playlist',
      '-o', output,
      url
    ];

    return new Promise((resolve, reject) => {
      const proc = spawn(ytPath, args, {
        env: { PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
      });
      let stderr = '';
      proc.stderr.on('data', (data) => { stderr += data.toString(); });
      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(output)) {
          resolve(output);
        } else {
          reject(new Error(`yt-dlp falló (código ${code}): ${stderr}`));
        }
      });
      proc.on('error', (err) => reject(err));
    });
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
  if (editorWindow) {
    editorWindow.close();
    editorWindow = null;
  }
});

ipcMain.on('editor:cancel', () => {
  if (editorWindow) {
    editorWindow.close();
    editorWindow = null;
  }
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
    filters: [{ name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
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

// ============================================================
//  EXPORTAR (si es necesario)
// ============================================================

module.exports = { app };