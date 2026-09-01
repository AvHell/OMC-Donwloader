/**
 * main-editor.js
 * Interacción con la ventana del editor de capítulos
 */

const EditorManager = (() => {
  let api = null;

  function init(apiRef) {
    api = apiRef;

    api.on('editor:result', (chapters) => {
      if (chapters && chapters.length > 0) {
        if (typeof ModalManager !== 'undefined' && ModalManager.setCurrentChapters) {
          ModalManager.setCurrentChapters(chapters);
        } else {
          updateChaptersContainerDirectly(chapters);
        }
        if (typeof Toast !== 'undefined') {
          Toast.show(`Capítulos cargados: ${chapters.length}`, 'success');
        } else {
          console.log(`✅ Capítulos cargados: ${chapters.length}`);
        }
      } else {
        if (typeof Toast !== 'undefined') {
          Toast.show('No se cargaron capítulos', 'info');
        } else {
          console.log('ℹ️ No se cargaron capítulos');
        }
      }
    });
  }

  function updateChaptersContainerDirectly(chapters) {
    const container = document.getElementById('chapters-container');
    if (!container) return;

    container.style.display = 'block';
    container.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
        <label style="display:flex; align-items:center; gap:6px; color:rgba(255,255,255,0.7);">
          <input type="checkbox" id="select-all-chapters" checked> Seleccionar todos
        </label>
      </div>
      ${chapters.map((ch, idx) => `
        <div style="display:flex; align-items:center; gap:10px; margin:4px 0; padding:4px 8px; background:rgba(255,255,255,0.02); border-radius:6px;">
          <input type="checkbox" checked data-idx="${idx}" style="width:18px; height:18px; cursor:pointer;">
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

    const chkSplit = document.getElementById('chk-split');
    if (chkSplit) chkSplit.checked = true;
  }

  async function openEditor(url) {
    if (!url) {
      if (typeof Toast !== 'undefined') {
        Toast.error('Error', 'Primero ingresa un enlace de YouTube.');
      } else {
        console.error('❌ Error: Primero ingresa un enlace de YouTube.');
      }
      return;
    }

    try {
      await api.editor.open(url);
    } catch (err) {
      if (typeof Toast !== 'undefined') {
        Toast.error('Error', 'No se pudo abrir el editor: ' + err.message);
      } else {
        console.error('❌ Error al abrir el editor:', err.message);
      }
    }
  }

  return {
    init,
    openEditor,
  };
})();

window.OMC = window.OMC || {};
window.OMC.editor = EditorManager;