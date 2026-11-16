const fs = require('fs-extra');
const path = require('path');
const { app } = require('electron');

let logFile = null;
let logHandler = null;

function initLogger() {
  const userData = app.getPath('userData');
  logFile = path.join(userData, 'debug_log.txt');
  fs.ensureFileSync(logFile);
}

function log(message, level = 'info') {
  if (!logFile) initLogger();
  const timestamp = new Date().toISOString();
  const text = String(message);
  const entry = `[${timestamp}] ${text}\n`;
  fs.appendFileSync(logFile, entry);
  console.log(entry.trim());
  if (logHandler) logHandler(level, text);
}

// Agregar función error que usa log internamente
function error(message) {
  log(`❌ ${message}`, 'error');
}

// Agregar función info (alias)
function info(message) {
  log(`ℹ️ ${message}`, 'info');
}

function setLogHandler(handler) {
  if (handler !== null && typeof handler !== 'function') {
    throw new TypeError('El manejador de logs debe ser una función o null.');
  }
  logHandler = handler;
}

module.exports = { initLogger, log, error, info, setLogHandler };