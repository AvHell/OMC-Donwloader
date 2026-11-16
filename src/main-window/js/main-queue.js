/**
 * main-queue.js
 * Gestión de la cola de descargas y renderizado de la UI
 * 
 * MODIFICACIONES:
 * - Botón "Limpiar cola" en el header (se enlaza con btn-clear-queue)
 * - El botón se deshabilita si la cola está vacía y se habilita al agregar items
 * - Corregida la apertura de carpeta: extrae el directorio sin require('path')
 */

const QueueManager = (() => {
  let queue = [];
  let api = null;
  let elements = {};

  function escapeMarkup(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[character]);
  }

  function getThumbnailUrl(value) {
    try {
      const url = new URL(value);
      if (['http:', 'https:'].includes(url.protocol)) return url.href;
    } catch (err) {
      return 'https://img.youtube.com/vi/default.jpg';
    }
    return 'https://img.youtube.com/vi/default.jpg';
  }

  function init(apiRef, domElements) {
    api = apiRef;
    elements = domElements;
    if (!elements.queueList) {
      console.warn('⚠️ queueList no encontrado, el renderizado no funcionará');
    }
    render();

    // Enlazar botón de limpiar cola (si existe en el DOM)
    const clearBtn = document.getElementById('btn-clear-queue');
    if (clearBtn) {
      clearBtn.addEventListener('click', clearQueue);
      // Inicialmente deshabilitado
      clearBtn.disabled = true;
    }
  }

  function getQueue() {
    return queue;
  }

  // ---------- LIMPIAR COLA ----------
  function clearQueue() {
    if (queue.length === 0) return;
    // No permitir limpiar si hay descargas en curso
    if (queue.some(item => item.isDownloading)) {
      Toast.warning('No se puede limpiar', 'Hay descargas en curso.');
      return;
    }
    Toast.confirm(
      '¿Limpiar toda la cola?',
      'Se eliminarán todos los elementos pendientes y completados.',
      'Limpiar', 'Cancelar'
    ).then(result => {
      if (result.isConfirmed) {
        queue = [];
        render();
        if (elements.btnStart) elements.btnStart.disabled = true;
        // Deshabilitar botón de limpiar
        const clearBtn = document.getElementById('btn-clear-queue');
        if (clearBtn) clearBtn.disabled = true;
        Toast.show('🧹 Cola limpiada.', 'info');
        if (typeof window.sendLog === 'function') {
          window.sendLog('info', '🧹 Cola limpiada completamente.');
        }
      }
    });
  }

  // ---------- AÑADIR ITEM ----------
  function addItem(itemData) {
    const exists = queue.some(q => q.url === itemData.url && !q.isCompleted);
    if (exists) {
      Toast.error('Enlace duplicado', 'Este enlace ya está en la cola y no ha sido completado.');
      if (typeof window.sendLog === 'function') {
        window.sendLog('warning', `⚠️ Enlace duplicado: ${itemData.url}`);
      }
      return false;
    }

    if (itemData.chapters && Array.isArray(itemData.chapters)) {
      itemData.chapters = itemData.chapters.map(c => ({
        ...c,
        isSelected: c.isSelected !== undefined ? c.isSelected : true,
      }));
    }

    const newItem = {
      id: OMC.utils.generateId(),
      ...itemData,
      progress: 0,
      status: 'En cola',
      isDownloading: false,
      isCompleted: false,
      finalPath: '',
    };

    console.log('📦 Nuevo item agregado a la cola:', {
      id: newItem.id,
      title: newItem.title,
      chapters: newItem.chapters?.length || 0,
      splitChapters: newItem.splitChapters,
    });
    if (typeof window.sendLog === 'function') {
      window.sendLog('success', `📦 Nuevo item agregado: ${newItem.title || 'Sin título'}`);
    }

    queue.push(newItem);
    render();
    // Habilitar botones de inicio y limpiar
    if (elements.btnStart) elements.btnStart.disabled = false;
    const clearBtn = document.getElementById('btn-clear-queue');
    if (clearBtn) clearBtn.disabled = false;
    Toast.success('¡Agregado!', 'El enlace se ha añadido a la cola.');
    return true;
  }

  // ---------- ELIMINAR ITEM ----------
  function deleteItem(id) {
    const item = queue.find(q => q.id === id);
    if (!item) return;
    Toast.confirm(
      '¿Eliminar elemento?',
      `¿Estás seguro de eliminar "${item.title || 'este elemento'}" de la cola?`,
      'Eliminar', 'Cancelar'
    ).then(result => {
      if (result.isConfirmed) {
        const index = queue.findIndex(q => q.id === id);
        if (index !== -1) {
          queue.splice(index, 1);
          render();
          if (queue.length === 0) {
            if (elements.btnStart) elements.btnStart.disabled = true;
            const clearBtn = document.getElementById('btn-clear-queue');
            if (clearBtn) clearBtn.disabled = true;
          }
          Toast.show('Elemento removido.', 'success');
          if (typeof window.sendLog === 'function') {
            window.sendLog('info', `🗑️ Elemento eliminado: ${item.title || 'Sin título'}`);
          }
        }
      }
    });
  }

  // ---------- ACTUALIZAR ITEM ----------
  function updateItem(id, newData) {
    const index = queue.findIndex(q => q.id === id);
    if (index === -1) return false;
    queue[index] = { ...queue[index], ...newData };
    render();
    if (typeof window.sendLog === 'function') {
      window.sendLog('info', `📝 Item actualizado: ${queue[index].title || 'Sin título'}`);
    }
    return true;
  }

  // ---------- RENDER ----------
  function render() {
    if (!elements.queueList) {
      console.warn('⚠️ No se puede renderizar: queueList no encontrado');
      return;
    }

    const { queueList } = elements;
    if (queue.length === 0) {
      queueList.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-cloud-download-alt"></i>
          <p>No hay elementos</p>
          <span>Haz clic en "Nuevo" para comenzar</span>
        </div>
      `;
      updateProgress(0);
      if (elements.queueCount) elements.queueCount.textContent = '0 elementos';
      return;
    }

    let html = '';
    queue.forEach(item => {
      const statusColor = item.isCompleted ? 'var(--color-success)' :
                          (item.isDownloading ? '#FF9800' : 'rgba(255,255,255,0.5)');
      const progress = item.progress || 0;
      const statusIcon = item.isCompleted ? 'fa-check-circle' :
                         (item.isDownloading ? 'fa-spinner fa-spin' : 'fa-clock');
      const chaptersCount = item.chapters?.filter(c => c.isSelected).length || 0;
      const playlistCount = item.entries?.length || 0;
      const thumbnailUrl = escapeMarkup(getThumbnailUrl(item.thumbnailUrl));
      const itemId = escapeMarkup(item.id);
      html += `
        <div class="queue-item" data-id="${itemId}">
          <div class="thumbnail" style="background-image: url(&quot;${thumbnailUrl}&quot;);">
            ${item.isCompleted ? '<div class="completed-badge"><i class="fas fa-check"></i></div>' : ''}
          </div>
          <div class="item-info">
            <div class="item-title">${escapeMarkup(item.title || 'Sin título')}</div>
            <div class="item-artist"><i class="fas fa-user"></i> ${escapeMarkup(item.artist || 'Desconocido')}</div>
            <div class="item-meta">
              <span class="meta-tag duration"><i class="far fa-clock"></i> ${escapeMarkup(item.duration || '--:--')}</span>
              <span class="meta-tag format"><i class="fas fa-music"></i> MP3 · 320 kbps</span>
              ${item.isPlaylist && playlistCount ? `<span class="meta-tag chapters"><i class="fas fa-list"></i> ${playlistCount} pistas</span>` : ''}
              ${chaptersCount > 0 ? `<span class="meta-tag chapters"><i class="fas fa-list"></i> ${chaptersCount} pistas</span>` : ''}
            </div>
          </div>
          <div class="item-progress">
            <div class="progress-status" style="color:${statusColor}">
              <i class="fas ${statusIcon}"></i> ${escapeMarkup(item.status || 'En cola')}
            </div>
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" style="width:${Math.min(100, Math.max(0, Number(progress) || 0))}%;"></div>
            </div>
            <div class="progress-extra">${escapeMarkup(item.speed || '')} ${item.eta ? `ETA ${escapeMarkup(item.eta)}` : ''}</div>
          </div>
          <div class="item-actions">
            ${!item.isCompleted && !item.isDownloading ? `<button class="edit-btn" data-id="${itemId}" title="Editar metadatos"><i class="fas fa-pencil-alt"></i></button>` : ''}
            ${item.isCompleted ? `<button class="folder-btn" data-id="${itemId}" title="Abrir carpeta"><i class="fas fa-folder-open"></i></button>` : ''}
            <button class="delete-btn danger" data-id="${itemId}" title="Eliminar"><i class="fas fa-times-circle"></i></button>
          </div>
        </div>
      `;
    });
    queueList.innerHTML = html;

    // Delegación de eventos para editar, abrir carpeta, eliminar
    document.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const item = queue.find(q => q.id === id);
        if (item) ModalManager.openEdit(item);
      });
    });
    document.querySelectorAll('.folder-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const item = queue.find(q => q.id === id);
        if (item && item.finalPath) {
          // CORRECCIÓN: extraer la carpeta contenedora sin require('path')
          // Dividir la ruta por separadores y eliminar el último segmento (nombre del archivo)
          const separator = item.finalPath.includes('\\') ? '\\' : '/';
          const parts = item.finalPath.split(separator);
          // Eliminar el último elemento (el nombre del archivo)
          parts.pop();
          const folderPath = parts.join(separator);
          // Si la ruta es solo el nombre sin separadores, usar el directorio actual
          const finalFolder = folderPath || '.';
          api.shell.openPath(finalFolder).catch(() => {
            Toast.error('Error', 'No se pudo abrir la carpeta.');
          });
        } else {
          Toast.warning('No disponible', 'El archivo no se ha completado o la ruta es inválida.');
        }
      });
    });
    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        deleteItem(id);
      });
    });

    if (elements.queueCount) {
      const pending = queue.filter(item => !item.isCompleted).length;
      elements.queueCount.textContent = `${pending} elementos`;
    }

    updateProgress();
  }

  // ---------- PROGRESO ----------
  function updateProgress(forceValue) {
    const { totalProgressText, totalProgressBar } = elements;
    if (!totalProgressText || !totalProgressBar) return;
    if (queue.length === 0) {
      totalProgressText.textContent = '0%';
      totalProgressBar.style.width = '0%';
      return;
    }
    if (forceValue !== undefined) {
      totalProgressText.textContent = Math.round(forceValue) + '%';
      totalProgressBar.style.width = forceValue + '%';
      return;
    }
    const total = queue.reduce((sum, item) => sum + (item.progress || 0), 0) / queue.length;
    totalProgressText.textContent = Math.round(total) + '%';
    totalProgressBar.style.width = total + '%';
  }

  function updateItemProgress(id, progress, status) {
    const item = queue.find(q => q.id === id);
    if (item) {
      item.progress = progress;
      item.status = status;
      render();
    }
  }

  // ---------- EXPOSICIÓN ----------
  return {
    init,
    getQueue,
    addItem,
    deleteItem,
    updateItem,
    render,
    updateProgress,
    updateItemProgress,
    clearQueue,
  };
})();

window.OMC = window.OMC || {};
window.OMC.queue = QueueManager;