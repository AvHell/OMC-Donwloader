/**
 * services/updater.js
 * Servicio para actualizar automáticamente yt-dlp.exe
 */

const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');
const { app } = require('electron');
const { log } = require('./logger');

class YtDlpUpdater {
  constructor(options = {}) {
    // Ruta del binario empaquetado (puede ser en tools/ o en resources)
    this.packagedBinPath = options.packagedBinPath || null;
    this.packagedFfmpegPath = options.packagedFfmpegPath || null;
    // Fallback si no existe en userData
    this.fallbackBinPath = options.fallbackBinPath || null;
    this.fallbackFfmpegPath = options.fallbackFfmpegPath || null;

    // Ruta en userData (escribible)
    this.userDataPath = app.getPath('userData');
    this.binDir = path.join(this.userDataPath, 'bin');
    this.binPath = path.join(this.binDir, 'yt-dlp.exe');
    this.ffmpegPath = path.join(this.binDir, 'ffmpeg.exe');

    // Versiones
    this.currentVersion = null;
    this.latestVersion = null;
    this.latestDownloadUrl = null;
  }

  /**
   * Obtiene la ruta del binario a usar (userData si existe, sino fallback o empaquetado)
   * @returns {string}
   */
  getBinaryPath() {
    if (fs.existsSync(this.binPath)) {
      return this.binPath;
    }
    if (this.fallbackBinPath && fs.existsSync(this.fallbackBinPath)) {
      return this.fallbackBinPath;
    }
    if (this.packagedBinPath && fs.existsSync(this.packagedBinPath)) {
      return this.packagedBinPath;
    }
    return this.binPath; // fallback final
  }

  getFfmpegPath() {
    if (fs.existsSync(this.ffmpegPath)) {
      return this.ffmpegPath;
    }
    if (this.fallbackFfmpegPath && fs.existsSync(this.fallbackFfmpegPath)) {
      return this.fallbackFfmpegPath;
    }
    if (this.packagedFfmpegPath && fs.existsSync(this.packagedFfmpegPath)) {
      return this.packagedFfmpegPath;
    }
    return this.ffmpegPath;
  }

  /**
   * Ejecuta la verificación y actualización de yt-dlp
   * @param {Function} onProgress - Callback para reportar progreso (mensaje, porcentaje)
   * @returns {Promise<boolean>} - true si se actualizó, false si ya estaba actualizado
   */
  async run(onProgress) {
    try {
      log('🔄 Iniciando verificación de actualización de yt-dlp...');
      if (onProgress) onProgress('Verificando versión actual...', 10);

      // Asegurar que exista la carpeta bin
      await fs.ensureDir(this.binDir);

      // Si no existe el binario en userData, copiar desde el empaquetado o fallback
      if (!fs.existsSync(this.binPath)) {
        let source = null;
        if (this.packagedBinPath && fs.existsSync(this.packagedBinPath)) {
          source = this.packagedBinPath;
        } else if (this.fallbackBinPath && fs.existsSync(this.fallbackBinPath)) {
          source = this.fallbackBinPath;
        }
        if (source) {
          await fs.copy(source, this.binPath);
          log(`📦 Binario copiado desde ${source}`);
        } else {
          throw new Error('No se encontró yt-dlp en ninguna ubicación');
        }
      }

      // Copiar ffmpeg si existe y no está en userData
      if (!fs.existsSync(this.ffmpegPath)) {
        let ffSource = null;
        if (this.packagedFfmpegPath && fs.existsSync(this.packagedFfmpegPath)) {
          ffSource = this.packagedFfmpegPath;
        } else if (this.fallbackFfmpegPath && fs.existsSync(this.fallbackFfmpegPath)) {
          ffSource = this.fallbackFfmpegPath;
        }
        if (ffSource) {
          await fs.copy(ffSource, this.ffmpegPath);
          log(`📦 ffmpeg copiado desde ${ffSource}`);
        }
      }

      // Obtener versión actual del binario (usando el que esté en userData o el disponible)
      const binToCheck = this.getBinaryPath();
      this.currentVersion = await this.getVersion(binToCheck);
      log(`📌 Versión actual: ${this.currentVersion}`);

      if (onProgress) onProgress('Consultando última versión...', 30);
      await this.getLatestVersion();
      log(`📌 Última versión: ${this.latestVersion}`);

      if (this.isNewerVersion(this.latestVersion, this.currentVersion)) {
        log(`🔄 Nueva versión disponible: ${this.latestVersion}`);
        if (onProgress) onProgress(`Descargando versión ${this.latestVersion}...`, 50);

        await this.downloadAndReplace(onProgress);

        const newVersion = await this.getVersion(this.binPath);
        log(`✅ yt-dlp actualizado a: ${newVersion}`);
        if (onProgress) onProgress(`Actualizado a ${newVersion}`, 100);
        return true;
      } else {
        log('✅ yt-dlp ya está actualizado');
        if (onProgress) onProgress('Ya está actualizado', 100);
        return false;
      }
    } catch (err) {
      log(`❌ Error en actualización: ${err.message}`);
      if (onProgress) onProgress(`Error: ${err.message}`, 100);
      return false;
    }
  }

  /**
   * Obtiene la versión de un binario ejecutándolo con --version
   * @param {string} binPath - Ruta al ejecutable
   * @returns {Promise<string>}
   */
  async getVersion(binPath) {
    try {
      const output = await this.execCommand(binPath, ['--version']);
      return output.trim();
    } catch (err) {
      log(`⚠️ No se pudo obtener versión: ${err.message}`);
      return '0.0.0';
    }
  }

  /**
   * Obtiene la última versión disponible desde GitHub
   */
  async getLatestVersion() {
    try {
      const response = await axios.get(
        'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest',
        {
          headers: { 'User-Agent': 'OMC-Downloader' },
          timeout: 10000,
        }
      );
      this.latestVersion = response.data.tag_name.replace(/^v/, '');
      const asset = response.data.assets.find(a =>
        a.name.endsWith('.exe') && a.name.includes('yt-dlp')
      );
      this.latestDownloadUrl = asset?.browser_download_url ||
        `https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe`;
      log(`🌐 Última versión: ${this.latestVersion}`);
    } catch (err) {
      log(`⚠️ Error obteniendo última versión: ${err.message}`);
      this.latestVersion = this.currentVersion || '0.0.0';
      this.latestDownloadUrl = null;
    }
  }

  /**
   * Compara dos versiones semánticas (simple)
   * @param {string} latest - Versión nueva
   * @param {string} current - Versión actual
   * @returns {boolean}
   */
  isNewerVersion(latest, current) {
    if (!latest || !current) return false;
    const lParts = latest.split('.').map(Number);
    const cParts = current.split('.').map(Number);
    for (let i = 0; i < Math.max(lParts.length, cParts.length); i++) {
      const l = lParts[i] || 0;
      const c = cParts[i] || 0;
      if (l > c) return true;
      if (l < c) return false;
    }
    return false;
  }

  /**
   * Descarga y reemplaza el binario
   */
  async downloadAndReplace(onProgress) {
    if (!this.latestDownloadUrl) {
      throw new Error('No se pudo obtener la URL de descarga');
    }

    const tempPath = path.join(this.binDir, 'yt-dlp_temp.exe');
    const writer = fs.createWriteStream(tempPath);

    const response = await axios({
      method: 'GET',
      url: this.latestDownloadUrl,
      responseType: 'stream',
      timeout: 60000,
    });

    const totalLength = parseInt(response.headers['content-length'], 10);
    let downloaded = 0;

    response.data.on('data', (chunk) => {
      downloaded += chunk.length;
      if (totalLength && onProgress) {
        const percent = Math.round((downloaded / totalLength) * 100);
        onProgress(`Descargando... ${percent}%`, 50 + percent * 0.4);
      }
    });

    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
      response.data.on('error', reject);
    });

    await fs.move(tempPath, this.binPath, { overwrite: true });
    if (process.platform !== 'win32') {
      await fs.chmod(this.binPath, 0o755);
    }
    log('✅ Descarga completada y binario reemplazado');
  }

  /**
   * Ejecuta un comando y retorna la salida estándar
   */
  execCommand(cmd, args) {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args);
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });
      proc.on('close', (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(stderr || `Código de salida ${code}`));
      });
      proc.on('error', reject);
    });
  }

  // ========== NUEVOS MÉTODOS PARA LA INTERFAZ ==========

  /**
   * Obtiene el estado actual del actualizador (versión actual, última versión, etc.)
   * @returns {Promise<Object>} { currentVersion, latestVersion, isUpToDate, binaryPath }
   */
  async getStatus() {
    try {
      // Asegurar que el binario exista
      if (!fs.existsSync(this.binPath)) {
        // Intentar copiar desde fallback/empaquetado
        let source = null;
        if (this.packagedBinPath && fs.existsSync(this.packagedBinPath)) {
          source = this.packagedBinPath;
        } else if (this.fallbackBinPath && fs.existsSync(this.fallbackBinPath)) {
          source = this.fallbackBinPath;
        }
        if (source) {
          await fs.ensureDir(this.binDir);
          await fs.copy(source, this.binPath);
          log(`📦 Binario copiado para estado desde ${source}`);
        }
      }

      const binToCheck = this.getBinaryPath();
      const current = await this.getVersion(binToCheck);
      await this.getLatestVersion();
      return {
        currentVersion: current || 'desconocida',
        latestVersion: this.latestVersion || 'desconocida',
        isUpToDate: !this.isNewerVersion(this.latestVersion, current),
        binaryPath: binToCheck,
      };
    } catch (err) {
      log(`⚠️ Error obteniendo estado: ${err.message}`);
      return {
        currentVersion: 'desconocida',
        latestVersion: 'desconocida',
        isUpToDate: true,
        binaryPath: this.binPath,
      };
    }
  }
}

module.exports = YtDlpUpdater;