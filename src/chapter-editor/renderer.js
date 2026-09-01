/**
 * renderer.js - Editor de capítulos con reproductor de audio HTML5
 * Versión final: clic simple = 1 unidad, mantenido = repetición con delay inicial.
 */

(function() {
  if (window.__editorLoaded) return;
  window.__editorLoaded = true;

  const api = window.api;
  if (!api) {
    console.error('❌ API no disponible');
    return;
  }

  console.log('📝 Editor de capítulos iniciado (modo audio)');

  // ===== DOM =====
  const $ = (id) => document.getElementById(id);
  const dom = {
    audio: $('audio-player'),
    progressFill: $('progress-fill'),
    chapterMarkers: $('chapter-markers'),
    currentTimeDisplay: $('current-time'),
    totalDurationDisplay: $('total-duration'),
    btnPlay: $('btn-play'),
    btnPause: $('btn-pause'),
    btnMarkStart: $('btn-mark-start'),
    btnMarkEnd: $('btn-mark-end'),
    manualStart: $('manual-start'),
    manualEnd: $('manual-end'),
    chaptersList: $('chapters-list'),
    btnAdd: $('btn-add'),
    btnSave: $('btn-save'),
    btnCancel: $('btn-cancel'),
    btnClose: $('btn-close'),
    loadingOverlay: $('loading-overlay'),
    progressBar: $('progress-bar'),
    loaderProgressBar: $('loader-progress-bar'),
    loaderPercent: $('loader-percent'),
    loaderText: document.querySelector('.loader-text'),
  };

  // ===== ESTADO =====
  const state = {
    videoId: '',
    videoUrl: '',
    audioPath: '',
    currentTime: 0,
    totalDuration: 0,
    isPlaying: false,
    chapters: [],
    activeChapterRow: null,
    progressInterval: null,
    isSeeking: false,
    isUpdating: false,
    isLoading: false,
    audioTempPath: null,
  };

  // ============================================================
  //  FUNCIONES DE TIEMPO (PARSEO ROBUSTO)
  // ============================================================

  function formatTime(seconds) {
    if (!seconds || seconds < 0) return '00:00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  function parseTime(str) {
    if (!str) return 0;
    const trimmed = str.trim();
    if (trimmed === '') return 0;

    if (trimmed.includes(':')) {
      const parts = trimmed.split(':').map(Number);
      if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
      } else if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
      }
      return 0;
    }

    if (/^\d+$/.test(trimmed)) {
      const num = parseInt(trimmed, 10);
      const len = trimmed.length;
      if (len <= 2) {
        return Math.min(num, 59);
      } else if (len <= 4) {
        const s = num % 100;
        const m = Math.floor(num / 100);
        return Math.min(m, 59) * 60 + Math.min(s, 59);
      } else {
        const s = num % 100;
        const m = Math.floor((num % 10000) / 100);
        const h = Math.floor(num / 10000);
        return h * 3600 + Math.min(m, 59) * 60 + Math.min(s, 59);
      }
    }
    return 0;
  }

  function validateTime(seconds) {
    if (state.totalDuration > 0 && seconds > state.totalDuration) {
      showToast(`Tiempo excede la duración total (${formatTime(state.totalDuration)})`, 'warning');
      return Math.min(seconds, state.totalDuration);
    }
    return Math.max(0, seconds);
  }

  function extractVideoId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    if (match && match[2] && match[2].length === 11) return match[2];
    try {
      const urlParams = new URLSearchParams(new URL(url).search);
      return urlParams.get('v') || '';
    } catch (e) {
      return '';
    }
  }

  // ============================================================
  //  FUNCIÓN PARA AJUSTAR SEGÚN UNIDAD SELECCIONADA
  // ============================================================

  function adjustTimeBySelection(input, direction, onUpdate) {
    let start = input.selectionStart;
    let end = input.selectionEnd;
    if (start === null) start = 0;
    if (end === null) end = start;

    let unit = 'seconds';
    if (start <= 2 && end <= 2) {
      unit = 'hours';
    } else if (start > 2 && start <= 5 && end > 2 && end <= 5) {
      unit = 'minutes';
    } else if (start > 5) {
      unit = 'seconds';
    } else {
      if (start <= 2) unit = 'hours';
      else if (start <= 5) unit = 'minutes';
      else unit = 'seconds';
    }

    let seconds = parseTime(input.value);
    let h = Math.floor(seconds / 3600);
    let m = Math.floor((seconds % 3600) / 60);
    let s = Math.floor(seconds % 60);

    if (unit === 'hours') {
      h = Math.max(0, h + direction);
    } else if (unit === 'minutes') {
      m = Math.max(0, Math.min(59, m + direction));
    } else {
      s = Math.max(0, Math.min(59, s + direction));
    }

    let newSeconds = h * 3600 + m * 60 + s;
    newSeconds = validateTime(newSeconds);

    input.value = formatTime(newSeconds);
    input.dispatchEvent(new Event('change', { bubbles: true }));
    if (onUpdate) onUpdate(newSeconds);

    let newStart, newEnd;
    switch (unit) {
      case 'hours':
        newStart = 0;
        newEnd = 2;
        break;
      case 'minutes':
        newStart = 3;
        newEnd = 5;
        break;
      case 'seconds':
        newStart = 6;
        newEnd = 8;
        break;
      default:
        newStart = 6;
        newEnd = 8;
    }
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(newStart, newEnd);
    });
  }

  // ============================================================
  //  CONFIGURACIÓN DE BOTONES DE TIEMPO (CORREGIDO)
  // ============================================================

  function configureTimeButtons(input, upBtn, downBtn, onUpdate) {
    // Parámetros de repetición
    const DELAY_BEFORE_REPEAT = 400;   // ms antes de empezar a repetir
    const REPEAT_INTERVAL = 300;       // ms entre repeticiones

    // Evento click: ajuste de una unidad (simple)
    upBtn.addEventListener('click', (e) => {
      e.preventDefault();
      input.focus();
      adjustTimeBySelection(input, 1, onUpdate);
    });
    downBtn.addEventListener('click', (e) => {
      e.preventDefault();
      input.focus();
      adjustTimeBySelection(input, -1, onUpdate);
    });

    // Variables para el mantenimiento
    let timeoutId = null;
    let intervalId = null;

    const startHold = (direction) => {
      // Limpiar cualquier temporizador previo
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }

      input.focus();

      // Programar el inicio de la repetición después del delay
      timeoutId = setTimeout(() => {
        // Ahora comenzamos la repetición periódica
        intervalId = setInterval(() => {
          adjustTimeBySelection(input, direction, onUpdate);
        }, REPEAT_INTERVAL);
        // La primera repetición se hace en el próximo intervalo
        // Para que no haya retraso extra, ejecutamos una vez ahora
        adjustTimeBySelection(input, direction, onUpdate);
      }, DELAY_BEFORE_REPEAT);
    };

    const stopHold = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    // Eventos de ratón
    upBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startHold(1);
    });
    upBtn.addEventListener('mouseup', stopHold);
    upBtn.addEventListener('mouseleave', stopHold);
    downBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startHold(-1);
    });
    downBtn.addEventListener('mouseup', stopHold);
    downBtn.addEventListener('mouseleave', stopHold);

    // Eventos táctiles
    upBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      startHold(1);
    }, { passive: false });
    upBtn.addEventListener('touchend', stopHold);
    upBtn.addEventListener('touchcancel', stopHold);
    downBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      startHold(-1);
    }, { passive: false });
    downBtn.addEventListener('touchend', stopHold);
    downBtn.addEventListener('touchcancel', stopHold);

    // Limpiar al perder foco de la ventana
    window.addEventListener('blur', stopHold);
  }

  // ============================================================
  //  TOAST Y ERRORES
  // ============================================================

  function showToast(message, type = 'info') {
    Swal.fire({
      icon: type,
      title: message,
      toast: true,
      position: 'bottom-end',
      showConfirmButton: false,
      timer: 2500,
      background: 'var(--color-background)',
      color: 'var(--color-text)',
    });
  }

  function showError(title, message) {
    return Swal.fire({
      icon: 'error',
      title: title,
      text: message,
      confirmButtonColor: '#00FF7B',
      background: 'var(--color-background)',
      color: 'var(--color-text)',
      confirmButtonText: 'Abrir en navegador',
      showCancelButton: true,
      cancelButtonText: 'Cancelar',
    }).then((result) => {
      if (result.isConfirmed && state.videoId) {
        api.shell.openPath(`https://www.youtube.com/watch?v=${state.videoId}`);
      }
      return result;
    });
  }

  // ============================================================
  //  INICIALIZAR REPRODUCTOR DE AUDIO
  // ============================================================

  function initAudio() {
    const audio = dom.audio;
    if (!audio) return;

    audio.addEventListener('loadedmetadata', () => {
      state.totalDuration = audio.duration;
      dom.totalDurationDisplay.textContent = formatTime(state.totalDuration);
      renderMarkers();
      console.log('📏 Duración total:', state.totalDuration);
    });

    audio.addEventListener('timeupdate', () => {
      if (state.isSeeking) return;
      state.currentTime = audio.currentTime;
      updateProgressDisplay();
    });

    audio.addEventListener('play', () => {
      state.isPlaying = true;
      dom.btnPlay.style.display = 'none';
      dom.btnPause.style.display = 'inline-flex';
    });

    audio.addEventListener('pause', () => {
      state.isPlaying = false;
      dom.btnPlay.style.display = 'inline-flex';
      dom.btnPause.style.display = 'none';
    });

    audio.addEventListener('ended', () => {
      state.isPlaying = false;
      dom.btnPlay.style.display = 'inline-flex';
      dom.btnPause.style.display = 'none';
    });
  }

  function updateProgressDisplay() {
    if (!dom.progressFill) return;
    const percent = (state.currentTime / state.totalDuration) * 100 || 0;
    dom.progressFill.style.width = Math.min(100, percent) + '%';
    dom.currentTimeDisplay.textContent = formatTime(state.currentTime);
    if (document.activeElement !== dom.manualStart) {
      dom.manualStart.value = formatTime(Math.round(state.currentTime));
    }
    highlightActiveChapter();
  }

  // ============================================================
  //  REPRODUCIR / PAUSAR
  // ============================================================

  function togglePlay() {
    if (state.isPlaying) {
      dom.audio.pause();
    } else {
      dom.audio.play();
    }
  }

  // ============================================================
  //  SEEK CON ARRASTRE
  // ============================================================

  let isDragging = false;

  function seekTo(clientX) {
    if (!state.totalDuration) return;
    const rect = dom.progressBar.getBoundingClientRect();
    const percent = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    const target = (percent / 100) * state.totalDuration;
    dom.audio.currentTime = target;
    state.currentTime = target;
    updateProgressDisplay();
  }

  dom.progressBar.addEventListener('mousedown', (e) => {
    isDragging = true;
    seekTo(e.clientX);
  });

  window.addEventListener('mousemove', (e) => {
    if (isDragging) {
      seekTo(e.clientX);
    }
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // ============================================================
  //  MARCAR INICIO / FIN
  // ============================================================

  function markStart() {
    const time = state.currentTime;
    const selectedRow = getSelectedChapterRow();
    if (selectedRow) {
      const startInput = selectedRow.querySelector('.ch-start');
      startInput.value = formatTime(time);
      startInput.dispatchEvent(new Event('change'));
      updateChapterFromRow(selectedRow);
      showToast('Inicio actualizado', 'success');
    } else {
      addChapterFromCurrentTime(time);
    }
  }

  function markEnd() {
    const time = state.currentTime;
    const selectedRow = getSelectedChapterRow();
    if (selectedRow) {
      const endInput = selectedRow.querySelector('.ch-end');
      const start = parseTime(selectedRow.querySelector('.ch-start').value);
      if (time <= start) {
        showToast('El fin debe ser mayor que el inicio', 'warning');
        return;
      }
      if (time > state.totalDuration) {
        showToast('El fin excede la duración total', 'warning');
        return;
      }
      endInput.value = formatTime(time);
      endInput.dispatchEvent(new Event('change'));
      updateChapterFromRow(selectedRow);
      showToast('Fin actualizado', 'success');
      autoFillPreviousEnd();
    } else {
      showToast('Selecciona un capítulo o marca inicio primero', 'warning');
    }
  }

  function getSelectedChapterRow() {
    const rows = dom.chaptersList.querySelectorAll('.chapter-row');
    for (let row of rows) {
      if (row.classList.contains('active')) return row;
    }
    return null;
  }

  // ============================================================
  //  AGREGAR CAPÍTULO DESDE TIEMPO ACTUAL
  // ============================================================

  function addChapterFromCurrentTime(time) {
    if (time > state.totalDuration) {
      showToast('El inicio no puede exceder la duración total', 'warning');
      return;
    }

    const row = document.createElement('div');
    row.className = 'chapter-row';
    row.innerHTML = `
      <span class="ch-track">${state.chapters.length + 1}</span>
      <input type="text" placeholder="Título" class="ch-title" value="Pista ${state.chapters.length + 1}" />
      <div class="time-group-row">
        <input type="text" placeholder="Inicio" class="ch-start" value="${formatTime(time)}" readonly />
        <div class="time-btn-group-row">
          <button class="time-btn-row" data-dir="1"><i class="fas fa-chevron-up"></i></button>
          <button class="time-btn-row" data-dir="-1"><i class="fas fa-chevron-down"></i></button>
        </div>
      </div>
      <div class="time-group-row">
        <input type="text" placeholder="Fin" class="ch-end" readonly />
        <div class="time-btn-group-row">
          <button class="time-btn-row" data-dir="1"><i class="fas fa-chevron-up"></i></button>
          <button class="time-btn-row" data-dir="-1"><i class="fas fa-chevron-down"></i></button>
        </div>
      </div>
      <div class="chapter-actions">
        <button class="play-chapter-btn" title="Reproducir capítulo"><i class="fas fa-play"></i></button>
        <button class="delete-chapter" title="Eliminar"><i class="fas fa-trash-alt"></i></button>
      </div>
    `;
    dom.chaptersList.appendChild(row);

    if (state.chapters.length > 0) {
      const prevRow = dom.chaptersList.children[state.chapters.length - 1];
      const prevEndInput = prevRow.querySelector('.ch-end');
      const prevEnd = parseTime(prevEndInput.value);
      if (prevEnd === 0 || prevEnd <= parseTime(prevRow.querySelector('.ch-start').value)) {
        prevEndInput.value = formatTime(time);
        prevEndInput.dispatchEvent(new Event('change'));
        updateChapterFromRow(prevRow);
      }
    }

    const chapter = { title: `Pista ${state.chapters.length + 1}`, start: time, end: 0 };
    state.chapters.push(chapter);

    setupChapterRowEvents(row);
    reorderTrackNumbers();
    row.querySelector('.ch-title').focus();
    renderMarkers();
    selectChapterRow(row);
    showToast('Capítulo añadido', 'success');
  }

  // ============================================================
  //  ACTUALIZAR CAPÍTULO DESDE UNA FILA
  // ============================================================

  function updateChapterFromRow(row) {
    const idx = Array.from(dom.chaptersList.children).indexOf(row);
    if (idx === -1) return;
    const ch = state.chapters[idx];
    const titleInput = row.querySelector('.ch-title');
    const startInput = row.querySelector('.ch-start');
    const endInput = row.querySelector('.ch-end');

    ch.title = titleInput.value;
    let start = parseTime(startInput.value);
    let end = parseTime(endInput.value);

    if (state.totalDuration > 0) {
      if (start > state.totalDuration) {
        start = state.totalDuration;
        startInput.value = formatTime(start);
        showToast('Inicio ajustado a la duración total', 'warning');
      }
      if (end > state.totalDuration) {
        end = state.totalDuration;
        endInput.value = formatTime(end);
        showToast('Fin ajustado a la duración total', 'warning');
      }
    }

    ch.start = start;
    ch.end = end;
    validateChapterRow(row);
    renderMarkers();
    autoFillPreviousEnd();

    if (row.classList.contains('active')) {
      dom.manualStart.value = formatTime(start);
      dom.manualEnd.value = formatTime(end);
    }
  }

  function validateChapterRow(row) {
    const start = parseTime(row.querySelector('.ch-start').value);
    const end = parseTime(row.querySelector('.ch-end').value);
    if (end > 0 && start >= end) {
      row.style.borderColor = 'var(--color-error)';
    } else {
      row.style.borderColor = '';
    }
  }

  function autoFillPreviousEnd() {
    const rows = dom.chaptersList.querySelectorAll('.chapter-row');
    for (let i = 0; i < rows.length - 1; i++) {
      const currentEnd = parseTime(rows[i].querySelector('.ch-end').value);
      const nextStart = parseTime(rows[i + 1].querySelector('.ch-start').value);
      if (currentEnd > 0 && nextStart > 0 && currentEnd > nextStart) {
        const nextStartInput = rows[i + 1].querySelector('.ch-start');
        nextStartInput.value = formatTime(currentEnd);
        nextStartInput.dispatchEvent(new Event('change'));
        updateChapterFromRow(rows[i + 1]);
      }
    }
  }

  // ============================================================
  //  SELECCIONAR FILA (actualiza controles principales)
  // ============================================================

  function selectChapterRow(row) {
    dom.chaptersList.querySelectorAll('.chapter-row').forEach(r => r.classList.remove('active'));
    row.classList.add('active');
    state.activeChapterRow = row;
    const start = parseTime(row.querySelector('.ch-start').value);
    const end = parseTime(row.querySelector('.ch-end').value);
    dom.manualStart.value = formatTime(start);
    dom.manualEnd.value = formatTime(end);
  }

  // ============================================================
  //  CONFIGURAR EVENTOS DE UNA FILA DE CAPÍTULO
  // ============================================================

  function setupChapterRowEvents(row) {
    const startInput = row.querySelector('.ch-start');
    const endInput = row.querySelector('.ch-end');
    const titleInput = row.querySelector('.ch-title');

    const startUpBtn = row.querySelector('.time-group-row:first-child .time-btn-row[data-dir="1"]');
    const startDownBtn = row.querySelector('.time-group-row:first-child .time-btn-row[data-dir="-1"]');
    if (startUpBtn && startDownBtn) {
      configureTimeButtons(startInput, startUpBtn, startDownBtn, (seconds) => {
        updateChapterFromRow(row);
      });
    }

    const endUpBtn = row.querySelector('.time-group-row:last-child .time-btn-row[data-dir="1"]');
    const endDownBtn = row.querySelector('.time-group-row:last-child .time-btn-row[data-dir="-1"]');
    if (endUpBtn && endDownBtn) {
      configureTimeButtons(endInput, endUpBtn, endDownBtn, (seconds) => {
        updateChapterFromRow(row);
      });
    }

    startInput.addEventListener('change', () => {
      updateChapterFromRow(row);
    });
    endInput.addEventListener('change', () => {
      updateChapterFromRow(row);
    });
    titleInput.addEventListener('change', () => {
      updateChapterFromRow(row);
    });
    titleInput.addEventListener('blur', () => {
      updateChapterFromRow(row);
    });

    row.addEventListener('click', (e) => {
      if (e.target.closest('.time-btn-row') || e.target.closest('.chapter-actions')) return;
      if (e.target.tagName === 'INPUT') return;
      selectChapterRow(row);
    });

    const playBtn = row.querySelector('.play-chapter-btn');
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      playChapter(row);
    });

    const deleteBtn = row.querySelector('.delete-chapter');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const timeBtns = row.querySelectorAll('.time-btn-row');
      timeBtns.forEach(btn => {
        btn.dispatchEvent(new Event('mouseup'));
        btn.dispatchEvent(new Event('touchend'));
      });
      const idx = Array.from(dom.chaptersList.children).indexOf(row);
      if (idx > -1) {
        state.chapters.splice(idx, 1);
        row.remove();
        reorderTrackNumbers();
        renderMarkers();
        if (state.activeChapterRow === row) state.activeChapterRow = null;
        const remaining = dom.chaptersList.querySelectorAll('.chapter-row');
        if (remaining.length === 0) {
          dom.manualStart.value = '00:00:00';
          dom.manualEnd.value = '00:00:00';
        }
        showToast('Capítulo eliminado', 'info');
      }
    });

    validateChapterRow(row);
  }

  // ============================================================
  //  REPRODUCIR CAPÍTULO
  // ============================================================

  function playChapter(row) {
    const start = parseTime(row.querySelector('.ch-start').value);
    const end = parseTime(row.querySelector('.ch-end').value);
    if (end <= start) {
      showToast('El fin debe ser mayor que el inicio', 'warning');
      return;
    }
    if (state.totalDuration && end > state.totalDuration) {
      showToast('El fin excede la duración total', 'warning');
      return;
    }

    dom.audio.currentTime = start;
    dom.audio.play();
    selectChapterRow(row);

    const checkEnd = setInterval(() => {
      if (dom.audio.currentTime >= end) {
        dom.audio.pause();
        clearInterval(checkEnd);
        row.classList.add('completed');
        showToast('Capítulo completado', 'success');
      }
    }, 200);

    dom.audio.addEventListener('pause', () => {
      clearInterval(checkEnd);
    }, { once: true });
  }

  // ============================================================
  //  RENDERIZAR MARCADORES
  // ============================================================

  function renderMarkers() {
    const container = dom.chapterMarkers;
    container.innerHTML = '';
    if (!state.totalDuration) return;

    state.chapters.forEach((ch, idx) => {
      if (ch.start >= ch.end || ch.end === 0) return;
      const startPercent = (ch.start / state.totalDuration) * 100;
      const endPercent = (ch.end / state.totalDuration) * 100;
      const marker = document.createElement('div');
      marker.className = 'chapter-marker';
      marker.style.left = startPercent + '%';
      marker.style.width = (endPercent - startPercent) + '%';
      marker.title = ch.title || `Pista ${idx+1}`;
      marker.dataset.index = idx;
      marker.addEventListener('click', (e) => {
        e.stopPropagation();
        const rows = dom.chaptersList.querySelectorAll('.chapter-row');
        if (rows[idx]) {
          selectChapterRow(rows[idx]);
          rows[idx].scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      });
      container.appendChild(marker);
    });
  }

  function highlightActiveChapter() {}

  // ============================================================
  //  REORDENAR NÚMEROS DE PISTA
  // ============================================================

  function reorderTrackNumbers() {
    const rows = dom.chaptersList.querySelectorAll('.chapter-row');
    rows.forEach((row, idx) => {
      const trackSpan = row.querySelector('.ch-track');
      if (trackSpan) trackSpan.textContent = idx + 1;
    });
  }

  // ============================================================
  //  OVERLAY DE CARGA
  // ============================================================

  function showLoading(show, progress = 0, text = 'Descargando audio...') {
    if (show) {
      dom.loadingOverlay.classList.add('visible');
      dom.loaderText.textContent = text;
      dom.loaderProgressBar.style.width = Math.min(100, progress) + '%';
      dom.loaderPercent.textContent = Math.round(progress) + '%';
    } else {
      dom.loadingOverlay.classList.remove('visible');
    }
  }

  function updateLoadingProgress(progress, text) {
    dom.loaderProgressBar.style.width = Math.min(100, progress) + '%';
    dom.loaderPercent.textContent = Math.round(progress) + '%';
    if (text) dom.loaderText.textContent = text;
  }

  // ============================================================
  //  ELIMINAR ARCHIVO TEMPORAL
  // ============================================================

  function deleteTempAudio() {
    if (state.audioTempPath) {
      try {
        api.deleteTempFile(state.audioTempPath);
      } catch (e) {
        console.warn('No se pudo eliminar el archivo temporal:', e);
      }
    }
  }

  // ============================================================
  //  RECIBIR URL DEL VIDEO Y DESCARGAR AUDIO
  // ============================================================

  api.on('editor:init', async (url) => {
    console.log('📥 Editor:init recibido:', url);
    state.videoUrl = url;
    state.videoId = extractVideoId(url);
    if (!state.videoId) {
      showError('URL inválida', 'No se pudo extraer el ID del video.');
      return;
    }

    showLoading(true, 0, 'Iniciando descarga...');

    try {
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress += Math.random() * 8;
        if (progress > 95) progress = 95;
        updateLoadingProgress(progress, 'Descargando audio...');
      }, 300);

      const audioPath = await api.downloadAudio(url);
      clearInterval(progressInterval);
      updateLoadingProgress(100, 'Audio listo');
      state.audioTempPath = audioPath;

      dom.audio.src = audioPath;
      dom.audio.load();
      dom.audio.style.display = 'block';
      console.log('✅ Audio cargado:', audioPath);

      setTimeout(() => {
        showLoading(false);
        showToast('Audio listo', 'success');
      }, 500);
    } catch (err) {
      showLoading(false);
      await showError('Error al descargar audio', err.message || 'Verifica tu conexión');
    }
  });

  // ============================================================
  //  BOTONES + Y - PARA CONTROLES MANUALES
  // ============================================================

  function setupManualTimeButtons() {
    const startInput = dom.manualStart;
    const startUp = document.querySelector('.time-btn[data-target="manual-start"][data-dir="1"]');
    const startDown = document.querySelector('.time-btn[data-target="manual-start"][data-dir="-1"]');
    if (startInput && startUp && startDown) {
      configureTimeButtons(startInput, startUp, startDown, (seconds) => {
        const selectedRow = getSelectedChapterRow();
        if (selectedRow) {
          const startInputRow = selectedRow.querySelector('.ch-start');
          startInputRow.value = formatTime(seconds);
          startInputRow.dispatchEvent(new Event('change'));
          updateChapterFromRow(selectedRow);
        }
      });
    }

    const endInput = dom.manualEnd;
    const endUp = document.querySelector('.time-btn[data-target="manual-end"][data-dir="1"]');
    const endDown = document.querySelector('.time-btn[data-target="manual-end"][data-dir="-1"]');
    if (endInput && endUp && endDown) {
      configureTimeButtons(endInput, endUp, endDown, (seconds) => {
        const selectedRow = getSelectedChapterRow();
        if (selectedRow) {
          const endInputRow = selectedRow.querySelector('.ch-end');
          endInputRow.value = formatTime(seconds);
          endInputRow.dispatchEvent(new Event('change'));
          updateChapterFromRow(selectedRow);
        }
      });
    }
  }

  // ============================================================
  //  EVENT LISTENERS PRINCIPALES
  // ============================================================

  dom.btnPlay.addEventListener('click', togglePlay);
  dom.btnPause.addEventListener('click', togglePlay);

  dom.btnMarkStart.addEventListener('click', markStart);
  dom.btnMarkEnd.addEventListener('click', markEnd);

  dom.manualStart.addEventListener('blur', function() {
    const val = this.value.trim();
    if (val) {
      let seconds = parseTime(val);
      seconds = validateTime(seconds);
      this.value = formatTime(seconds);
      const selectedRow = getSelectedChapterRow();
      if (selectedRow) {
        const startInput = selectedRow.querySelector('.ch-start');
        startInput.value = formatTime(seconds);
        startInput.dispatchEvent(new Event('change'));
        updateChapterFromRow(selectedRow);
      }
    }
  });

  dom.manualStart.addEventListener('input', function() {
    const raw = this.value.replace(/[^0-9]/g, '');
    if (raw) {
      const seconds = parseTime(raw);
      if (seconds >= 0 && seconds <= (state.totalDuration || Infinity)) {
        this.value = formatTime(seconds);
        const len = this.value.length;
        this.setSelectionRange(len, len);
      }
    }
  });

  dom.manualEnd.addEventListener('blur', function() {
    const val = this.value.trim();
    if (val) {
      let seconds = parseTime(val);
      seconds = validateTime(seconds);
      this.value = formatTime(seconds);
      const selectedRow = getSelectedChapterRow();
      if (selectedRow) {
        const endInput = selectedRow.querySelector('.ch-end');
        endInput.value = formatTime(seconds);
        endInput.dispatchEvent(new Event('change'));
        updateChapterFromRow(selectedRow);
      }
    }
  });

  dom.manualEnd.addEventListener('input', function() {
    const raw = this.value.replace(/[^0-9]/g, '');
    if (raw) {
      const seconds = parseTime(raw);
      if (seconds >= 0 && seconds <= (state.totalDuration || Infinity)) {
        this.value = formatTime(seconds);
        const len = this.value.length;
        this.setSelectionRange(len, len);
      }
    }
  });

  dom.btnAdd.addEventListener('click', () => {
    const time = state.currentTime || 0;
    if (state.totalDuration > 0 && time > state.totalDuration) {
      showToast('El tiempo excede la duración total', 'warning');
      return;
    }
    addChapterFromCurrentTime(time);
  });

  dom.btnSave.addEventListener('click', () => {
    const rows = dom.chaptersList.querySelectorAll('.chapter-row');
    const customChapters = [];
    let hasError = false;

    rows.forEach(row => {
      const title = row.querySelector('.ch-title').value.trim();
      const start = parseTime(row.querySelector('.ch-start').value);
      const end = parseTime(row.querySelector('.ch-end').value);

      if (!title) {
        hasError = true;
        row.style.borderColor = 'var(--color-error)';
        return;
      }
      if (end > 0 && start >= end) {
        hasError = true;
        row.style.borderColor = 'var(--color-error)';
        showToast(`El capítulo "${title}" tiene inicio >= fin`, 'warning');
        return;
      }
      if (end > state.totalDuration) {
        hasError = true;
        row.style.borderColor = 'var(--color-error)';
        showToast(`El fin del capítulo "${title}" excede la duración total`, 'warning');
        return;
      }
      customChapters.push({ title, start, end, isSelected: true });
    });

    if (hasError) return;

    if (customChapters.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'Sin capítulos',
        text: 'Agrega al menos un capítulo con título.',
        confirmButtonColor: '#00FF7B',
        background: 'var(--color-background)',
        color: 'var(--color-text)',
      });
      return;
    }

    console.log('💾 Guardando capítulos:', customChapters);
    api.send('editor:save', customChapters);
    deleteTempAudio();
    window.close();
  });

  dom.btnCancel.addEventListener('click', () => {
    deleteTempAudio();
    api.send('editor:cancel');
    window.close();
  });

  dom.btnClose.addEventListener('click', () => {
    deleteTempAudio();
    api.send('editor:cancel');
    window.close();
  });

  window.addEventListener('beforeunload', () => {
    if (state.progressInterval) clearInterval(state.progressInterval);
    deleteTempAudio();
  });

  // ===== INICIALIZAR =====
  initAudio();
  setupManualTimeButtons();
  console.log('✅ Editor de capítulos listo (modo audio)');
})();