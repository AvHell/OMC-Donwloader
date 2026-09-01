/**
 * main-utils.js
 * Utilidades generales para la aplicación
 */

// ============================================================
//  CONSTANTE PARA THUMBNAIL POR DEFECTO
// ============================================================
const DEFAULT_THUMBNAIL = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="120" height="68" viewBox="0 0 120 68"%3E%3Crect width="120" height="68" fill="%23222"%3E%3C/rect%3E%3Ctext x="50%25" y="50%25" font-family="Arial" font-size="14" fill="%23666" text-anchor="middle" dy=".3em"%3ENo image%3C/text%3E%3C/svg%3E';

// ============================================================
//  FUNCIONES DE TIEMPO
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
      return num;
    } else if (len <= 4) {
      const s = num % 100;
      const m = Math.floor(num / 100);
      return m * 60 + s;
    } else {
      const s = num % 100;
      const m = Math.floor((num % 10000) / 100);
      const h = Math.floor(num / 10000);
      return h * 3600 + m * 60 + s;
    }
  }
  return 0;
}

// ============================================================
//  FUNCIONES DE ID Y ARCHIVOS
// ============================================================
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function sanitizeFileName(name) {
  if (!name) return 'audio';
  return name.replace(/[<>:"/\\|?*]/g, '_').trim();
}

// ============================================================
//  EXPORTAR AL CONTEXTO GLOBAL
// ============================================================
window.OMC = window.OMC || {};
window.OMC.utils = {
  formatTime,
  parseTime,
  generateId,
  sanitizeFileName,
  DEFAULT_THUMBNAIL, // <-- EXPORTADO
};