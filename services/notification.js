let tray = null;

function initTray(trayInstance) {
  tray = trayInstance;
}

function show(message, type = 'info') {
  if (!tray) {
    console.log(`[NOTIFICATION] ${type}: ${message}`);
    return;
  }
  try {
    tray.displayBalloon({
      title: 'OMC Downloader',
      content: message,
      icon: type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'info',
    });
  } catch (err) {
    console.log(`[NOTIFICATION ERROR] ${err.message}`);
  }
}

function showSuccess(message) { show(message, 'info'); }
function showError(message) { show(message, 'error'); }
function showInfo(message) { show(message, 'info'); }
function showWarning(message) { show(message, 'warning'); }

module.exports = { initTray, show, showSuccess, showError, showInfo, showWarning };