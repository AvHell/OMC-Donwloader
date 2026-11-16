/**
 * main-app.js
 * ORQUESTADOR PRINCIPAL - Inicializa todos los módulos y eventos globales.
 * Incluye manejo de barra lateral, panel de consola y captura de logs.
 */

// ===== CAPTURA DE LOGS PARA LA CONSOLA EN VIVO (EJECUCIÓN TEMPRANA) =====
// Sobrescribir console para enviar logs al panel de consola
if (typeof window !== 'undefined' && window.api) {
  (function setupConsoleCapture() {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalInfo = console.info;
    const originalDebug = console.debug;

    console.log = function(...args) {
      const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      originalLog.apply(console, args);
      if (window.api && window.api.send) {
        window.api.send('log-message', {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: message
        });
      }
    };

    console.error = function(...args) {
      const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      originalError.apply(console, args);
      if (window.api && window.api.send) {
        window.api.send('log-message', {
          timestamp: new Date().toISOString(),
          level: 'error',
          message: message
        });
      }
    };

    console.warn = function(...args) {
      const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      originalWarn.apply(console, args);
      if (window.api && window.api.send) {
        window.api.send('log-message', {
          timestamp: new Date().toISOString(),
          level: 'warning',
          message: message
        });
      }
    };

    console.info = function(...args) {
      const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      originalInfo.apply(console, args);
      if (window.api && window.api.send) {
        window.api.send('log-message', {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: message
        });
      }
    };

    console.debug = function(...args) {
      const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      originalDebug.apply(console, args);
      if (window.api && window.api.send) {
        window.api.send('log-message', {
          timestamp: new Date().toISOString(),
          level: 'debug',
          message: message
        });
      }
    };
  })();
}

document.addEventListener('DOMContentLoaded', function() {
  let activeConsoleSessionId = null;

  // ============================================================
  // 1. VERIFICAR API
  // ============================================================
  if (!window.api) {
    console.error('❌ API no disponible');
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        icon: 'error',
        title: 'Error crítico',
        text: 'No se pudo conectar con el backend. Reinicia la aplicación.',
      });
    }
    return;
  }
  const api = window.api;
  console.log('✅ API disponible');

  // ============================================================
  // 2. REFERENCIAS DOM
  // ============================================================
  const dom = {
    queueList: document.getElementById('queue-list'),
    btnNewLink: document.getElementById('btn-new-link'),
    btnStart: document.getElementById('btn-start'),
    btnUpdateYtdlp: document.getElementById('btn-update-ytdlp'),
    btnUpdateApp: document.getElementById('btn-update-app'),
    appUpdateStatus: document.getElementById('app-update-status'),
    btnToggleConsole: document.getElementById('btn-toggle-console'),
    btnCloseConsole: document.getElementById('btn-close-console'),
    btnClearConsole: document.getElementById('btn-clear-console'),
    consolePanel: document.getElementById('console-panel'),
    consoleOutput: document.getElementById('console-output'),
    consoleSessionLogoFallback: document.getElementById('console-session-logo-fallback'),
    consoleSessionArt: document.getElementById('console-session-art'),
    consoleSessionTitle: document.getElementById('console-session-title'),
    consoleSessionId: document.getElementById('console-session-id'),
    consoleLogCount: document.getElementById('console-log-count'),
    modalOverlay: document.getElementById('modal-overlay'),
    modalContent: document.getElementById('modal-content'),
    loadingOverlay: document.getElementById('loading-overlay'),
    loaderProgressBar: document.getElementById('loader-progress-bar'),
    loaderPercent: document.getElementById('loader-percent'),
    loaderText: document.getElementById('loader-text'),
    queueCount: document.getElementById('queue-count'),
  };

  for (const [key, el] of Object.entries(dom)) {
    if (!el) console.warn(`⚠️ Elemento DOM no encontrado: #${key}`);
  }

  // ============================================================
  // 3. INICIALIZAR MÓDULOS
  // ============================================================
  if (dom.queueList) {
    QueueManager.init(api, dom);
  } else {
    console.error('❌ No se puede inicializar QueueManager: falta #queue-list');
  }

  if (dom.modalOverlay && dom.modalContent) {
    ModalManager.init(api, dom);
  } else {
    console.error('❌ No se puede inicializar ModalManager: falta modal');
  }

  EditorManager.init(api);

  // ============================================================
  // 4. FUNCIONES DE OVERLAY (exponer globalmente)
  // ============================================================
  window.showLoading = function(show, text = 'Cargando...', progress = 0) {
    if (show) {
      dom.loadingOverlay.classList.add('visible');
      dom.loaderText.textContent = text;
      dom.loaderProgressBar.style.width = Math.min(100, progress) + '%';
      dom.loaderPercent.textContent = Math.round(progress) + '%';
    } else {
      dom.loadingOverlay.classList.remove('visible');
    }
  };

  window.updateLoadingProgress = function(progress, text) {
    const clamped = Math.min(100, Math.max(0, progress));
    dom.loaderProgressBar.style.width = clamped + '%';
    dom.loaderPercent.textContent = Math.round(clamped) + '%';
    if (text) dom.loaderText.textContent = text;
  };

  // ============================================================
  // 5. UPDATER (yt-dlp) - Estado y actualizaciones
  // ============================================================
  async function checkUpdaterStatus() {
    try {
      const status = await api.updater.getStatus();
      if (!status.isUpToDate) {
        Toast.show(`Nueva versión de yt-dlp disponible: ${status.latestVersion}`, 'info');
      }
    } catch (err) {
      console.error('❌ Error obteniendo estado del updater:', err);
    }
  }

  const updaterIcon = '<svg class="updater-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2"/></svg>';
  const updaterSpinner = '<svg class="updater-icon updater-icon-spin" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v6h-6"/></svg>';
  const appDownloadIcon = '<svg class="updater-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5"/><path d="M4 17v3h16v-3"/></svg>';
  const appInstallIcon = '<svg class="updater-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5"/><path d="M4 17v3h16v-3"/></svg>';

  function renderAppUpdateStatus(status) {
    const labels = {
      development: 'Actualizador disponible al publicar la app',
      'not-configured': 'Configura GH_REPOSITORY para publicar actualizaciones',
      checking: 'Buscando actualizaciones...',
      available: 'Nueva versión disponible; descargando...',
      downloading: `Descargando actualización: ${status.percent || 0}%`,
      downloaded: 'Actualización lista para instalar',
      'up-to-date': 'Aplicación actualizada',
      error: `Error de actualización: ${status.message || 'desconocido'}`,
    };
    if (dom.appUpdateStatus) {
      dom.appUpdateStatus.textContent = labels[status.state] || 'Estado de actualización desconocido';
    }
    if (dom.btnUpdateApp) {
      const isBusy = status.state === 'checking' || status.state === 'downloading';
      dom.btnUpdateApp.disabled = isBusy;
      dom.btnUpdateApp.innerHTML = status.state === 'downloaded'
        ? `${appInstallIcon} Reiniciar e instalar`
        : isBusy
          ? `${updaterSpinner} Actualizando...`
          : `${appDownloadIcon} Buscar actualización`;
    }
  }

  api.appUpdater.onStatus(renderAppUpdateStatus);
  api.appUpdater.getStatus().then(renderAppUpdateStatus).catch(err => {
    console.error('Error consultando actualizaciones de la aplicación:', err);
  });

  if (dom.btnUpdateApp) {
    dom.btnUpdateApp.addEventListener('click', async () => {
      try {
        const status = await api.appUpdater.getStatus();
        if (status.state === 'downloaded') {
          const confirmation = await Toast.confirm(
            'Instalar actualización',
            'La actualización ya está lista. La aplicación se reiniciará.',
            'Reiniciar', 'Más tarde'
          );
          if (confirmation.isConfirmed) await api.appUpdater.install();
          return;
        }

        renderAppUpdateStatus({ state: 'checking' });
        const result = await api.appUpdater.check();
        renderAppUpdateStatus(result);
        if (result.state === 'not-configured' || result.state === 'development') {
          Toast.show(result.message || 'Las actualizaciones estarán disponibles al publicar la aplicación en GitHub.', 'info');
        } else if (result.state === 'up-to-date') {
          Toast.show('Ya tienes la versión más reciente.', 'success');
        }
      } catch (err) {
        renderAppUpdateStatus({ state: 'error', message: err.message });
        Toast.error('Error de actualización', err.message);
      }
    });
  }

  // Escuchar eventos del updater
  api.updater.onProgress((data) => {
    Toast.show(`Actualizando yt-dlp: ${data.message}`, 'info');
    if (dom.btnUpdateYtdlp) {
      dom.btnUpdateYtdlp.disabled = true;
      dom.btnUpdateYtdlp.innerHTML = `${updaterSpinner}<span>Actualizando...</span>`;
    }
  });

  api.updater.onComplete((data) => {
    if (data.success) {
      Toast.show(`✅ yt-dlp actualizado a ${data.status.currentVersion}`, 'success');
    } else {
      Toast.show(`ℹ️ yt-dlp ya está actualizado (${data.status.currentVersion})`, 'info');
    }
    if (dom.btnUpdateYtdlp) {
      dom.btnUpdateYtdlp.disabled = false;
      dom.btnUpdateYtdlp.innerHTML = `${updaterIcon}<span>Actualizar</span>`;
    }
  });

  api.updater.onError((data) => {
    Toast.error('Error', `Error al actualizar yt-dlp: ${data.message}`);
    if (dom.btnUpdateYtdlp) {
      dom.btnUpdateYtdlp.disabled = false;
      dom.btnUpdateYtdlp.innerHTML = `${updaterIcon}<span>Actualizar</span>`;
    }
  });

  // Botón actualizar en la barra lateral
  if (dom.btnUpdateYtdlp) {
    dom.btnUpdateYtdlp.addEventListener('click', async () => {
      const confirm = await Toast.confirm(
        'Actualizar yt-dlp',
        '¿Quieres verificar si hay una nueva versión de yt-dlp?',
        'Verificar', 'Cancelar'
      );
      if (confirm.isConfirmed) {
        dom.btnUpdateYtdlp.disabled = true;
        dom.btnUpdateYtdlp.innerHTML = `${updaterSpinner}<span>Verificando...</span>`;
        try {
          await api.updater.check();
        } catch (err) {
          Toast.error('Error', err.message || 'Error al verificar actualización');
          dom.btnUpdateYtdlp.disabled = false;
          dom.btnUpdateYtdlp.innerHTML = `${updaterIcon}<span>Actualizar</span>`;
        }
      }
    });
  }

  // ============================================================
  // 6. EVENTO: INICIAR DESCARGAS (desde barra lateral)
  // ============================================================
  if (dom.btnStart) {
    dom.btnStart.addEventListener('click', async () => {
      const queue = QueueManager.getQueue();
      const pending = queue.filter(item => !item.isCompleted && !item.isDownloading);
      if (pending.length === 0) {
        Toast.show('No hay descargas pendientes.', 'warning');
        return;
      }

      const folder = await api.dialog.selectFolder();
      if (!folder) {
        Toast.show('No se seleccionó carpeta.', 'info');
        return;
      }

      const confirm = await Toast.confirm(
        'Iniciar descargas',
        `Se descargarán ${pending.length} elemento(s) en la carpeta seleccionada.`,
        'Iniciar', 'Cancelar'
      );
      if (!confirm.isConfirmed) return;

      dom.consoleOutput.replaceChildren();
      if (dom.consoleLogCount) dom.consoleLogCount.textContent = '0 eventos';
      activeConsoleSessionId = OMC.utils.generateId();
      if (dom.consoleSessionId) dom.consoleSessionId.textContent = `Sesión #${activeConsoleSessionId.slice(-6)}`;
      if (dom.consoleSessionTitle) dom.consoleSessionTitle.textContent = `${pending.length} descarga(s) en esta sesión`;
      if (dom.consoleSessionArt) {
        dom.consoleSessionArt.hidden = true;
        dom.consoleSessionArt.removeAttribute('src');
        dom.consoleSessionArt.onerror = null;
      }
      if (dom.consoleSessionLogoFallback) dom.consoleSessionLogoFallback.hidden = false;
      dom.btnStart.disabled = true;
      let sessionStarted = false;
      let completedCount = 0;
      try {
        await api.downloadSession.start(activeConsoleSessionId);
        sessionStarted = true;
        console.log(`Iniciando sesión de descarga con ${pending.length} elemento(s).`);
        window.showLoading(true, 'Preparando descargas...');

        for (const item of pending) {
          if (dom.consoleSessionArt && dom.consoleSessionLogoFallback) {
            dom.consoleSessionArt.hidden = true;
            dom.consoleSessionArt.removeAttribute('src');
            dom.consoleSessionArt.onerror = null;
            dom.consoleSessionLogoFallback.hidden = false;
          }
          const thumbnail = item.thumbnailUrl;
          if (dom.consoleSessionArt && dom.consoleSessionLogoFallback && thumbnail) {
            try {
              const thumbnailUrl = new URL(thumbnail);
              if (thumbnailUrl.protocol === 'https:' || thumbnailUrl.protocol === 'http:') {
                dom.consoleSessionArt.src = thumbnailUrl.href;
                dom.consoleSessionArt.hidden = false;
                dom.consoleSessionLogoFallback.hidden = true;
                dom.consoleSessionArt.onerror = () => {
                  dom.consoleSessionArt.hidden = true;
                  dom.consoleSessionLogoFallback.hidden = false;
                };
              }
            } catch (err) {
              console.warn(`No se pudo cargar la imagen de sesión: ${err.message}`);
            }
          }
          if (dom.consoleSessionTitle) {
            dom.consoleSessionTitle.textContent = `Descarga ${completedCount + 1}/${pending.length}: ${item.title || 'Sin título'}`;
          }
          item.isDownloading = true;
          item.status = 'Descargando...';
          QueueManager.render();
          try {
            const result = await api.ytdlp.download(item, folder, (progress, status) => {
              item.progress = progress;
              item.status = status;
              QueueManager.render();
              if (typeof window.updateLoadingProgress === 'function') {
                window.updateLoadingProgress(progress, `Descargando: ${item.title}`);
              }
            }, activeConsoleSessionId);
            if (result?.finalPath) {
              item.finalPath = result.finalPath;
            }
            item.isDownloading = false;
            item.isCompleted = true;
            item.status = 'Completado ✔';
            completedCount++;
            QueueManager.render();
            Toast.show(`${item.title} completado.`, 'success');
          } catch (err) {
            item.isDownloading = false;
            item.status = 'Error ❌';
            completedCount++;
            QueueManager.render();
            Toast.error('Error', `Error en "${item.title}": ${err.message}`);
            console.error(`Error descargando "${item.title}": ${err.message}`);
          }
        }
        console.log(`Sesión finalizada: ${completedCount}/${pending.length} elementos procesados.`);
        Toast.show('¡Cola finalizada!', 'success');
      } catch (err) {
        console.error(`La sesión de descarga terminó con un error: ${err.message}`);
        Toast.error('Error de sesión', err.message);
      } finally {
        window.showLoading(false);
        if (dom.consoleSessionTitle) {
          dom.consoleSessionTitle.textContent = `Sesión finalizada: ${completedCount}/${pending.length} elementos procesados`;
        }
        if (sessionStarted) {
          try {
            await api.downloadSession.end(activeConsoleSessionId);
          } catch (err) {
            console.error(`No se pudo cerrar la sesión de descarga: ${err.message}`);
          }
        }
        activeConsoleSessionId = null;
        dom.btnStart.disabled = !QueueManager.getQueue().some(item => !item.isCompleted && !item.isDownloading);
      }
    });
  }

  // ============================================================
  // 7. EVENTO: NUEVO ENLACE (desde barra lateral)
  // ============================================================
  if (dom.btnNewLink) {
    dom.btnNewLink.addEventListener('click', () => {
      ModalManager.openAdd();
    });
  }

  // ============================================================
  // 8. PANEL DE CONSOLA
  // ============================================================
  let consoleOpen = false;

  function toggleConsole() {
    consoleOpen = !consoleOpen;
    dom.consolePanel.classList.toggle('open', consoleOpen);
    dom.btnToggleConsole.classList.toggle('active', consoleOpen);
    if (consoleOpen) {
      dom.btnToggleConsole.innerHTML = '<svg class="sidebar-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m4 6 6 6-6 6m8 0h8"/></svg><span>Consola</span>';
    } else {
      dom.btnToggleConsole.innerHTML = '<svg class="sidebar-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m4 6 6 6-6 6m8 0h8"/></svg><span>Consola</span>';
    }
  }

  if (dom.btnToggleConsole) {
    dom.btnToggleConsole.addEventListener('click', toggleConsole);
  }
  if (dom.btnCloseConsole) {
    dom.btnCloseConsole.addEventListener('click', toggleConsole);
  }

  // Limpiar consola
  if (dom.btnClearConsole) {
    dom.btnClearConsole.addEventListener('click', () => {
      dom.consoleOutput.replaceChildren();
      if (dom.consoleLogCount) dom.consoleLogCount.textContent = '0 eventos';
    });
  }

  // ===== RECIBIR LOGS DEL PROCESO PRINCIPAL =====
  api.on('log-message', (logData) => {
    if (!activeConsoleSessionId || logData.sessionId !== activeConsoleSessionId) return;
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    const time = new Date(logData.timestamp).toLocaleTimeString();
    const allowedLevels = new Set(['info', 'success', 'warning', 'error', 'debug']);
    const level = allowedLevels.has(logData.level) ? logData.level : 'info';
    const message = logData.message || '';
    const timeLabel = document.createElement('span');
    timeLabel.className = 'log-time';
    timeLabel.textContent = `[${time}]`;
    const levelLabel = document.createElement('span');
    levelLabel.className = `log-level ${level}`;
    levelLabel.textContent = level.toUpperCase();
    const messageLabel = document.createElement('span');
    messageLabel.className = 'log-message';
    messageLabel.textContent = message;
    entry.append(timeLabel, levelLabel, messageLabel);
    dom.consoleOutput.appendChild(entry);
    dom.consoleOutput.scrollTop = dom.consoleOutput.scrollHeight;
    if (dom.consoleLogCount) {
      dom.consoleLogCount.textContent = `${dom.consoleOutput.children.length} eventos`;
    }
    while (dom.consoleOutput.children.length > 300) {
      dom.consoleOutput.removeChild(dom.consoleOutput.firstChild);
    }
  });

  // ============================================================
  // 9. SUSCRIPCIÓN A EVENTOS DE PROGRESO
  // ============================================================
  api.on('download-progress', (progress, status) => {
    QueueManager.updateItemProgress(progress.id, progress.progress, status);
  });

  // ============================================================
  // 10. VERIFICAR ESTADO DEL UPDATER
  // ============================================================
  checkUpdaterStatus().catch(err => console.error('Error al verificar updater:', err));

  console.log('✅ OMC Downloader listo');
});