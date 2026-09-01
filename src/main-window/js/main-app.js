/**
 * main-app.js
 * ORQUESTADOR PRINCIPAL - Inicializa todos los módulos y eventos globales.
 */

document.addEventListener('DOMContentLoaded', function() {

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
    modalOverlay: document.getElementById('modal-overlay'),
    modalContent: document.getElementById('modal-content'),
    versionText: document.getElementById('version-text'),
    btnUpdateYtdlp: document.getElementById('btn-update-ytdlp'),
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
  // 5. UPDATER (yt-dlp)
  // ============================================================
  function updateVersionDisplay(status) {
    if (!dom.versionText) return;
    const icon = status.isUpToDate ? '✅' : '🔄';
    dom.versionText.textContent = `${status.currentVersion} ${icon}`;
    dom.versionText.style.color = status.isUpToDate ? 'var(--color-success)' : 'var(--color-accent)';
    dom.versionText.title = status.isUpToDate 
      ? `Última versión: ${status.latestVersion}`
      : `Nueva versión disponible: ${status.latestVersion}`;
  }

  async function checkUpdaterStatus() {
    try {
      const status = await api.updater.getStatus();
      updateVersionDisplay(status);
      if (!status.isUpToDate) {
        Toast.show(`Nueva versión de yt-dlp disponible: ${status.latestVersion}`, 'info');
      }
    } catch (err) {
      console.error('❌ Error obteniendo estado del updater:', err);
      if (dom.versionText) {
        dom.versionText.textContent = 'Error';
        dom.versionText.style.color = 'var(--color-error)';
      }
    }
  }

  api.updater.onProgress((data) => {
    Toast.show(`Actualizando yt-dlp: ${data.message}`, 'info');
    if (dom.versionText) {
      dom.versionText.textContent = `${data.progress}%`;
      dom.versionText.style.color = 'var(--color-accent)';
    }
    if (dom.btnUpdateYtdlp) {
      dom.btnUpdateYtdlp.disabled = true;
      dom.btnUpdateYtdlp.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualizando...';
    }
  });

  api.updater.onComplete((data) => {
    if (data.success) {
      Toast.show(`✅ yt-dlp actualizado a ${data.status.currentVersion}`, 'success');
    } else {
      Toast.show(`ℹ️ yt-dlp ya está actualizado (${data.status.currentVersion})`, 'info');
    }
    updateVersionDisplay(data.status);
    if (dom.btnUpdateYtdlp) {
      dom.btnUpdateYtdlp.disabled = false;
      dom.btnUpdateYtdlp.innerHTML = '<i class="fas fa-sync-alt"></i> Actualizar';
    }
  });

  api.updater.onError((data) => {
    Toast.error('Error', `Error al actualizar yt-dlp: ${data.message}`);
    if (dom.versionText) {
      dom.versionText.textContent = 'Error';
      dom.versionText.style.color = 'var(--color-error)';
    }
    if (dom.btnUpdateYtdlp) {
      dom.btnUpdateYtdlp.disabled = false;
      dom.btnUpdateYtdlp.innerHTML = '<i class="fas fa-sync-alt"></i> Actualizar';
    }
  });

  if (dom.btnUpdateYtdlp) {
    dom.btnUpdateYtdlp.addEventListener('click', async () => {
      const confirm = await Toast.confirm(
        'Actualizar yt-dlp',
        '¿Quieres verificar si hay una nueva versión de yt-dlp?',
        'Verificar', 'Cancelar'
      );
      if (confirm.isConfirmed) {
        dom.btnUpdateYtdlp.disabled = true;
        dom.btnUpdateYtdlp.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
        try {
          await api.updater.check();
        } catch (err) {
          Toast.error('Error', err.message || 'Error al verificar actualización');
          dom.btnUpdateYtdlp.disabled = false;
          dom.btnUpdateYtdlp.innerHTML = '<i class="fas fa-sync-alt"></i> Actualizar';
        }
      }
    });
  }

  // ============================================================
  // 6. EVENTO: INICIAR DESCARGAS (botón en header)
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

      window.showLoading(true, 'Preparando descargas...');

      for (const item of pending) {
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
          });
          if (result?.finalPath) {
            item.finalPath = result.finalPath;
          }
          item.isDownloading = false;
          item.isCompleted = true;
          item.status = 'Completado ✔';
          QueueManager.render();
          Toast.show(`${item.title} completado.`, 'success');
        } catch (err) {
          item.isDownloading = false;
          item.status = 'Error ❌';
          QueueManager.render();
          Toast.error('Error', `Error en "${item.title}": ${err.message}`);
        }
      }
      window.showLoading(false);
      Toast.show('¡Cola finalizada!', 'success');
    });
  }

  // ============================================================
  // 7. SUSCRIPCIÓN A EVENTOS DE PROGRESO
  // ============================================================
  api.on('download-progress', (progress, status) => {
    QueueManager.updateItemProgress(progress.id, progress.progress, status);
  });

  // ============================================================
  // 8. VERIFICAR ESTADO DEL UPDATER
  // ============================================================
  checkUpdaterStatus().catch(err => console.error('Error al verificar updater:', err));

  console.log('✅ OMC Downloader listo');
});