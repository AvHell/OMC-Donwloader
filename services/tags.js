const fs = require('fs-extra');
const path = require('path');
const { log } = require('./logger');

// Usamos node-id3 para MP3 (más confiable para escribir)
const NodeID3 = require('node-id3');

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
        log(`⚠️ No se pudieron escribir metadatos en ${filePath}`);
      }
    } else if (ext === '.flac') {
      // Para FLAC, podríamos usar music-metadata o ffmpeg
      log(`⚠️ FLAC no soportado completamente. Usando ffmpeg para metadatos...`);
      // Usar ffmpeg para FLAC (comando alternativo)
      const { spawn } = require('child_process');
      const ffmpegPath = path.join(__dirname, '..', 'tools', 'ffmpeg.exe');

      if (!fs.existsSync(ffmpegPath)) {
        log(`⚠️ ffmpeg no encontrado, no se pueden escribir metadatos FLAC`);
        return;
      }

      const metaArgs = [
        '-i', filePath,
        '-c', 'copy',
        '-metadata', `title=${trackInfo.title || ''}`,
        '-metadata', `artist=${trackInfo.collaborator || ''}`,
        '-metadata', `album=${albumInfo.album || ''}`,
        '-metadata', `album_artist=${albumInfo.albumArtist || ''}`,
        '-metadata', `date=${albumInfo.year || ''}`,
        '-metadata', `genre=${albumInfo.genre || ''}`,
        '-metadata', `track=${trackInfo.trackNumber || ''}`,
        '-y', filePath + '.temp.flac'
      ];

      await runFfmpeg(ffmpegPath, metaArgs);
      if (fs.existsSync(filePath + '.temp.flac')) {
        fs.moveSync(filePath + '.temp.flac', filePath, { overwrite: true });
        log(`✅ Metadatos FLAC aplicados`);
      }
    } else {
      log(`⚠️ Formato no soportado para metadatos: ${ext}`);
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