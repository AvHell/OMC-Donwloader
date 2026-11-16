/**
 * main-modal.js
 * GESTIÓN DE MODALES: Agregar (bulk), editar metadatos, capítulos.
 * 
 * FUNCIONALIDADES:
 * - Modal de agregar con previsualización bajo demanda
 * - Interfaz moderna con botones con iconos y tooltips
 * - Selección automática de la mejor calidad disponible y separación de pistas
 * - Soporte para múltiples enlaces (acumula y no sobrescribe)
 * - Lista de previsualizaciones con scroll y checkboxes
 * - Capítulos manuales en campo colapsable
 * - Modal de edición optimizado con colaborador global
 * - Botón X en lugar de Cancelar en ambos modales
 * - Logs enviados a la consola en vivo
 * - Miniaturas y metadatos individuales para pistas de playlists
 * - Portada personalizada para reemplazar imágenes incorrectas
 * - Overlay de carga durante la previsualización (fetch de metadatos)
 * - Playlists se añaden como un solo bloque
 * - Edición de playlists: tabla con Nº y Título (sin colaborador por pista)
 * 
 * MODIFICACIONES RECIENTES:
 * - Los enlaces YA NO se procesan automáticamente al pegar
 * - Cada enlace tiene un botón "Procesar" individual
 * - El checkbox está deshabilitado hasta que se procese el enlace
 * - Validación estricta de capítulos manuales: si hay error, NO deja avanzar
 * - Se valida que "Separar en pistas" tenga capítulos manuales O automáticos
 * - Función validateManualChapters() para validación exhaustiva
 * - CORREGIDO: conversión de duración con parseTime (no parseFloat)
 * - CORREGIDO: regex de capítulos acepta " - ", "-", "–", "—" como separadores
 * - CORREGIDO: logs detallados con console.log/warn/error para depurar
 * - CORREGIDO: errores mostrados con SweetAlert2 (más visibles)
 */

// Función global para manejar error de carga de imagen
window.fixThumbnailError = function(img) {
    if (!img) return;
    const isPlaylist = img.dataset.isPlaylist === 'true';
    let fallback;
    if (isPlaylist) {
        fallback = './playlist.png';
    } else {
        fallback = OMC?.utils?.DEFAULT_THUMBNAIL || 
            'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="120" height="68" viewBox="0 0 120 68"%3E%3Crect width="120" height="68" fill="%23222"%3E%3C/rect%3E%3Ctext x="50%25" y="50%25" font-family="Arial" font-size="14" fill="%23666" text-anchor="middle" dy=".3em"%3ENo image%3C/text%3E%3C/svg%3E';
    }
    img.src = fallback;
    img.onerror = null;
};

// ============================================================
//  HELPER: Mostrar error con SweetAlert2 + Toast + Log
// ============================================================
window.showChapterError = function(title, message, details = '') {
  // Log en consola
  console.error(`❌ ${title}: ${message}`, details ? `\nDetalles: ${details}` : '');
  if (typeof window.sendLog === 'function') {
    window.sendLog('error', `❌ ${title}: ${message}${details ? ' | ' + details : ''}`);
  }
  
  // Toast rápido
  if (typeof Toast !== 'undefined') {
    Toast.error(title, message);
  }
  
  // SweetAlert2 con detalles
  if (typeof Swal !== 'undefined') {
    Swal.fire({
      icon: 'error',
      title: title,
      html: `
        <div style="text-align:left; font-size:14px; line-height:1.6;">
          <p style="margin:0 0 10px 0;">${message}</p>
          ${details ? `
            <div style="background:rgba(0,0,0,0.2); border-radius:8px; padding:10px; margin-top:10px; font-family:monospace; font-size:12px; white-space:pre-wrap; max-height:200px; overflow-y:auto; border:1px solid rgba(255,90,90,0.3);">
${details}
            </div>
          ` : ''}
          <p style="margin:12px 0 0 0; font-size:12px; color:rgba(255,255,255,0.6);">
            <strong>Formato correcto:</strong><br>
            <code style="background:rgba(0,0,0,0.3); padding:2px 6px; border-radius:4px;">MM:SS Título</code><br>
            <code style="background:rgba(0,0,0,0.3); padding:2px 6px; border-radius:4px;">HH:MM:SS Título</code><br>
            Ejemplo:<br>
            <code style="background:rgba(0,0,0,0.3); padding:2px 6px; border-radius:4px;">00:00 Intro</code><br>
            <code style="background:rgba(0,0,0,0.3); padding:2px 6px; border-radius:4px;">13:43 Everytime We Say Goodbye</code><br>
            <code style="background:rgba(0,0,0,0.3); padding:2px 6px; border-radius:4px;">01:13:43 But Not For Me</code>
          </p>
        </div>
      `,
      background: '#1a1a1a',
      color: '#fff',
      confirmButtonColor: '#00FF7B',
      confirmButtonText: 'Entendido',
      width: 500,
    });
  }
};

// ============================================================
//  HELPER: Mostrar advertencia
// ============================================================
window.showChapterWarning = function(title, message) {
  console.warn(`⚠️ ${title}: ${message}`);
  if (typeof window.sendLog === 'function') {
    window.sendLog('warning', `⚠️ ${title}: ${message}`);
  }
  if (typeof Toast !== 'undefined') {
    Toast.warning(title, message);
  }
};

function escapeMarkup(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function safeThumbnailUrl(value, fallback) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : fallback;
  } catch (err) {
    return fallback;
  }
}

function getUrlSupportMessage(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return 'Solo se aceptan enlaces web HTTP o HTTPS.';
    const host = url.hostname.toLowerCase();
    if (host === 'spotify.com' || host.endsWith('.spotify.com')) {
      return 'El procesamiento de Spotify está desactivado; el audio no se descarga directamente desde Spotify.';
    }
    if (
      host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be' ||
      host === 'bandcamp.com' || host.endsWith('.bandcamp.com')
    ) return '';
    return 'Enlace no compatible. Usa YouTube o Bandcamp.';
  } catch (err) {
    return 'Enlace inválido. Comprueba que incluya https://';
  }
}

const ModalManager = (() => {
  let api = null;
  let elements = {};
  let currentItem = {}; 
  let itemToEdit = null;
  let manualChaptersText = '';
  let previewItems = [];
  let debounceTimer = null;
  let isFetching = false;

  // ============================================================
  //  INICIALIZACIÓN
  // ============================================================
  function init(apiRef, domElements) {
    api = apiRef;
    elements = domElements;
    elements.btnNewLink.addEventListener('click', () => openAdd());
    console.log('✅ ModalManager inicializado');
  }

  // ============================================================
  //  ABRIR MODAL DE AGREGAR
  // ============================================================
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
    previewItems = [];
    showModal('add');
    console.log('📂 Modal de agregar abierto');
  }

  // ============================================================
  //  RENDERIZAR MODAL DE AGREGAR (MODERNIZADO)
  // ============================================================
  function renderAddModal() {
    const defaultThumb = OMC?.utils?.DEFAULT_THUMBNAIL || 
        'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="120" height="68" viewBox="0 0 120 68"%3E%3Crect width="120" height="68" fill="%23222"%3E%3C/rect%3E%3Ctext x="50%25" y="50%25" font-family="Arial" font-size="14" fill="%23666" text-anchor="middle" dy=".3em"%3ENo image%3C/text%3E%3C/svg%3E';

    // ===== GENERAR HTML DE PREVISUALIZACIONES =====
    let previewsHtml = '';
    if (previewItems.length > 0) {
      previewsHtml = `
        <div style="display:flex; flex-direction:column; gap:8px; max-height:300px; overflow-y:auto; padding-right:4px;">
          ${previewItems.map((item, index) => {
            const data = item.data;
            const error = item.error;
            const selected = item.selected !== false;
            const loading = item.loading;
            const processed = item.processed || false;
            
            let thumb = defaultThumb;
            let isPlaylist = false;
            if (data) {
              isPlaylist = data.isPlaylist || false;
              if (typeof data.thumbnailUrl === 'string' && data.thumbnailUrl) {
                if (data.thumbnailUrl.includes('default.jpg') || data.thumbnailUrl.includes('hqdefault.jpg')) {
                  thumb = defaultThumb;
                } else {
                  thumb = safeThumbnailUrl(data.thumbnailUrl, defaultThumb);
                }
              }
            }
            
            const title = data?.title || (loading ? 'Cargando...' : (processed ? 'Error al cargar' : 'Sin procesar'));
            const artist = data?.artist || '';
            const duration = data?.duration || '--:--';
            const playlistTracks = isPlaylist && Array.isArray(data?.entries)
              ? data.entries.slice(0, 6).map((entry, trackIndex) => `
                <div style="display:flex; align-items:center; gap:8px; padding:5px 0; border-top:1px solid rgba(255,255,255,0.05);">
                  <img class="playlist-track-thumbnail" src="${escapeMarkup(safeThumbnailUrl(entry.thumbnail, thumb))}" alt="" style="width:32px; height:32px; object-fit:cover; border-radius:4px;">
                  <span style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${trackIndex + 1}. ${escapeMarkup(entry.title || 'Pista sin título')}</span>
                  <span style="color:rgba(255,255,255,0.5); white-space:nowrap;">${escapeMarkup(entry.artist || '')}</span>
                </div>
              `).join('')
              : '';
            
            const processBtn = (!processed && !loading && !error) 
              ? `<button class="btn btn-secondary process-btn" data-index="${index}" style="padding:6px 14px; font-size:12px; border-radius:6px; transition: all 0.2s; white-space:nowrap; cursor:pointer;"><i class="fas fa-play"></i> Procesar</button>`
              : '';
            
            const retryBtn = error 
              ? `<button class="btn btn-secondary retry-btn" data-index="${index}" style="padding:6px 14px; font-size:12px; border-radius:6px; transition: all 0.2s; white-space:nowrap; cursor:pointer;"><i class="fas fa-redo"></i> Reintentar</button>`
              : '';
            
            return `
              <div class="preview-item" style="display:flex; align-items:center; gap:12px; background:rgba(255,255,255,0.03); border-radius:8px; padding:8px 12px; border:1px solid ${error ? 'var(--color-error)' : 'rgba(255,255,255,0.06)'}; transition: all 0.2s;">
                <input type="checkbox" ${selected ? 'checked' : ''} data-index="${index}" class="preview-checkbox" style="width:18px; height:18px; cursor:pointer; flex-shrink:0; accent-color: var(--color-accent);" ${!processed ? 'disabled' : ''}>
                <div style="flex-shrink:0; width:48px; height:48px; border-radius:6px; overflow:hidden; background:#000;">
                  <img src="${escapeMarkup(safeThumbnailUrl(thumb, defaultThumb))}" alt="Thumbnail" style="width:100%; height:100%; object-fit:cover;" data-index="${index}" data-is-playlist="${isPlaylist}" class="thumbnail-img">
                </div>
                <div style="flex:1; min-width:0;">
                  <div style="font-weight:500; font-size:var(--font-size-body); color:var(--color-text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${escapeMarkup(title)}
                    ${loading ? '<span style="color:var(--color-info); font-size:var(--font-size-caption); margin-left:8px;"><i class="fas fa-spinner fa-spin"></i></span>' : ''}
                  </div>
                  <div style="font-size:var(--font-size-caption); color:rgba(255,255,255,0.6); display:flex; gap:12px; flex-wrap:wrap;">
                    <span><i class="fas fa-user"></i> ${escapeMarkup(artist || 'Desconocido')}</span>
                    <span><i class="far fa-clock"></i> ${escapeMarkup(duration)}</span>
                    ${error ? `<span style="color:var(--color-error);"><i class="fas fa-exclamation-triangle"></i> ${escapeMarkup(error)}</span>` : ''}
                    ${isPlaylist ? `<span style="color:var(--color-accent);"><i class="fas fa-list"></i> Playlist (${data?.entries?.length || '?'})</span>` : ''}
                    ${data?.chapters && data.chapters.length > 0 && !isPlaylist ? `<span style="color:var(--color-accent);"><i class="fas fa-scissors"></i> ${data.chapters.length} pistas</span>` : ''}
                  </div>
                  ${playlistTracks ? `<div style="margin-top:8px; max-height:190px; overflow:auto;">${playlistTracks}${data.entries.length > 6 ? `<div style="padding-top:6px; color:rgba(255,255,255,0.5);">y ${data.entries.length - 6} pistas más</div>` : ''}</div>` : ''}
                </div>
                <div style="display:flex; gap:6px; flex-shrink:0;">
                  ${processBtn}
                  ${retryBtn}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else {
      previewsHtml = `
        <div style="text-align:center; color:rgba(255,255,255,0.3); padding:20px;">
          <i class="fas fa-link" style="font-size:32px; opacity:0.3; display:block; margin-bottom:8px;"></i>
          <p style="font-size:var(--font-size-body);">Pega enlaces de YouTube o Bandcamp para previsualizar</p>
        </div>
      `;
    }

    // ===== PANEL DE CONTROLES MODERNIZADO =====
    const controlsHtml = `
      <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:16px; padding:10px 16px; background:rgba(255,255,255,0.03); border-radius:10px; border:1px solid rgba(255,255,255,0.06); position:relative;">
        
        <!-- Botón: Separar en pistas -->
        <div style="position:relative;">
          <button id="btn-split" class="btn btn-secondary" style="padding:8px 16px; font-size:var(--font-size-body); gap:8px; border-radius:8px; transition: all 0.2s; ${currentItem.splitChapters ? 'border-color: var(--color-accent);' : ''}" title="Separar en pistas">
            <i class="fas fa-scissors" style="${currentItem.splitChapters ? 'color: var(--color-accent);' : ''}"></i> <span id="split-label">${currentItem.splitChapters ? 'Separar' : 'No separar'}</span>
            <i class="fas fa-chevron-down" style="font-size:12px; margin-left:4px;"></i>
          </button>
          <div id="split-submenu" style="display:none; position:absolute; top:calc(100% + 6px); left:0; background:var(--color-background); border-radius:10px; padding:6px 0; min-width:180px; box-shadow:0 12px 40px rgba(0,0,0,0.6); border:1px solid rgba(255,255,255,0.08); z-index:100; backdrop-filter:blur(12px);">
            <button class="split-option" data-split="true" style="display:flex; align-items:center; gap:10px; padding:8px 16px; width:100%; background:transparent; border:none; color:var(--color-text); cursor:pointer; font-family:var(--font-family); font-size:var(--font-size-body); transition: background 0.2s;">
              <i class="fas fa-check-circle" style="color:var(--color-accent);"></i> Separar en pistas
              <span id="split-check-true" style="margin-left:auto; color:var(--color-accent); ${currentItem.splitChapters ? '' : 'display:none;'}">✓</span>
            </button>
            <button class="split-option" data-split="false" style="display:flex; align-items:center; gap:10px; padding:8px 16px; width:100%; background:transparent; border:none; color:var(--color-text); cursor:pointer; font-family:var(--font-family); font-size:var(--font-size-body); transition: background 0.2s;">
              <i class="fas fa-times-circle" style="color:rgba(255,255,255,0.4);"></i> No separar
              <span id="split-check-false" style="margin-left:auto; color:var(--color-accent); ${currentItem.splitChapters ? 'display:none;' : ''}">✓</span>
            </button>
          </div>
        </div>

        <!-- Botón: Dividir manual -->
        <button id="btn-manual-split" class="btn btn-secondary" style="padding:8px 16px; font-size:var(--font-size-body); gap:8px; border-radius:8px; transition: all 0.2s;" title="Abrir editor para dividir manualmente">
          <i class="fas fa-pencil-alt"></i> Dividir manual
        </button>

        <button id="btn-add-cover" class="btn btn-secondary" style="padding:8px 16px; font-size:var(--font-size-body); gap:8px; border-radius:8px;">
          <i class="fas fa-image"></i> <span id="add-cover-label">${currentItem.customCoverPath ? 'Portada seleccionada' : 'Subir portada'}</span>
        </button>

        <div style="flex:1;"></div>

        <!-- Botón: Añadir todo (principal) -->
        <button id="modal-add" class="btn btn-success" style="padding:8px 24px; font-size:var(--font-size-body); border-radius:8px; gap:8px; transition: all 0.2s;">
          <i class="fas fa-plus"></i> AÑADIR TODO
        </button>
      </div>
    `;

    // ===== CAMPO DE CAPÍTULOS MANUALES (COLAPSABLE) =====
    const manualChaptersHtml = `
      <details style="margin-top:12px;" ${manualChaptersText ? 'open' : ''}>
        <summary style="color:rgba(255,255,255,0.6); cursor:pointer; font-size:var(--font-size-body); user-select:none; transition: color 0.2s;">
          <i class="fas fa-pencil-alt"></i> Capítulos manuales (opcional)
          ${manualChaptersText ? '<span style="color:var(--color-accent); font-size:var(--font-size-caption);"> (cargados)</span>' : ''}
        </summary>
        <textarea id="manual-chapters" rows="4" placeholder="00:00 Intro&#10;03:26 Parte 1&#10;06:38 Parte 2&#10;01:13:43 Parte 3" style="width:100%; margin-top:8px; padding:10px 14px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06); border-radius:8px; color:var(--color-text); font-family:var(--font-family); font-size:var(--font-size-body); resize:vertical; outline:none; transition: border 0.2s;">${escapeMarkup(manualChaptersText)}</textarea>
        <div style="font-size:var(--font-size-caption); color:rgba(255,255,255,0.4); margin-top:4px;">
          Formato aceptado: <strong>MM:SS Título</strong> o <strong>HH:MM:SS Título</strong>. Separador opcional: <code>-</code>, <code>–</code>, <code>—</code>.<br>
          Ejemplo: <code>13:43 - Everytime We Say Goodbye</code> → 13 min 43 seg. <code>01:13:43 Título</code> → 1h 13min 43seg.
        </div>
      </details>
    `;

    // ===== HTML COMPLETO DEL MODAL =====
    const html = `
      <div class="modal-header">
        <div>
          <h2><i class="fas fa-plus-circle" style="color: var(--color-accent);"></i> Nueva descarga</h2>
          <p style="font-size:var(--font-size-body);">Pega enlaces de YouTube o Bandcamp (uno por línea). Spotify no está habilitado.</p>
        </div>
        <button id="modal-close-x" class="btn-icon" style="background:transparent; border:none; color:#FF5A5A; font-size:24px; cursor:pointer; padding:4px 10px; transition:color 0.2s;">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="modal-divider"></div>

      <!-- CONTROLES MODERNIZADOS -->
      ${controlsHtml}

      <!-- TEXTAREA DE URLS -->
      <div style="margin-bottom:16px;">
        <textarea id="add-url" rows="3" placeholder="https://www.youtube.com/...&#10;https://artist.bandcamp.com/album/..." style="width:100%; padding:14px 18px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06); border-radius:10px; color:var(--color-text); font-family:var(--font-family); font-size:var(--font-size-body); resize:vertical; outline:none; transition: border 0.2s;">${escapeMarkup(currentItem.url || '')}</textarea>
      </div>

      <!-- LISTA DE PREVISUALIZACIONES -->
      <div style="background:rgba(0,0,0,0.2); border-radius:10px; padding:12px; border:1px solid rgba(255,255,255,0.04); margin-bottom:12px; min-height:100px;">
        ${previewsHtml}
      </div>

      <!-- CAPÍTULOS MANUALES (COLAPSABLE) -->
      ${manualChaptersHtml}

      <!-- FOOTER DEL MODAL (SIN BOTÓN CANCELAR) -->
      <div class="modal-actions" style="justify-content:flex-end; margin-top:16px;">
      </div>
    `;

    elements.modalContent.innerHTML = html;

    // ===== ASIGNAR MANEJADORES DE ERROR DE IMAGEN =====
    document.querySelectorAll('.thumbnail-img').forEach(img => {
      img.addEventListener('error', function() {
        window.fixThumbnailError(this);
      });
    });
    document.querySelectorAll('.playlist-track-thumbnail').forEach(img => {
      img.addEventListener('error', function() {
        this.src = defaultThumb;
        this.onerror = null;
      });
    });

    // ============================================================
    //  ASIGNAR EVENTOS DEL MODAL
    // ============================================================

    document.getElementById('modal-close-x').addEventListener('click', closeModals);
    document.getElementById('modal-add').addEventListener('click', addFromModal);
    document.getElementById('btn-add-cover').addEventListener('click', async () => {
      try {
        const coverPath = await api.dialog.selectFile();
        if (!coverPath) return;
        currentItem.customCoverPath = coverPath;
        document.getElementById('add-cover-label').textContent = coverPath.split(/[\\/]/).pop();
        console.log('🖼️ Portada personalizada seleccionada');
      } catch (err) {
        Toast.error('Error al elegir portada', err.message);
      }
    });

    // Dividir manual
    document.getElementById('btn-manual-split').addEventListener('click', () => {
      const firstUrl = document.getElementById('add-url').value.trim().split('\n').map(s => s.trim()).filter(s => s)[0];
      if (firstUrl) {
        if (!firstUrl.includes('youtube.com') && !firstUrl.includes('youtu.be')) {
          Toast.warning('URL inválida', 'El enlace debe ser de YouTube.');
          return;
        }
        EditorManager.openEditor(firstUrl);
      } else {
        Toast.warning('Primero ingresa un enlace.', 'Carga un video antes de abrir el editor.');
      }
    });

    // ===== SUBMENÚ: SEPARAR EN PISTAS =====
    const btnSplit = document.getElementById('btn-split');
    const splitSubmenu = document.getElementById('split-submenu');
    let splitOpen = false;

    btnSplit.addEventListener('click', (e) => {
      e.stopPropagation();
      splitOpen = !splitOpen;
      splitSubmenu.style.display = splitOpen ? 'block' : 'none';
    });

    document.querySelectorAll('.split-option').forEach(btn => {
      btn.addEventListener('click', function() {
        const split = this.dataset.split === 'true';
        currentItem.splitChapters = split;
        document.getElementById('split-label').textContent = split ? 'Separar' : 'No separar';
        const icon = document.querySelector('#btn-split i');
        if (icon) icon.style.color = split ? 'var(--color-accent)' : '';
        btnSplit.style.borderColor = split ? 'var(--color-accent)' : '';
        document.getElementById('split-check-true').style.display = split ? 'inline' : 'none';
        document.getElementById('split-check-false').style.display = split ? 'none' : 'inline';
        splitSubmenu.style.display = 'none';
        splitOpen = false;
        console.log('✂️ Separar en pistas:', split);
      });
    });

    // Cerrar submenús al hacer clic fuera
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#btn-split') && !e.target.closest('#split-submenu')) {
        splitSubmenu.style.display = 'none';
        splitOpen = false;
      }
    });

    // ===== CHECKBOX DE PREVISUALIZACIÓN =====
    document.querySelectorAll('.preview-checkbox').forEach(cb => {
      cb.addEventListener('change', function(e) {
        const index = parseInt(this.dataset.index);
        if (!isNaN(index) && previewItems[index]) {
          previewItems[index].selected = this.checked;
          console.log(`📋 Preview ${index} seleccionado:`, this.checked);
        }
      });
    });

    // ===== BOTONES "PROCESAR" =====
    document.querySelectorAll('.process-btn').forEach(btn => {
      btn.addEventListener('click', function(e) {
        const index = parseInt(this.dataset.index);
        if (!isNaN(index) && previewItems[index]) {
          processPreview(index);
        }
      });
    });

    // ===== BOTONES "REINTENTAR" =====
    document.querySelectorAll('.retry-btn').forEach(btn => {
      btn.addEventListener('click', function(e) {
        const index = parseInt(this.dataset.index);
        if (!isNaN(index)) {
          retryPreview(index);
        }
      });
    });

    // ===== TEXTAREA DE URLS (DEBOUNCE) - SIN FETCH AUTOMÁTICO =====
    const urlInput = document.getElementById('add-url');
    if (urlInput) {
      urlInput.addEventListener('input', function() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const rawText = this.value.trim();
          const urls = rawText.split('\n').map(s => s.trim()).filter(s => s);
          previewItems = previewItems.filter(item => urls.includes(item.url));
          const existingUrls = new Set(previewItems.map(item => item.url));
          const newUrls = urls.filter(url => !existingUrls.has(url));
          
          if (newUrls.length > 0) {
            const newItems = newUrls.map(url => {
              const error = getUrlSupportMessage(url);
              return {
                url,
                data: null,
                error: error || null,
                selected: !error,
                loading: false,
                processed: Boolean(error),
              };
            });
            previewItems = [...newItems, ...previewItems];
          }
          if (newUrls.some(url => getUrlSupportMessage(url))) {
            Toast.show('Algunos enlaces no se procesarán. Actualmente se admite YouTube y Bandcamp.', 'warning');
          }
          
          renderAddModal();
        }, 800);
      });
    }

    // ===== SI YA HAY TEXTO AL ABRIR =====
    if (currentItem.url) {
      setTimeout(() => {
        const rawText = document.getElementById('add-url')?.value || '';
        if (rawText.trim()) {
          const urls = rawText.split('\n').map(s => s.trim()).filter(s => s);
          previewItems = previewItems.filter(item => urls.includes(item.url));
          const existingUrls = new Set(previewItems.map(item => item.url));
          const newUrls = urls.filter(url => !existingUrls.has(url));
          if (newUrls.length > 0) {
            const newItems = newUrls.map(url => {
              const error = getUrlSupportMessage(url);
              return {
                url,
                data: null,
                error: error || null,
                selected: !error,
                loading: false,
                processed: Boolean(error),
              };
            });
            previewItems = [...newItems, ...previewItems];
            renderAddModal();
          }
        }
      }, 500);
    }

    // ===== PRESERVAR TEXTO DE CAPÍTULOS MANUALES =====
    const manualTextarea = document.getElementById('manual-chapters');
    if (manualTextarea) {
      manualTextarea.addEventListener('input', function() {
        manualChaptersText = this.value;
      });
    }

    console.log('✅ Modal de agregar renderizado correctamente');
  }

  // ============================================================
  //  PROCESAR UN PREVIEW INDIVIDUAL (BAJO DEMANDA)
  // ============================================================
  async function processPreview(index) {
    if (index < 0 || index >= previewItems.length) return;
    const item = previewItems[index];
    if (!item || item.loading) return;
    if (item.processed && !item.error) return;

    const supportMessage = getUrlSupportMessage(item.url);
    if (supportMessage) {
      item.error = supportMessage;
      item.processed = true;
      item.selected = false;
      renderAddModal();
      return;
    }

    item.loading = true;
    item.error = null;
    renderAddModal();

    if (typeof window.showLoading === 'function') {
      window.showLoading(true, 'Obteniendo metadatos...', 0);
    }

    try {
      console.log(`🔍 Procesando: ${item.url}`);
      const data = await api.ytdlp.getMetadata(item.url);
      item.data = data;
      item.loading = false;
      item.processed = true;
      item.error = null;
      console.log(`✅ Metadatos obtenidos: ${data.title}`);
      console.log(`   Duración: ${data.duration} | Artista: ${data.artist || 'N/A'} | Playlist: ${data.isPlaylist || false}`);
    } catch (err) {
      item.loading = false;
      item.processed = true;
      item.error = err.message || 'Error al obtener metadatos';
      console.error(`❌ Error procesando ${item.url}:`, err);
    } finally {
      if (typeof window.showLoading === 'function') {
        window.showLoading(false);
      }
      renderAddModal();
    }
  }

  // ============================================================
  //  FETCH PREVIEWS (PROCESAMIENTO MÚLTIPLE - OPCIONAL)
  // ============================================================
  async function fetchPreviews(urls) {
    if (isFetching) return;
    isFetching = true;

    if (typeof window.showLoading === 'function') {
      window.showLoading(true, 'Obteniendo metadatos...', 0);
    }

    const urlsSet = new Set(urls);
    previewItems = previewItems.map(item => {
      if (urlsSet.has(item.url)) {
        return { ...item, loading: true, error: null };
      }
      return item;
    });
    renderAddModal();

    const total = urls.length;
    let completed = 0;

    const promises = urls.map(async (url) => {
      try {
        console.log(`🔍 Obteniendo metadatos para: ${url}`);
        const data = await api.ytdlp.getMetadata(url);
        const index = previewItems.findIndex(item => item.url === url);
        if (index !== -1) {
          previewItems[index].data = data;
          previewItems[index].loading = false;
          previewItems[index].processed = true;
          previewItems[index].error = null;
          console.log(`✅ Metadatos obtenidos: ${data.title}`);
        }
      } catch (err) {
        const index = previewItems.findIndex(item => item.url === url);
        if (index !== -1) {
          previewItems[index].loading = false;
          previewItems[index].processed = true;
          previewItems[index].error = err.message || 'Error al obtener metadatos';
          console.error(`❌ Error en preview de ${url}:`, err);
        }
      } finally {
        completed++;
        if (typeof window.updateLoadingProgress === 'function') {
          const percent = (completed / total) * 100;
          window.updateLoadingProgress(percent, `Obteniendo metadatos (${completed}/${total})`);
        }
        renderAddModal();
      }
    });

    await Promise.all(promises);
    isFetching = false;

    if (typeof window.showLoading === 'function') {
      window.showLoading(false);
    }

    console.log(`📊 Previsualización completada: ${previewItems.length} items`);
  }

  // ============================================================
  //  REINTENTAR PREVIEW
  // ============================================================
  function retryPreview(index) {
    if (index >= 0 && index < previewItems.length) {
      const item = previewItems[index];
      if (item) {
        previewItems[index].loading = false;
        previewItems[index].error = null;
        previewItems[index].processed = false;
        processPreview(index);
        console.log(`🔄 Reintentando preview ${index}: ${item.url}`);
      }
    }
  }

  // ============================================================
  //  SET CURRENT CHAPTERS (desde editor)
  // ============================================================
  function setCurrentChapters(chapters) {
    if (!chapters || chapters.length === 0) {
      currentItem.chapters = [];
      currentItem.splitChapters = false;
      const btnSplit = document.getElementById('btn-split');
      if (btnSplit) {
        document.getElementById('split-label').textContent = 'No separar';
        btnSplit.style.borderColor = '';
        const icon = btnSplit.querySelector('i');
        if (icon) icon.style.color = '';
        document.getElementById('split-check-true').style.display = 'none';
        document.getElementById('split-check-false').style.display = 'inline';
      }
      return;
    }
    currentItem.chapters = chapters.map(c => ({
      ...c,
      isSelected: c.isSelected !== undefined ? c.isSelected : true,
      collaborator: c.collaborator || '',
      trackNumber: c.trackNumber || '',
    }));
    currentItem.splitChapters = true;
    const btnSplit = document.getElementById('btn-split');
    if (btnSplit) {
      document.getElementById('split-label').textContent = 'Separar';
      btnSplit.style.borderColor = 'var(--color-accent)';
      const icon = btnSplit.querySelector('i');
      if (icon) icon.style.color = 'var(--color-accent)';
      document.getElementById('split-check-true').style.display = 'inline';
      document.getElementById('split-check-false').style.display = 'none';
    }
    console.log(`📥 Capítulos actualizados desde editor: ${currentItem.chapters.length}`);
  }

  // ============================================================
  //  VALIDAR CAPÍTULOS MANUALES
  // ============================================================
  function validateManualChapters(text) {
    const lines = text.split('\n').map(s => s.trim()).filter(s => s);
    
    if (lines.length === 0) {
      return { valid: false, error: 'No hay capítulos manuales. Escribe al menos una línea.' };
    }

    // Regex mejorado: acepta " - ", "-", "–", "—" como separadores opcionales
    // Formato: MM:SS o HH:MM:SS, separador opcional, título
    const regex = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*[-–—]?\s*(.+)$/;
    const errors = [];
    const parsed = [];

    console.log(`🔍 Validando ${lines.length} líneas de capítulos manuales...`);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(regex);
      
      if (!match) {
        const errMsg = `Línea ${i + 1}: "${line}" no tiene el formato correcto. Usa "MM:SS Título" o "HH:MM:SS Título".`;
        errors.push(errMsg);
        console.warn(`⚠️ ${errMsg}`);
        continue;
      }

      let start = 0;
      let isHoursFormat = false;

      if (match[3] !== undefined) {
        // Formato HH:MM:SS
        isHoursFormat = true;
        const hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const seconds = parseInt(match[3], 10);
        if (minutes >= 60 || seconds >= 60) {
          const errMsg = `Línea ${i + 1}: en formato HH:MM:SS, minutos y segundos deben ser menores a 60.`;
          errors.push(errMsg);
          console.warn(`⚠️ ${errMsg}`);
          continue;
        }
        start = hours * 3600 + minutes * 60 + seconds;
      } else {
        // Formato MM:SS
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        if (seconds >= 60) {
          const errMsg = `Línea ${i + 1}: los segundos deben ser menores a 60.`;
          errors.push(errMsg);
          console.warn(`⚠️ ${errMsg}`);
          continue;
        }
        start = minutes * 60 + seconds;
      }

      const title = match[4].trim();
      if (!title) {
        const errMsg = `Línea ${i + 1}: falta el título del capítulo.`;
        errors.push(errMsg);
        console.warn(`⚠️ ${errMsg}`);
        continue;
      }

      parsed.push({ start, title, line: i + 1, isHoursFormat });
      console.log(`   ✓ Línea ${i + 1}: ${title} @ ${start}s (${match[1]}:${match[2]}${match[3] ? ':' + match[3] : ''})`);
    }

    if (errors.length > 0) {
      return { 
        valid: false, 
        error: `Se encontraron ${errors.length} error(es) en los capítulos manuales.`,
        details: errors.join('\n'),
      };
    }

    if (parsed.length === 0) {
      return { valid: false, error: 'No se pudo interpretar ningún capítulo. Revisa el formato.', details: '' };
    }

    // Verificar orden ascendente
    for (let i = 1; i < parsed.length; i++) {
      if (parsed[i].start <= parsed[i - 1].start) {
        const errMsg = `Línea ${parsed[i].line}: el tiempo (${OMC.utils.formatTime(parsed[i].start)}) debe ser mayor que el capítulo anterior (${OMC.utils.formatTime(parsed[i - 1].start)}).`;
        return { 
          valid: false, 
          error: 'Los capítulos no están en orden ascendente.',
          details: errMsg,
        };
      }
    }

    console.log(`✅ Validación exitosa: ${parsed.length} capítulos válidos`);
    return { valid: true, chapters: parsed };
  }

  // ============================================================
  //  AÑADIR DESDE MODAL (PLAYLISTS COMO BLOQUE)
  // ============================================================
  async function addFromModal() {
    const selectedItems = previewItems.filter(item => 
      item.selected !== false && !item.error && item.data && item.processed
    );
    
    if (selectedItems.length === 0) {
      window.showChapterWarning('Sin elementos', 'No hay elementos válidos seleccionados. Procesa y selecciona al menos uno.');
      return;
    }

    const splitLabel = document.getElementById('split-label');
    const splitChapters = splitLabel ? splitLabel.textContent === 'Separar' : false;
    const manualText = document.getElementById('manual-chapters')?.value || '';
    // Guardar en variable de módulo para preservar
    manualChaptersText = manualText;

    // ===== VALIDACIÓN DE CAPÍTULOS MANUALES =====
    if (splitChapters && manualText.trim()) {
      console.log('📝 Validando capítulos manuales...');
      const validation = validateManualChapters(manualText);
      
      if (!validation.valid) {
        window.showChapterError(
          'Error en capítulos manuales',
          validation.error,
          validation.details || ''
        );
        const manualTextarea = document.getElementById('manual-chapters');
        if (manualTextarea) {
          const details = manualTextarea.closest('details');
          if (details) details.open = true;
          manualTextarea.focus();
          manualTextarea.style.borderColor = 'var(--color-error)';
          setTimeout(() => {
            manualTextarea.style.borderColor = '';
          }, 4000);
        }
        return;
      }
      console.log(`✅ Capítulos manuales validados: ${validation.chapters.length}`);
    }

    // Si "Separar" activo pero sin manuales ni automáticos
    if (splitChapters && !manualText.trim()) {
      const hasAutoChapters = selectedItems.some(item => 
        item.data?.chapters && item.data.chapters.length > 0
      );
      if (!hasAutoChapters) {
        window.showChapterError(
          'Faltan capítulos',
          'Seleccionaste "Separar en pistas" pero no hay capítulos manuales ni automáticos disponibles.',
          'Escribe capítulos manuales en el campo inferior o desactiva la opción "Separar en pistas".'
        );
        const manualTextarea = document.getElementById('manual-chapters');
        if (manualTextarea) {
          const details = manualTextarea.closest('details');
          if (details) details.open = true;
          manualTextarea.focus();
          manualTextarea.style.borderColor = 'var(--color-error)';
          setTimeout(() => {
            manualTextarea.style.borderColor = '';
          }, 4000);
        }
        return;
      }
    }

    // Mostrar overlay de carga
    if (typeof window.showLoading === 'function') {
      window.showLoading(true, 'Añadiendo elementos...', 0);
    }

    let addedCount = 0;
    const total = selectedItems.length;
    let processed = 0;

    for (const item of selectedItems) {
      processed++;
      try {
        if (typeof window.updateLoadingProgress === 'function') {
          window.updateLoadingProgress((processed / total) * 100, `Añadiendo ${item.data?.title || item.url}`);
        }

        const data = item.data;
        if (!data) {
          console.warn('⚠️ Datos no disponibles para', item.url);
          continue;
        }

        // Determinar capítulos
        let chapters = [];
        let split = false;
        if (!data.isPlaylist) {
          if (manualText.trim()) {
            // ✅ CORRECCIÓN CRÍTICA: parseTime en lugar de parseFloat
            const totalDuration = data.duration ? OMC.utils.parseTime(data.duration) : 0;
            console.log(`⏱️ Duración del video: "${data.duration}" → ${totalDuration}s (${OMC.utils.formatTime(totalDuration)})`);
            
            const manualChapters = parseManualChapters(manualText, totalDuration);
            console.log(`✂️ Capítulos parseados desde texto manual: ${manualChapters.length}`);
            
            if (manualChapters.length > 0) {
              chapters = manualChapters.map(c => ({ 
                ...c, 
                isSelected: true, 
                collaborator: '', 
                trackNumber: '' 
              }));
              split = true;
              // Log detallado de cada capítulo
              chapters.forEach((ch, idx) => {
                console.log(`   [${idx + 1}] "${ch.title}" | ${OMC.utils.formatTime(ch.start)} → ${OMC.utils.formatTime(ch.end)}`);
              });
            } else {
              window.showChapterError(
                'Error al parsear',
                'No se pudieron interpretar los capítulos manuales.',
                'Verifica el formato: MM:SS Título o HH:MM:SS Título'
              );
              if (typeof window.showLoading === 'function') {
                window.showLoading(false);
              }
              return;
            }
          } else if (splitChapters && data.chapters && data.chapters.length > 0) {
            chapters = data.chapters.map(c => ({ 
              ...c, 
              isSelected: true, 
              collaborator: '', 
              trackNumber: '' 
            }));
            split = true;
            console.log(`✂️ Usando ${chapters.length} capítulos automáticos de YouTube`);
          }
        } else {
          chapters = [];
          split = false;
          console.log(`📋 Playlist detectada: no se separan capítulos`);
        }

        const itemToAdd = {
          url: item.url,
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
          customCoverPath: currentItem.customCoverPath || '',
          status: 'En cola',
          isPlaylist: data.isPlaylist || false,
          entries: data.entries || [],
        };

        console.log(`📦 Añadiendo a cola: "${itemToAdd.title}" con ${chapters.length} capítulo(s)`);
        const added = QueueManager.addItem(itemToAdd);
        if (added) addedCount++;
      } catch (err) {
        console.error(`❌ Error añadiendo ${item.url}:`, err);
        if (typeof Swal !== 'undefined') {
          Swal.fire({
            icon: 'error',
            title: 'Error al añadir',
            text: err.message || 'Error desconocido',
            background: '#1a1a1a',
            color: '#fff',
            confirmButtonColor: '#00FF7B',
          });
        }
      }
    }

    if (typeof window.showLoading === 'function') {
      window.showLoading(false);
    }

    if (addedCount > 0) {
      closeModals();
      Toast.show(`✅ Se añadieron ${addedCount} elemento(s) a la cola.`, 'success');
      previewItems = [];
      manualChaptersText = '';
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
      console.log('🧹 Modal reseteado después de añadir');
    } else {
      window.showChapterWarning('Sin cambios', 'No se pudo añadir ningún elemento.');
    }
  }

  // ============================================================
  //  PARSEAR CAPÍTULOS MANUALES (CORREGIDO)
  // ============================================================
  function parseManualChapters(text, totalDuration) {
    const lines = text.split('\n').map(s => s.trim()).filter(s => s);
    const chapters = [];
    // Regex mejorado: acepta " - ", "-", "–", "—" como separadores
    const regex = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*[-–—]?\s*(.+)$/;
    
    console.log(`🔧 parseManualChapters: ${lines.length} líneas, duración total: ${totalDuration}s`);
    
    for (const line of lines) {
      const match = line.match(regex);
      if (!match) {
        console.warn(`   ⚠️ Línea ignorada (no coincide regex): "${line}"`);
        continue;
      }

      let start = 0;
      let title = match[4].trim();

      if (match[3] !== undefined) {
        // HH:MM:SS
        const hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const seconds = parseInt(match[3], 10);
        start = hours * 3600 + minutes * 60 + seconds;
      } else {
        // MM:SS
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        start = minutes * 60 + seconds;
      }

      if (start < 0) {
        console.warn(`   ⚠️ Capítulo "${title}" descartado: start negativo`);
        continue;
      }

      // Solo descartar si tenemos una duración válida Y el capítulo empieza después
      if (totalDuration > 0 && start >= totalDuration) {
        console.warn(`   ⚠️ Capítulo "${title}" descartado: empieza en ${start}s (${OMC.utils.formatTime(start)}) pero la duración es ${totalDuration}s (${OMC.utils.formatTime(totalDuration)})`);
        continue;
      }

      chapters.push({ 
        title, 
        start, 
        end: 0, 
        isSelected: true, 
        videoUrl: '' 
      });
      console.log(`   ✓ Capítulo añadido: "${title}" @ ${start}s`);
    }

    if (chapters.length === 0) {
      console.warn('   ❌ No se generó ningún capítulo');
      return chapters;
    }

    chapters.sort((a, b) => a.start - b.start);

    for (let i = 0; i < chapters.length; i++) {
      const nextStart = (i + 1 < chapters.length) ? chapters[i + 1].start : (totalDuration || 0);
      chapters[i].end = nextStart;
    }

    console.log(`   ✅ Total capítulos parseados: ${chapters.length}`);
    return chapters;
  }

  // ============================================================
  //  MODAL DE EDICIÓN
  // ============================================================
  function openEdit(item) {
    if (item.isCompleted || item.isDownloading) {
      Toast.error('No se puede editar', 'No se puede editar durante la descarga o si ya está completado.');
      return;
    }
    itemToEdit = item;
    showModal('edit');
    console.log('✏️ Modal de edición abierto para:', item.title);
  }

  function renderEditModal() {
    if (!itemToEdit) return;
    const item = itemToEdit;
    const isPlaylist = item.isPlaylist || false;
    const hasChapters = !isPlaylist && item.chapters && item.chapters.length > 0;
    const entries = isPlaylist ? (item.entries || []) : [];

    let html = `
      <div class="modal-header">
        <div>
          <h2><i class="fas fa-edit" style="color: var(--color-info);"></i> Editar Metadatos</h2>
          <p style="font-size:var(--font-size-body);">
            ${isPlaylist ? 'Metadatos globales para la playlist. Las pistas se muestran abajo.' : 
              (hasChapters ? 'Los metadatos globales se aplicarán a todas las pistas.' : 'Edita los metadatos de la pista.')}
          </p>
        </div>
        <button id="modal-close-x" class="btn-icon" style="background:transparent; border:none; color:#FF5A5A; font-size:24px; cursor:pointer; padding:4px 10px;">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="modal-divider"></div>
    `;

    html += `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
        ${(!hasChapters && !isPlaylist) ? `
          <input type="text" id="edit-title" placeholder="Título" value="${escapeMarkup(item.title || '')}" style="padding:10px 14px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06); border-radius:8px; color:var(--color-text); font-family:var(--font-family); font-size:var(--font-size-body);">
        ` : ''}
        <input type="text" id="edit-artist" placeholder="Intérpretes" value="${escapeMarkup(item.artist || '')}" style="padding:10px 14px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06); border-radius:8px; color:var(--color-text); font-family:var(--font-family); font-size:var(--font-size-body);">
        <input type="text" id="edit-album" placeholder="Álbum" value="${escapeMarkup(item.album || '')}" style="padding:10px 14px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06); border-radius:8px; color:var(--color-text); font-family:var(--font-family); font-size:var(--font-size-body);">
        <input type="text" id="edit-albumartist" placeholder="Intérprete del Álbum" value="${escapeMarkup(item.albumArtist || '')}" style="padding:10px 14px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06); border-radius:8px; color:var(--color-text); font-family:var(--font-family); font-size:var(--font-size-body);">
        <input type="text" id="edit-genre" placeholder="Género" value="${escapeMarkup(item.genre || '')}" style="padding:10px 14px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06); border-radius:8px; color:var(--color-text); font-family:var(--font-family); font-size:var(--font-size-body);">
        <input type="text" id="edit-year" placeholder="Año" value="${escapeMarkup(item.year || '')}" style="padding:10px 14px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06); border-radius:8px; color:var(--color-text); font-family:var(--font-family); font-size:var(--font-size-body);">
        <input type="text" id="edit-collaborator" placeholder="Colaborador (global)" value="${escapeMarkup(item.collaborators || item.artist || '')}" style="padding:10px 14px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06); border-radius:8px; color:var(--color-text); font-family:var(--font-family); font-size:var(--font-size-body);">
        ${(!hasChapters && !isPlaylist) ? `
          <input type="text" id="edit-track" placeholder="Núm. de Pista" value="${escapeMarkup(item.trackNumber || '')}" style="padding:10px 14px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06); border-radius:8px; color:var(--color-text); font-family:var(--font-family); font-size:var(--font-size-body);">
        ` : ''}
      </div>
    `;

    html += `
      <div style="display:flex; align-items:center; gap:16px; margin-bottom:16px; padding:8px 12px; background:rgba(255,255,255,0.02); border-radius:8px; border:1px solid rgba(255,255,255,0.04);">
        <span style="color:rgba(255,255,255,0.6); font-size:var(--font-size-body);"><i class="fas fa-image"></i> Portada:</span>
        <button id="btn-cover" class="btn btn-secondary" style="padding:6px 16px; font-size:var(--font-size-body);"><i class="fas fa-upload"></i> Seleccionar</button>
        <span id="cover-filename" style="color:rgba(255,255,255,0.4); font-size:var(--font-size-caption);">${escapeMarkup(item.customCoverPath ? item.customCoverPath.split(/[\\/]/).pop() : 'Ninguna')}</span>
      </div>
    `;

    if (hasChapters) {
      html += `
        <div style="margin-top:8px; background:rgba(0,0,0,0.15); border-radius:8px; padding:12px; max-height:240px; overflow-y:auto;">
          <div style="display:grid; grid-template-columns: 2fr 0.6fr 0.6fr 0.4fr 36px; gap:8px; padding:4px 8px; margin-bottom:6px; color:rgba(255,255,255,0.5); font-size:var(--font-size-caption); font-weight:600; border-bottom:1px solid rgba(255,255,255,0.04);">
            <span>Título</span>
            <span style="text-align:center;">Inicio</span>
            <span style="text-align:center;">Fin</span>
            <span style="text-align:center;">#</span>
            <span></span>
          </div>
          <div id="edit-chapters-list">
            ${item.chapters.map((ch, idx) => `
              <div class="chapter-row" data-idx="${idx}" style="display:grid; grid-template-columns: 2fr 0.6fr 0.6fr 0.4fr 36px; gap:8px; align-items:center; margin-bottom:4px;">
                <input type="text" placeholder="Título" value="${escapeMarkup(ch.title || '')}" style="padding:6px 8px; border-radius:6px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.04); color:var(--color-text); font-size:var(--font-size-body);">
                <input type="text" placeholder="Inicio" value="${OMC.utils.formatTime(ch.start)}" style="padding:6px 4px; border-radius:6px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.04); color:var(--color-text); font-size:var(--font-size-body); text-align:center; width:100%;">
                <input type="text" placeholder="Fin" value="${OMC.utils.formatTime(ch.end)}" style="padding:6px 4px; border-radius:6px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.04); color:var(--color-text); font-size:var(--font-size-body); text-align:center; width:100%;">
                <input type="text" placeholder="#" value="${idx + 1}" readonly style="padding:6px 4px; border-radius:6px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.02); color:rgba(255,255,255,0.5); font-size:var(--font-size-body); text-align:center;">
                <button class="delete-chapter" style="background:transparent; border:none; color:var(--color-error); cursor:pointer; font-size:16px; padding:4px;">
                  <i class="fas fa-trash-alt"></i>
                </button>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    if (isPlaylist && entries.length > 0) {
      html += `
        <div style="margin-top:8px; background:rgba(0,0,0,0.15); border-radius:8px; padding:12px; max-height:240px; overflow-y:auto;">
          <div style="display:grid; grid-template-columns: 0.4fr 2.6fr; gap:8px; padding:4px 8px; margin-bottom:6px; color:rgba(255,255,255,0.5); font-size:var(--font-size-caption); font-weight:600; border-bottom:1px solid rgba(255,255,255,0.04);">
            <span>Nº</span>
            <span>Título</span>
          </div>
          <div id="edit-playlist-entries">
            ${entries.map((entry, idx) => `
              <div class="playlist-entry-row" data-idx="${idx}" style="display:grid; grid-template-columns: 0.4fr 2.6fr; gap:8px; align-items:center; margin-bottom:4px;">
                <span style="color:rgba(255,255,255,0.5); font-size:var(--font-size-body); text-align:center;">${idx + 1}</span>
                <input type="text" placeholder="Título de la pista" value="${escapeMarkup(entry.title || '')}" style="padding:6px 8px; border-radius:6px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.04); color:var(--color-text); font-size:var(--font-size-body); width:100%;">
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    html += `
      <div class="modal-actions" style="justify-content:flex-end; margin-top:16px;">
        <button id="modal-save" class="btn btn-success"><i class="fas fa-save"></i> GUARDAR</button>
      </div>
    `;

    elements.modalContent.innerHTML = html;

    document.getElementById('modal-close-x').addEventListener('click', closeModals);
    document.getElementById('modal-save').addEventListener('click', saveEdit);
    document.getElementById('btn-cover').addEventListener('click', selectCoverFile);

    document.querySelectorAll('.delete-chapter').forEach(btn => {
      btn.addEventListener('click', function() {
        const row = this.closest('.chapter-row');
        if (row) {
          row.remove();
          renumberChapterRows();
        }
      });
    });

    if (hasChapters) renumberChapterRows();
  }

  function renumberChapterRows() {
    const rows = document.querySelectorAll('#edit-chapters-list .chapter-row');
    rows.forEach((row, idx) => {
      const trackInput = row.querySelector('input[placeholder="#"]');
      if (trackInput) trackInput.value = idx + 1;
    });
  }

  // ============================================================
  //  GUARDAR EDICIÓN
  // ============================================================
  function saveEdit() {
    if (!itemToEdit) return;
    const item = itemToEdit;
    const isPlaylist = item.isPlaylist || false;
    const hasChapters = !isPlaylist && item.chapters && item.chapters.length > 0;

    const artist = document.getElementById('edit-artist')?.value.trim() || '';
    const album = document.getElementById('edit-album')?.value.trim() || '';
    const albumArtist = document.getElementById('edit-albumartist')?.value.trim() || '';
    const genre = document.getElementById('edit-genre')?.value.trim() || '';
    const year = document.getElementById('edit-year')?.value.trim() || '';
    const collaboratorGlobal = document.getElementById('edit-collaborator')?.value.trim() || '';

    let updatedItem = {
      artist: artist || item.artist,
      album: album || item.album,
      albumArtist: albumArtist || item.albumArtist,
      genre: genre || item.genre,
      year: year || item.year,
      collaborators: collaboratorGlobal || item.collaborators,
    };

    const coverPath = document.getElementById('edit-cover-path')?.value;
    if (coverPath) updatedItem.customCoverPath = coverPath;

    if (hasChapters) {
      const chapterRows = document.querySelectorAll('#edit-chapters-list .chapter-row');
      const newChapters = [];
      chapterRows.forEach((row, idx) => {
        const titleInput = row.querySelector('input[placeholder="Título"]');
        const startInput = row.querySelector('input[placeholder="Inicio"]');
        const endInput = row.querySelector('input[placeholder="Fin"]');
        if (titleInput && titleInput.value.trim()) {
          const start = OMC.utils.parseTime(startInput?.value || '0');
          const end = OMC.utils.parseTime(endInput?.value || '0');
          newChapters.push({
            title: titleInput.value.trim(),
            collaborator: '',
            trackNumber: (idx + 1).toString(),
            start: start,
            end: end,
            isSelected: true,
            videoUrl: item.chapters[idx]?.videoUrl || '',
          });
        }
      });
      updatedItem.chapters = newChapters;
      updatedItem.splitChapters = newChapters.length > 0;
    }

    if (isPlaylist) {
      const entryRows = document.querySelectorAll('#edit-playlist-entries .playlist-entry-row');
      const newEntries = [];
      entryRows.forEach((row, idx) => {
        const titleInput = row.querySelector('input[placeholder="Título de la pista"]');
        if (titleInput && titleInput.value.trim()) {
          newEntries.push({
            title: titleInput.value.trim(),
            ...(item.entries[idx] || {})
          });
        }
      });
      updatedItem.entries = newEntries;
    }

    if (!hasChapters && !isPlaylist) {
      const title = document.getElementById('edit-title')?.value.trim() || '';
      const trackNumber = document.getElementById('edit-track')?.value.trim() || '';
      updatedItem.title = title || item.title;
      updatedItem.trackNumber = trackNumber || item.trackNumber;
      updatedItem.chapters = [];
      updatedItem.splitChapters = false;
    }

    QueueManager.updateItem(item.id, updatedItem);
    closeModals();
    Toast.show('✅ Metadatos actualizados correctamente.', 'success');
    console.log('💾 Metadatos guardados para:', item.title);
  }

  // ============================================================
  //  SELECCIONAR PORTADA
  // ============================================================
  async function selectCoverFile() {
    const result = await api.dialog.selectFile();
    if (result) {
      const filename = result.split('/').pop();
      document.getElementById('cover-filename').textContent = filename;
      let hidden = document.getElementById('edit-cover-path');
      if (!hidden) {
        hidden = document.createElement('input');
        hidden.id = 'edit-cover-path';
        hidden.type = 'hidden';
        const modalContent = document.getElementById('modal-content');
        if (modalContent) modalContent.appendChild(hidden);
      }
      hidden.value = result;
      Toast.show('Portada seleccionada', 'success');
      console.log('🖼️ Portada seleccionada:', filename);
    }
  }

  // ============================================================
  //  MOSTRAR/CERRAR MODALES
  // ============================================================
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
    console.log('🔒 Modal cerrado');
  }

  // ============================================================
  //  EXPOSICIÓN PÚBLICA
  // ============================================================
  return {
    init,
    openAdd,
    openEdit,
    closeModals,
    setCurrentChapters,
    retryPreview,
    processPreview,
    fetchPreviews,
    validateManualChapters,
    parseManualChapters,
  };
})();

window.OMC = window.OMC || {};
window.OMC.modal = ModalManager;

console.log('📦 ModalManager cargado correctamente');