const fs = require('fs-extra');
const path = require('path');
const { app } = require('electron');

let logFile = null;

function initLogger() {
  const userData = app.getPath('userData');
  logFile = path.join(userData, 'debug_log.txt');
  fs.ensureFileSync(logFile);
}

function log(message) {
  if (!logFile) initLogger();
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(logFile, entry);
  console.log(entry.trim());
}

// Agregar función error que usa log internamente
function error(message) {
  log(`❌ ${message}`);
}

// Agregar función info (alias)
function info(message) {
  log(`ℹ️ ${message}`);
}

module.exports = { initLogger, log, error, info };