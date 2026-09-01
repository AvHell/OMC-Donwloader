/**
 * main-queue.js
 * Gestión de la cola de descargas y renderizado de la UI
 */

const QueueManager = (() => {
  let queue = [];
  let api = null;
  let elements = {};

  function init(apiRef, domElements) {
    api = apiRef;
    elements = domElements;
    if (!elements.queueList) {
      console.warn('⚠️ queueList no encontrado, el renderizado no funcionará');
    }
    render();
  }

  function getQueue() {
    return queue;
  }

  function addItem(itemData) {
    const exists = queue.some(q => q.url === itemData.url && !q.isCompleted);
    if (exists) {
      Toast.error('Enlace duplicado', 'Este enlace ya está en la cola y no ha sido completado.');
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

    queue.push(newItem);
    render();
    if (elements.btnStart) elements.btnStart.disabled = false;
    Toast.success('¡Agregado!', 'El enlace se ha añadido a la cola.');
    return true;
  }

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
          if (queue.length === 0 && elements.btnStart) elements.btnStart.disabled = true;
          Toast.show('Elemento removido.', 'success');
        }
      }
    });
  }

  function updateItem(id, newData) {
    const index = queue.findIndex(q => q.id === id);
    if (index === -1) return false;
    queue[index] = { ...queue[index], ...newData };
    render();
    return true;
  }

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
      html += `
        <div class="queue-item" data-id="${item.id}">
          <div class="thumbnail" style="background-image: url('${item.thumbnailUrl || 'https://img.youtube.com/vi/default.jpg'}');">
            ${item.isCompleted ? '<div class="completed-badge"><i class="fas fa-check"></i></div>' : ''}
          </div>
          <div class="item-info">
            <div class="item-title">${item.title || 'Sin título'}</div>
            <div class="item-artist"><i class="fas fa-user"></i> ${item.artist || 'Desconocido'}</div>
            <div class="item-meta">
              <span class="meta-tag duration"><i class="far fa-clock"></i> ${item.duration || '--:--'}</span>
              <span class="meta-tag format"><i class="fas fa-music"></i> ${item.format || 'MP3'}</span>
              ${chaptersCount > 0 ? `<span class="meta-tag chapters"><i class="fas fa-list"></i> ${chaptersCount} pistas</span>` : ''}
            </div>
          </div>
          <div class="item-progress">
            <div class="progress-status" style="color:${statusColor}">
              <i class="fas ${statusIcon}"></i> ${item.status || 'En cola'}
            </div>
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" style="width:${progress}%;"></div>
            </div>
            <div class="progress-extra">${item.speed || ''} ${item.eta ? 'ETA '+item.eta : ''}</div>
          </div>
          <div class="item-actions">
            ${!item.isCompleted && !item.isDownloading ? `<button class="edit-btn" data-id="${item.id}" title="Editar metadatos"><i class="fas fa-pencil-alt"></i></button>` : ''}
            ${item.isCompleted ? `<button class="folder-btn" data-id="${item.id}" title="Abrir carpeta"><i class="fas fa-folder-open"></i></button>` : ''}
            <button class="delete-btn danger" data-id="${item.id}" title="Eliminar"><i class="fas fa-times-circle"></i></button>
          </div>
        </div>
      `;
    });
    queueList.innerHTML = html;

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
          api.shell.openPath(item.finalPath).catch(() => {
            Toast.error('Error', 'No se pudo abrir la carpeta.');
          });
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

  return {
    init,
    getQueue,
    addItem,
    deleteItem,
    updateItem,
    render,
    updateProgress,
    updateItemProgress,
  };
})();

window.OMC = window.OMC || {};
window.OMC.queue = QueueManager;