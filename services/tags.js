const fs = require('fs-extra');
const path = require('path');
const { log } = require('./logger');

// Usamos node-id3 para MP3 (más confiable para escribir)
const NodeID3 = require('node-id3');

function getFfmpegPath() {
  const fileName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const packagedPath = process.resourcesPath
    ? path.join(process.resourcesPath, 'tools', fileName)
    : '';
  return packagedPath && fs.existsSync(packagedPath)
    ? packagedPath
    : path.join(__dirname, '..', 'tools', fileName);
}

async function applyMetadata(filePath, albumInfo, trackInfo, coverPath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      log(`⚠️ Archivo no encontrado: ${filePath}`);
      return;
    }

    // Detectar extensión
    const ext = path.extname(filePath).toLowerCase();

    // Si es MP3, usar node-id3
    if (ext === '.mp3') {
      log(`🎵 Aplicando metadatos a MP3: ${filePath}`);

      // Preparar tags
      const tags = {
        title: trackInfo.title || '',
        artist: trackInfo.collaborator || '',
        album: albumInfo.album || '',
        albumArtist: albumInfo.albumArtist || '',
        year: albumInfo.year || '',
        genre: albumInfo.genre || '',
        trackNumber: trackInfo.trackNumber || '',
      };

      // Limpiar valores undefined
      Object.keys(tags).forEach(key => {
        if (tags[key] === undefined || tags[key] === null) tags[key] = '';
      });

      // Leer tags existentes para preservar algunos campos si es necesario
      const existing = NodeID3.read(filePath);

      // Preparar objeto para escribir
      const writeTags = {
        title: tags.title || existing.title || '',
        artist: tags.artist || existing.artist || '',
        album: tags.album || existing.album || '',
        albumArtist: tags.albumArtist || existing.albumArtist || '',
        year: tags.year || existing.year || '',
        genre: tags.genre || existing.genre || '',
        trackNumber: tags.trackNumber || existing.trackNumber || '',
      };

      // Si hay portada, añadirla
      let coverBuffer = null;
      if (coverPath && fs.existsSync(coverPath)) {
        coverBuffer = fs.readFileSync(coverPath);
        log(`🖼️ Portada encontrada: ${coverPath}`);
      } else {
        // Si no hay portada personalizada, intentar preservar la existente
        if (existing.image && existing.image.imageBuffer) {
          coverBuffer = existing.image.imageBuffer;
          log('🖼️ Preservando portada existente');
        }
      }

      if (coverBuffer) {
        writeTags.image = {
          mime: coverPath && coverPath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg',
          type: {
            id: 3, // Front cover
            name: 'Front Cover',
          },
          description: 'Cover',
          imageBuffer: coverBuffer,
        };
      }

      // Escribir tags
      const result = NodeID3.write(writeTags, filePath);

      if (result) {
        log(`✅ Metadatos aplicados correctamente a ${filePath}`);
      } else {
        throw new Error(`node-id3 no pudo escribir los metadatos en ${filePath}`);
      }
    } else {
      const ffmpegPath = getFfmpegPath();
      if (!fs.existsSync(ffmpegPath)) {
        throw new Error(`ffmpeg no encontrado: ${ffmpegPath}`);
      }

      const tempPath = path.join(
        path.dirname(filePath),
        `${path.basename(filePath, ext)}.tagged${ext}`
      );
      const metadata = {
        title: trackInfo.title || '',
        artist: trackInfo.collaborator || '',
        album: albumInfo.album || '',
        album_artist: albumInfo.albumArtist || '',
        date: albumInfo.year || '',
        genre: albumInfo.genre || '',
        track: trackInfo.trackNumber || '',
      };
      const coverExists = coverPath && fs.existsSync(coverPath);
      const canEmbedCover = ['.flac', '.m4a', '.oga', '.ogg', '.opus'].includes(ext);
      let coverEmbedded = false;

      const writeWithCover = async includeCover => {
        const args = ['-i', filePath, '-map', '0:a:0'];
        if (includeCover) {
          args.push('-i', coverPath, '-map', '1:v:0', '-c:v', 'mjpeg', '-disposition:v:0', 'attached_pic');
        }
        args.push('-c:a', 'copy');
        for (const [key, value] of Object.entries(metadata)) {
          if (value) args.push('-metadata', `${key}=${value}`);
        }
        args.push('-y', tempPath);
        await runFfmpeg(ffmpegPath, args);
      };

      try {
        if (coverExists && canEmbedCover) {
          try {
            await writeWithCover(true);
            coverEmbedded = true;
          } catch (error) {
            if (fs.existsSync(tempPath)) fs.removeSync(tempPath);
            log(`⚠️ No se pudo incrustar la portada; se aplicarán los metadatos sin imagen: ${error.message}`);
            await writeWithCover(false);
          }
        } else {
          await writeWithCover(false);
        }
        if (!fs.existsSync(tempPath)) throw new Error('ffmpeg no generó el archivo con metadatos');
        fs.moveSync(tempPath, filePath, { overwrite: true });
        if (coverExists && !coverEmbedded) {
          log(`⚠️ El formato ${ext} no admite incrustar la portada; no se creó un archivo de imagen separado.`);
        }
        log(`✅ Metadatos aplicados a ${path.basename(filePath)}`);
      } catch (err) {
        if (fs.existsSync(tempPath)) fs.removeSync(tempPath);
        throw err;
      }
    }

  } catch (err) {
    log(`❌ Error aplicando metadatos: ${err.message}`);
    throw err;
  }
}

// Función auxiliar para ffmpeg
function runFfmpeg(ffmpegPath, args) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const proc = spawn(ffmpegPath, args);
    let stderr = '';
    proc.stderr.on('data', (data) => { stderr += data.toString('utf-8'); });
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg error: ${stderr}`));
      } else {
        resolve();
      }
    });
  });
}

module.exports = { applyMetadata };