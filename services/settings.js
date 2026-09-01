const Store = require('electron-store');

const store = new Store({
  defaults: {
    lastDownloadPath: '',
    closeToTray: true,
  },
});

function get(key) {
  return store.get(key);
}

function set(key, value) {
  store.set(key, value);
}

module.exports = { get, set };