/**
 * main-modal.js
 * GESTIÓN DE MODALES: Agregar (bulk), editar metadatos, capítulos.
 * Ahora con campo para pegar capítulos manualmente (funcional).
 */

const ModalManager = (() => {
  let api = null;
  let elements = {};
  let currentItem = {}; // solo para previsualización
  let itemToEdit = null;
  let manualChaptersText = ''; // Almacena el texto de capítulos manuales

  function init(apiRef, domElements) {
    api = apiRef;
    elements = domElements;
    elements.btnNewLink.addEventListener('click', () => openAdd());
  }

  function openAdd() {
    currentItem = {
      url: '',
      title: '',
      artist: '',
      album: '',
      albumArtist: '',
      collaborators: '',
      genre: '',
      year: '',
      trackNumber: '',
      thumbnailUrl: '',
      duration: '',
      chapters: [],
      splitChapters: false,
      customCoverPath: '',
      isPlaylist: false,
    };
    manualChaptersText = '';
    showModal('add');
  }

  function renderAddModal() {
    const hasChapters = currentItem.chapters && currentItem.chapters.length > 0;
    const isPlaylist = currentItem.isPlaylist || false;
    const defaultThumb = OMC.utils.DEFAULT_THUMBNAIL || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="120" height="68" viewBox="0 0 120 68"%3E%3Crect width="120" height="68" fill="%23222"%3E%3C/rect%3E%3Ctext x="50%25" y="50%25" font-family="Arial" font-size="14" fill="%23666" text-anchor="middle" dy=".3em"%3ENo image%3C/text%3E%3C/svg%3E';

    const manualChaptersValue = manualChaptersText || '';

    const html = `
      <div class="modal-header">
        <div>
          <h2><i class="fas fa-plus-circle" style="color: var(--color-accent);"></i> Nueva descarga</h2>
          <p>Pega uno o varios enlaces de YouTube (uno por línea).</p>
        </div>
        <button id="modal-close-x" class="btn-icon" style="background:transparent; border:none; color:#FF5A5A; font-size:24px; cursor:pointer; padding:4px 10px;">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="modal-divider"></div>

      <div class="input-group" style="margin-bottom:16px; flex-direction:column; gap:8px;">
        <textarea id="add-url" rows="3" placeholder="https://www.youtube.com/...&#10;https://www.youtube.com/..." style="width:100%; padding:14px 18px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06); border-radius:10px; color:var(--color-text); font-family:var(--font-family); font-size:var(--font-size-body); resize:vertical; outline:none;">${currentItem.url || ''}</textarea>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button id="btn-fetch-modal" class="btn btn-success"><i class="fas fa-search"></i> Previsualizar</button>
          <button id="btn-manual-split" class="btn btn-secondary"><i class="fas fa-scissors"></i> Dividir manual</button>
        </div>
      </div>

      <!-- Previsualización -->
      <div id="video-preview" style="display:${currentItem.title ? 'flex' : 'none'}; gap:16px; align-items:center; background:rgba(255,255,255,0.03); border-radius:10px; padding:12px 16px; margin-bottom:16px; border:1px solid rgba(255,255,255,0.06);">
        <div style="flex-shrink:0; width:120px; height:68px; border-radius:6px; overflow:hidden; background:#000;">
          <img src="${currentItem.thumbnailUrl || defaultThumb}" alt="Thumbnail" style="width:100%; height:100%; object-fit:cover;">
        </div>
        <div style="flex:1; min-width:0;">
          <div style="font-weight:600; font-size:var(--font-size-body); color:var(--color-text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${currentItem.title || 'Sin título'}
            ${isPlaylist ? ' <span style="font-size:var(--font-size-caption); color:var(--color-accent);">(Playlist)</span>' : ''}
          </div>
          <div style="font-size:var(--font-size-caption); color:rgba(255,255,255,0.6); display:flex; gap:12px; margin-top:2px;">
            <span><i class="fas fa-user"></i> ${currentItem.artist || 'Desconocido'}</span>
            <span><i class="far fa-clock"></i> ${currentItem.duration || '--:--'}</span>
            ${isPlaylist && currentItem.entries ? `<span><i class="fas fa-list"></i> ${currentItem.entries.length} pistas</span>` : ''}
          </div>
        </div>
      </div>

      <!-- Controles -->
      <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:center; margin:12px 0 16px 0;">
        <label style="display:flex; align-items:center; gap:8px; color:rgba(255,255,255,0.7); font-size:var(--font-size-body);">
          <input type="checkbox" id="chk-split" ${currentItem.splitChapters && !isPlaylist ? 'checked' : ''} ${isPlaylist ? 'disabled' : ''}> 
          Separar en pistas ${isPlaylist ? '(no aplica a playlists)' : ''}
        </label>
        <select id="format-select" style="padding:10px 16px; border-radius:8px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06); color:var(--color-text); font-family:var(--font-family); font-size:var(--font-size-body);">
          <option value="MP3">MP3 320kbps</option>
          <option value="FLAC">FLAC</option>
        </select>
      </div>

      <!-- Campo capítulos manuales -->
      <div style="margin-bottom:12px;">
        <label style="display:block; color:rgba(255,255,255,0.6); font-size:var(--font-size-body); margin-bottom:4px;">
          <i class="fas fa-pencil-alt"></i> Capítulos manuales (opcional)
          <span style="font-size:var(--font-size-caption); color:rgba(255,255,255,0.4);">(formato: MM:SS Título o HH:MM:SS Título)</span>
        </label>
        <textarea id="manual-chapters" rows="4" placeholder="00:00 Intro&#10;03:26 Parte 1&#10;06:38 Parte 2" style="width:100%; padding:10px 14px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06); border-radius:8px; color:var(--color-text); font-family:var(--font-family); font-size:var(--font-size-body); resize:vertical; outline:none;">${manualChaptersText}</textarea>
      </div>

      <!-- Capítulos detectados/parseados -->
      <div id="chapters-container" style="display:${hasChapters && !isPlaylist ? 'block' : 'none'}; background:rgba(0,0,0,0.15); border-radius:8px; padding:12px; max-height:180px; overflow-y:auto; margin:8px 0;"></div>

      <div class="modal-actions">
        <button id="modal-cancel" class="btn btn-secondary"><i class="fas fa-times"></i> CANCELAR</button>
        <button id="modal-add" class="btn btn-success"><i class="fas fa-plus"></i> AÑADIR TODO</button>
      </div>
    `;
    elements.modalContent.innerHTML = html;

    // Eventos
    document.getElementById('modal-close-x').addEventListener('click', closeModals);
    document.getElementById('btn-fetch-modal').addEventListener('click', fetchMetadata);
    document.getElementById('btn-manual-split').addEventListener('click', () => {
      const firstUrl = document.getElementById('add-url').value.trim().split('\n')[0];
      if (firstUrl) {
        EditorManager.openEditor(firstUrl);
      } else {
        Toast.warning('Primero ingresa un enlace.', 'Carga un video antes de abrir el editor.');
      }
    });
    document.getElementById('modal-cancel').addEventListener('click', closeModals);
    document.getElementById('modal-add').addEventListener('click', addFromModal);

    // Guardar texto de capítulos manuales
    const manualChaptersInput = document.getElementById('manual-chapters');
    if (manualChaptersInput) {
      manualChaptersInput.addEventListener('input', function() {
        manualChaptersText = this.value;
        console.log('📝 Texto manual actualizado:', manualChaptersText);
      });
    }

    const chkSplit = document.getElementById('chk-split');
    if (chkSplit) {
      chkSplit.addEventListener('change', function(e) {
        if (!currentItem.isPlaylist) {
          currentItem.splitChapters = e.target.checked;
        }
      });
    }

    const container = document.getElementById('chapters-container');
    if (hasChapters && !isPlaylist) {
      renderChaptersInContainer(container, currentItem.chapters);
    }
  }

  function renderChaptersInContainer(container, chapters) {
    if (!container || !chapters || chapters.length === 0) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }
    container.style.display = 'block';
    container.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
        <label style="display:flex; align-items:center; gap:6px; color:rgba(255,255,255,0.7);">
          <input type="checkbox" id="select-all-chapters" ${chapters.every(c => c.isSelected !== false) ? 'checked' : ''}> Seleccionar todos
        </label>
      </div>
      ${chapters.map((ch, idx) => `
        <div style="display:flex; align-items:center; gap:10px; margin:4px 0; padding:4px 8px; background:rgba(255,255,255,0.02); border-radius:6px;">
          <input type="checkbox" ${ch.isSelected !== false ? 'checked' : ''} data-idx="${idx}" style="width:18px; height:18px; cursor:pointer;">
          <span style="flex:1; font-weight:500; font-size:var(--font-size-body);">${ch.title}</span>
          <span style="color:rgba(255,255,255,0.5); font-size:var(--font-size-caption);">${OMC.utils.formatTime(ch.start)}</span>
        </div>
      `).join('')}
    `;
    const selectAll = document.getElementById('select-all-chapters');
    if (selectAll) {
      selectAll.addEventListener('change', (e) => {
        document.querySelectorAll('#chapters-container input[type="checkbox"]').forEach(cb => {
          if (cb.id !== 'select-all-chapters') cb.checked = e.target.checked;
        });
      });
    }
  }

  // ===== PARSEAR CAPÍTULOS MANUALES =====
  function parseManualChapters(text, totalDuration) {
    const lines = text.split('\n').map(s => s.trim()).filter(s => s);
    console.log(`📄 Líneas detectadas: ${lines.length}`, lines);
    
    const chapters = [];
    const regex = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*[-–—]?\s*(.+)$/;
    
    for (const line of lines) {
      const match = line.match(regex);
      if (!match) {
        console.warn(`⚠️ Línea no parseada (formato inválido):`, line);
        continue;
      }

      let start = 0;
      let title = match[4].trim();

      if (match[3] !== undefined) {
        const hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const seconds = parseInt(match[3], 10);
        start = hours * 3600 + minutes * 60 + seconds;
      } else {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        start = minutes * 60 + seconds;
      }

      if (start < 0 || (totalDuration > 0 && start >= totalDuration)) {
        console.warn(`⚠️ Tiempo ${OMC.utils.formatTime(start)} excede duración total (${OMC.utils.formatTime(totalDuration)}): ${title}`);
        continue;
      }

      chapters.push({ title, start, end: 0, isSelected: true, videoUrl: '' });
    }

    if (chapters.length === 0) {
      console.warn('⚠️ No se generaron capítulos válidos');
      return chapters;
    }

    chapters.sort((a, b) => a.start - b.start);
    for (let i = 0; i < chapters.length; i++) {
      const nextStart = (i + 1 < chapters.length) ? chapters[i + 1].start : (totalDuration || 0);
      chapters[i].end = nextStart;
    }

    console.log(`📊 Capítulos manuales parseados: ${chapters.length}`, chapters);
    return chapters;
  }

  // ===== FETCH METADATA =====
  async function fetchMetadata() {
    const urlInput = document.getElementById('add-url');
    const rawText = urlInput.value.trim();
    const firstUrl = rawText.split('\n').map(s => s.trim()).filter(s => s)[0];
    if (!firstUrl) {
      Toast.show('Ingresa al menos un enlace de YouTube.', 'warning');
      return;
    }
    if (!firstUrl.includes('youtube.com') && !firstUrl.includes('youtu.be')) {
      Toast.show('El enlace debe ser de YouTube.', 'warning');
      return;
    }

    if (typeof window.showLoading === 'function') {
      window.showLoading(true, 'Obteniendo metadatos...', 0);
    }

    try {
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress += Math.random() * 10;
        if (progress > 90) progress = 90;
        if (typeof window.updateLoadingProgress === 'function') {
          window.updateLoadingProgress(progress, 'Obteniendo metadatos...');
        }
      }, 200);

      const data = await api.ytdlp.getMetadata(firstUrl);
      clearInterval(progressInterval);

      currentItem.url = firstUrl;
      currentItem.title = data.title || 'Título no disponible';
      currentItem.artist = data.artist || 'Artista desconocido';
      currentItem.album = data.title || '';
      currentItem.albumArtist = data.artist || '';
      currentItem.duration = data.duration || '--:--';
      currentItem.thumbnailUrl = data.thumbnailUrl || OMC.utils.DEFAULT_THUMBNAIL;
      currentItem.isPlaylist = data.isPlaylist || false;
      currentItem.entries = data.entries || [];

      // --- CORRECCIÓN: Parsear duración total correctamente ---
      let totalDuration = 0;
      if (data.duration) {
        const parts = data.duration.split(':').map(Number);
        if (parts.length === 3) {
          totalDuration = parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) {
          totalDuration = parts[0] * 60 + parts[1];
        } else {
          totalDuration = parseFloat(data.duration) || 0;
        }
      }
      console.log(`📏 Duración total parseada: ${totalDuration}s (${data.duration})`);

      const manualText = document.getElementById('manual-chapters')?.value || '';
      console.log('📥 Texto manual leído:', manualText);
      
      let chapters = [];
      let split = false;

      if (manualText.trim()) {
        chapters = parseManualChapters(manualText, totalDuration);
        if (chapters.length > 0) {
          split = true;
          Toast.show(`Capítulos manuales cargados: ${chapters.length}`, 'success');
        } else {
          Toast.show('No se pudieron parsear los capítulos manuales. Revisa el formato.', 'warning');
          if (!data.isPlaylist && data.chapters && data.chapters.length > 0) {
            chapters = data.chapters.map(c => ({ ...c, isSelected: true, collaborator: '', trackNumber: '' }));
            split = chapters.length > 0;
          }
        }
      } else {
        if (!data.isPlaylist && data.chapters && data.chapters.length > 0) {
          chapters = data.chapters.map(c => ({ ...c, isSelected: true, collaborator: '', trackNumber: '' }));
          split = chapters.length > 0;
        }
      }

      currentItem.chapters = chapters;
      currentItem.splitChapters = split;

      renderAddModal();
      document.getElementById('add-url').value = rawText;
      document.getElementById('manual-chapters').value = manualText;

      const chkSplit = document.getElementById('chk-split');
      if (chkSplit) {
        chkSplit.checked = split && !currentItem.isPlaylist;
      }

      if (typeof window.showLoading === 'function') {
        window.showLoading(false);
      }
      Toast.show('Metadatos cargados correctamente.', 'success');
    } catch (err) {
      if (typeof window.showLoading === 'function') {
        window.showLoading(false);
      }
      Toast.error('Error', `No se pudo obtener la información: ${err.message}`);
    }
  }

  // ===== SET CURRENT CHAPTERS (desde editor) =====
  function setCurrentChapters(chapters) {
    if (!chapters || chapters.length === 0) {
      currentItem.chapters = [];
      currentItem.splitChapters = false;
      renderAddModal();
      return;
    }
    currentItem.chapters = chapters.map(c => ({
      ...c,
      isSelected: c.isSelected !== undefined ? c.isSelected : true,
      collaborator: c.collaborator || '',
      trackNumber: c.trackNumber || '',
    }));
    currentItem.splitChapters = true;
    renderAddModal();
  }

  // ===== AÑADIR DESDE MODAL =====
  async function addFromModal() {
    const urlText = document.getElementById('add-url').value.trim();
    if (!urlText) {
      Toast.show('Ingresa al menos un enlace.', 'warning');
      return;
    }

    const urls = urlText.split('\n').map(s => s.trim()).filter(s => s);
    if (urls.length === 0) {
      Toast.show('No se encontraron enlaces válidos.', 'warning');
      return;
    }

    const formatSelect = document.getElementById('format-select');
    const format = formatSelect ? formatSelect.value : 'MP3';
    const splitChapters = document.getElementById('chk-split') ? document.getElementById('chk-split').checked : false;

    const manualText = document.getElementById('manual-chapters')?.value || '';

    if (typeof window.showLoading === 'function') {
      window.showLoading(true, 'Procesando enlaces...', 0);
    }

    let addedCount = 0;
    let total = urls.length;
    let processed = 0;

    for (const url of urls) {
      processed++;
      try {
        if (typeof window.updateLoadingProgress === 'function') {
          window.updateLoadingProgress((processed / total) * 100, `Obteniendo datos de ${url}`);
        }

        const data = await api.ytdlp.getMetadata(url);
        let chapters = [];
        let split = false;

        if (data.isPlaylist) {
          split = false;
          chapters = [];
        } else {
          if (manualText.trim()) {
            // Parsear duración
            let totalDuration = 0;
            if (data.duration) {
              const parts = data.duration.split(':').map(Number);
              if (parts.length === 3) {
                totalDuration = parts[0] * 3600 + parts[1] * 60 + parts[2];
              } else if (parts.length === 2) {
                totalDuration = parts[0] * 60 + parts[1];
              } else {
                totalDuration = parseFloat(data.duration) || 0;
              }
            }
            let manualChapters = parseManualChapters(manualText, totalDuration);
            if (manualChapters.length > 0) {
              chapters = manualChapters.map(c => ({ ...c, isSelected: true, collaborator: '', trackNumber: '' }));
              split = true;
            } else {
              chapters = [];
              split = false;
            }
          } else {
            if (splitChapters && data.chapters && data.chapters.length > 0) {
              chapters = data.chapters.map(c => ({ ...c, isSelected: true, collaborator: '', trackNumber: '' }));
              split = true;
            } else {
              chapters = [];
              split = false;
            }
          }
        }

        const itemToAdd = {
          url: url,
          title: data.title || 'Título no disponible',
          artist: data.artist || 'Artista desconocido',
          album: data.title || '',
          albumArtist: data.artist || '',
          collaborators: data.artist || '',
          genre: '',
          year: '',
          trackNumber: '',
          thumbnailUrl: data.thumbnailUrl || OMC.utils.DEFAULT_THUMBNAIL,
          duration: data.duration || '--:--',
          chapters: split ? chapters : [],
          splitChapters: split,
          format: format,
          customCoverPath: '',
          status: 'En cola',
        };

        const added = QueueManager.addItem(itemToAdd);
        if (added) addedCount++;
      } catch (err) {
        Toast.error(`Error con ${url}`, err.message);
      }
    }

    if (typeof window.showLoading === 'function') {
      window.showLoading(false);
    }

    if (addedCount > 0) {
      closeModals();
      Toast.show(`Se añadieron ${addedCount} elemento(s) a la cola.`, 'success');
      currentItem = {
        url: '',
        title: '',
        artist: '',
        album: '',
        albumArtist: '',
        collaborators: '',
        genre: '',
        year: '',
        trackNumber: '',
        thumbnailUrl: '',
        duration: '',
        chapters: [],
        splitChapters: false,
        customCoverPath: '',
        isPlaylist: false,
        entries: [],
      };
      manualChaptersText = '';
    } else {
      Toast.show('No se pudo añadir ningún elemento.', 'warning');
    }
  }

  // ===== MODAL DE EDICIÓN (sin cambios) =====
  function openEdit(item) {
    if (item.isCompleted || item.isDownloading) {
      Toast.error('No se puede editar', 'No se puede editar durante la descarga o si ya está completado.');
      return;
    }
    itemToEdit = item;
    showModal('edit');
  }

  function renderEditModal() {
    if (!itemToEdit) return;
    const item = itemToEdit;
    const chaptersHtml = item.chapters && item.chapters.length > 0 ?
      item.chapters.map((ch, idx) => `
        <div class="chapter-row" data-idx="${idx}" style="display:flex; gap:8px; margin-bottom:6px; align-items:center;">
          <input type="text" placeholder="Título" value="${ch.title || ''}" style="flex:2; padding:6px 10px; border-radius:6px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.04); color:var(--color-text); font-size:var(--font-size-body);">
          <input type="text" placeholder="Colaborador" value="${ch.collaborator || ''}" style="flex:1; padding:6px 10px; border-radius:6px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.04); color:var(--color-text); font-size:var(--font-size-body);">
          <input type="text" placeholder="# Pista" value="${ch.trackNumber || ''}" style="flex:0.5; padding:6px 10px; border-radius:6px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.04); color:var(--color-text); font-size:var(--font-size-body);">
          <button class="delete-chapter" style="background:transparent; border:none; color:var(--color-error); cursor:pointer;"><i class="fas fa-trash-alt"></i></button>
        </div>
      `).join('') : '<p style="color:rgba(255,255,255,0.4); font-size:var(--font-size-body);">No hay capítulos</p>';

    const html = `
      <div class="modal-header">
        <div>
          <h2><i class="fas fa-edit" style="color: var(--color-info);"></i> Editar Metadatos</h2>
          <p>Campos para Windows Media Player y etiquetado.</p>
        </div>
        <button id="modal-close-x" class="btn-icon" style="background:transparent; border:none; color:#FF5A5A; font-size:24px; cursor:pointer; padding:4px 10px;">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="modal-divider"></div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <input type="text" id="edit-title" placeholder="Título" value="${item.title || ''}" style="padding:10px 14px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06); border-radius:8px; color:var(--color-text); font-family:var(--font-family); font-size:var(--font-size-body);">
        <input type="text" id="edit-artist" placeholder="Intérpretes" value="${item.artist || ''}" style="padding:10px 14px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06); border-radius:8px; color:var(--color-text); font-family:var(--font-family); font-size:var(--font-size-body);">
        <input type="text" id="edit-album" placeholder="Álbum" value="${item.album || ''}" style="padding:10px 14px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06); border-radius:8px; color:var(--color-text); font-family:var(--font-family); font-size:var(--font-size-body);">
        <input type="text" id="edit-albumartist" placeholder="Intérprete del Álbum" value="${item.albumArtist || ''}" style="padding:10px 14px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06); border-radius:8px; color:var(--color-text); font-family:var(--font-family); font-size:var(--font-size-body);">
        <input type="text" id="edit-genre" placeholder="Género" value="${item.genre || ''}" style="padding:10px 14px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06); border-radius:8px; color:var(--color-text); font-family:var(--font-family); font-size:var(--font-size-body);">
        <input type="text" id="edit-year" placeholder="Año" value="${item.year || ''}" style="padding:10px 14px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06); border-radius:8px; color:var(--color-text); font-family:var(--font-family); font-size:var(--font-size-body);">
        <input type="text" id="edit-track" placeholder="Núm. de Pista" value="${item.trackNumber || ''}" style="padding:10px 14px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06); border-radius:8px; color:var(--color-text); font-family:var(--font-family); font-size:var(--font-size-body);">
        <div>
          <button id="btn-cover" class="btn btn-secondary" style="width:100%;"><i class="fas fa-image"></i> Portada</button>
          <span id="cover-filename" style="margin-left:8px; color:rgba(255,255,255,0.4); font-size:var(--font-size-caption);">${item.customCoverPath ? item.customCoverPath.split('/').pop() : 'Ninguna'}</span>
        </div>
      </div>
      <div style="margin-top:16px; background:rgba(0,0,0,0.15); border-radius:8px; padding:12px; max-height:200px; overflow-y:auto;">
        <h4 style="margin-bottom:8px; color:rgba(255,255,255,0.6); font-size:var(--font-size-subheading);"><i class="fas fa-list"></i> Pistas</h4>
        <div id="edit-chapters-list">${chaptersHtml}</div>
        <button id="btn-add-chapter" class="btn btn-secondary" style="width:100%; margin-top:8px; padding:6px;"><i class="fas fa-plus"></i> Añadir pista</button>
      </div>
      <div class="modal-actions">
        <button id="modal-cancel" class="btn btn-secondary"><i class="fas fa-times"></i> CANCELAR</button>
        <button id="modal-save" class="btn btn-success"><i class="fas fa-save"></i> GUARDAR</button>
      </div>
    `;
    elements.modalContent.innerHTML = html;

    document.getElementById('modal-close-x').addEventListener('click', closeModals);
    document.getElementById('modal-cancel').addEventListener('click', closeModals);
    document.getElementById('modal-save').addEventListener('click', saveEdit);
    document.getElementById('btn-cover').addEventListener('click', selectCoverFile);
    document.getElementById('btn-add-chapter').addEventListener('click', addChapterRow);
    document.querySelectorAll('.delete-chapter').forEach(btn => {
      btn.addEventListener('click', function() {
        const row = this.closest('.chapter-row');
        if (row) row.remove();
      });
    });
  }

  // ===== GUARDAR EDICIÓN =====
  function saveEdit() {
    if (!itemToEdit) return;
    const title = document.getElementById('edit-title').value.trim();
    const artist = document.getElementById('edit-artist').value.trim();
    const album = document.getElementById('edit-album').value.trim();
    const albumArtist = document.getElementById('edit-albumartist').value.trim();
    const genre = document.getElementById('edit-genre').value.trim();
    const year = document.getElementById('edit-year').value.trim();
    const trackNumber = document.getElementById('edit-track').value.trim();

    const chapterRows = document.querySelectorAll('#edit-chapters-list .chapter-row');
    const newChapters = [];
    chapterRows.forEach(row => {
      const titleInput = row.querySelector('input[placeholder="Título"]');
      const collaboratorInput = row.querySelector('input[placeholder="Colaborador"]');
      const trackInput = row.querySelector('input[placeholder="# Pista"]');
      if (titleInput && titleInput.value.trim()) {
        newChapters.push({
          title: titleInput.value.trim(),
          collaborator: collaboratorInput ? collaboratorInput.value.trim() : '',
          trackNumber: trackInput ? trackInput.value.trim() : '',
          start: 0,
          end: 0,
          isSelected: true,
        });
      }
    });

    if (itemToEdit.chapters && itemToEdit.chapters.length > 0) {
      const origChapters = itemToEdit.chapters;
      newChapters.forEach((nc, idx) => {
        const orig = origChapters[idx] || {};
        nc.start = orig.start || 0;
        nc.end = orig.end || 0;
        nc.isSelected = orig.isSelected !== undefined ? orig.isSelected : true;
        nc.videoUrl = orig.videoUrl || '';
      });
    }

    const updatedItem = {
      title: title || itemToEdit.title,
      artist: artist || itemToEdit.artist,
      album: album || itemToEdit.album,
      albumArtist: albumArtist || itemToEdit.albumArtist,
      genre: genre || itemToEdit.genre,
      year: year || itemToEdit.year,
      trackNumber: trackNumber || itemToEdit.trackNumber,
      chapters: newChapters,
      splitChapters: newChapters.length > 0,
    };

    const coverPath = document.getElementById('edit-cover-path')?.value;
    if (coverPath) updatedItem.customCoverPath = coverPath;

    QueueManager.updateItem(itemToEdit.id, updatedItem);
    closeModals();
    Toast.show('Metadatos actualizados correctamente.', 'success');
  }

  // ===== AÑADIR FILA DE CAPÍTULO (en edición) =====
  function addChapterRow() {
    const list = document.getElementById('edit-chapters-list');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'chapter-row';
    row.style.cssText = 'display:flex; gap:8px; margin-bottom:6px; align-items:center;';
    row.innerHTML = `
      <input type="text" placeholder="Título" style="flex:2; padding:6px 10px; border-radius:6px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.04); color:var(--color-text); font-size:var(--font-size-body);">
      <input type="text" placeholder="Colaborador" style="flex:1; padding:6px 10px; border-radius:6px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.04); color:var(--color-text); font-size:var(--font-size-body);">
      <input type="text" placeholder="# Pista" style="flex:0.5; padding:6px 10px; border-radius:6px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.04); color:var(--color-text); font-size:var(--font-size-body);">
      <button class="delete-chapter" style="background:transparent; border:none; color:var(--color-error); cursor:pointer;"><i class="fas fa-trash-alt"></i></button>
    `;
    list.appendChild(row);
    row.querySelector('.delete-chapter').addEventListener('click', () => row.remove());
  }

  // ===== SELECCIONAR PORTADA =====
  async function selectCoverFile() {
    const result = await api.dialog.selectFile();
    if (result) {
      const filename = result.split('/').pop();
      document.getElementById('cover-filename').textContent = filename;
      const hidden = document.getElementById('edit-cover-path') || document.createElement('input');
      hidden.id = 'edit-cover-path';
      hidden.type = 'hidden';
      hidden.value = result;
      document.querySelector('.form-grid').appendChild(hidden);
      Toast.show('Portada seleccionada', 'success');
    }
  }

  // ===== FUNCIONES AUXILIARES =====
  function showModal(type) {
    elements.modalOverlay.classList.add('active');
    if (type === 'add') renderAddModal();
    else if (type === 'edit') renderEditModal();
  }

  function closeModals() {
    elements.modalOverlay.classList.remove('active');
    elements.modalContent.innerHTML = '';
    itemToEdit = null;
    const chapterOverlay = document.getElementById('chapter-modal-overlay');
    if (chapterOverlay) chapterOverlay.style.display = 'none';
  }

  // ===== EXPOSICIÓN PÚBLICA =====
  return {
    init,
    openAdd,
    openEdit,
    closeModals,
    setCurrentChapters,
  };
})();

window.OMC = window.OMC || {};
window.OMC.modal = ModalManager;