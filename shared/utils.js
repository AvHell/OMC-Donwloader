// shared/utils.js
function sanitizeFileName(name) {
  if (!name) return 'Track';
  return name.replace(/[<>:"/\\|?*]/g, '_').trim();
}

function formatDuration(seconds) {
  if (!seconds || seconds < 0) return '0:00';
  const d = new Date(0);
  d.setSeconds(seconds);
  return d.toISOString().substr(11, 8);
}

function formatTime(seconds) {
  if (!seconds || seconds < 0) return '00:00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

module.exports = { sanitizeFileName, formatDuration, formatTime, generateId };