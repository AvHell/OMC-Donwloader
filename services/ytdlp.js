const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const { log } = require('./logger');
const { sanitizeFileName, formatDuration, formatTime, generateId } = require('../shared/utils');
const YtDlpUpdater = require('./updater');

// --- OBTENER RUTAS ---
let updaterInstance = null;
try {
  updaterInstance = new YtDlpUpdater();
} catch (e) {
  log('⚠️ No se pudo instanciar el actualizador, usando rutas por defecto');
}

function getBinaryPaths() {
  if (updaterInstance) {
    const ytPath = updaterInstance.getBinaryPath();
    const ffPath = updaterInstance.getFfmpegPath();
    if (fs.existsSync(ytPath) && fs.existsSync(ffPath)) {
      return { ytPath, ffPath };
    }
  }
  const isWin = process.platform === 'win32';
  const ext = isWin ? '.exe' : '';
  const isProd = __dirname.includes('app.asar');
  const basePath = isProd 
    ? path.join(process.resourcesPath, 'tools') 
    : path.join(__dirname, '..', 'tools');
  return {
    ytPath: path.join(basePath, `yt-dlp${ext}`),
    ffPath: path.join(basePath, `ffmpeg${ext}`),
  };
}

let { ytPath: ytDlpPath, ffPath: ffmpegPath } = getBinaryPaths();

function refreshPaths() {
  const paths = getBinaryPaths();
  ytDlpPath = paths.ytPath;
  ffmpegPath = paths.ffPath;
  log(`🔄 Rutas actualizadas: yt-dlp=${ytDlpPath}, ffmpeg=${ffmpegPath}`);
}

function checkBinaries() {
  if (!fs.existsSync(ytDlpPath)) {
    log(`⚠️ yt-dlp no encontrado en: ${ytDlpPath}, intentando refresh...`);
    refreshPaths();
    if (!fs.existsSync(ytDlpPath)) {
      throw new Error(`❌ yt-dlp no encontrado en: ${ytDlpPath}`);
    }
  }
  if (!fs.existsSync(ffmpegPath)) {
    log(`⚠️ ffmpeg no encontrado en: ${ffmpegPath}, intentando refresh...`);
    refreshPaths();
    if (!fs.existsSync(ffmpegPath)) {
      throw new Error(`❌ ffmpeg no encontrado en: ${ffmpegPath}`);
    }
  }
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(ytDlpPath, '755');
      fs.chmodSync(ffmpegPath, '755');
    } catch (err) { log(`⚠️ No se pudieron establecer permisos: ${err.message}`); }
  }
}
checkBinaries();

async function makeSquareImage(inputPath, outputPath) {
  if (!fs.existsSync(inputPath)) return null;
  try {
    const args = [
      '-i', inputPath,
      '-vf', 'crop=min(iw\\,ih):min(iw\\,ih)',
      '-y', outputPath
    ];
    await runFfmpeg(args);
    if (fs.existsSync(outputPath)) return outputPath;
  } catch (err) {
    log(`⚠️ Error al recortar imagen: ${err.message}`);
  }
  return null;
}

// ============================================================
//  Función para parsear capítulos desde texto (descripción o manual)
//  CORREGIDO: MM:SS -> minutos:segundos, HH:MM:SS -> horas:minutos:segundos
// ============================================================
function parseChaptersFromText(text, totalDuration, limit = 0) {
  const chapters = [];
  if (!text) return chapters;

  const regex = /^\s*(?:(\d{1,3}):)?(\d{1,2}):(\d{2})\s*[-–—]?\s*(.+?)\s*$/gm;
  let match;
  const matches = [];

  while ((match = regex.exec(text)) !== null) {
    const hours = Number(match[1] || 0);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    const title = match[4].trim();
    if (minutes >= 60 || seconds >= 60 || !title) continue;

    const start = hours * 3600 + minutes * 60 + seconds;
    if (totalDuration > 0 && start >= totalDuration) continue;
    matches.push({ start, title, end: 0 });
  }

  if (matches.length === 0) return chapters;

  matches.sort((a, b) => a.start - b.start);
  const unique = [];
  const seen = new Set();
  for (const m of matches) {
    if (!seen.has(m.start)) {
      seen.add(m.start);
      unique.push(m);
    }
  }

  let result = unique;
  if (limit > 0 && result.length > limit) {
    result = result.slice(0, limit);
  }

  for (let i = 0; i < result.length; i++) {
    const nextStart = (i + 1 < result.length) ? result[i + 1].start : (totalDuration || 0);
    result[i].end = nextStart;
  }

  return result.map(m => ({
    title: m.title,
    start: m.start,
    end: m.end,
    isSelected: true,
    videoUrl: '',
  }));
}

function parseSupportedUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch (err) {
    throw new Error('Enlace inválido. Usa una URL completa de YouTube o Bandcamp.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Solo se aceptan enlaces web HTTP o HTTPS.');
  }

  const host = url.hostname.toLowerCase();
  if (host === 'spotify.com' || host.endsWith('.spotify.com')) {
    throw new Error('Los enlaces de Spotify no se procesan en esta versión.');
  }
  if (
    host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be' ||
    host === 'bandcamp.com' || host.endsWith('.bandcamp.com')
  ) return url;
  throw new Error('Enlace no compatible. Usa YouTube o Bandcamp.');
}

// ============================================================
// getMetadata (sin comentarios)
// ============================================================
async function getMetadata(url) {
  if (!url || !url.trim()) throw new Error('❌ URL vacía o inválida');
  const parsedUrl = parseSupportedUrl(url.trim());
  log(`🔍 Obteniendo metadatos para: ${url}`);

  const isBandcampAlbum =
    (parsedUrl.hostname === 'bandcamp.com' || parsedUrl.hostname.endsWith('.bandcamp.com')) &&
    /\/album\//i.test(parsedUrl.pathname);
  const isPlaylistUrl = (url.includes('list=') && !url.includes('watch?v=')) || isBandcampAlbum;
  const args = ['-J', '--encoding', 'utf-8', '--js-runtimes', 'deno', '--ignore-errors'];
  if (!isPlaylistUrl) {
    args.push('--no-playlist');
  }
  args.push(url);

  return new Promise((resolve, reject) => {
    const proc = spawn(ytDlpPath, args, {
      env: { PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
      timeout: 120000,
    });

    let stdout = '', stderr = '', timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
      reject(new Error('⏱️ Tiempo de espera agotado (120s)'));
    }, 120000);

    proc.stdout.on('data', (data) => { stdout += data.toString('utf-8'); });
    proc.stderr.on('data', (data) => { stderr += data.toString('utf-8'); });
    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      log(`❌ Error al ejecutar yt-dlp: ${err.message}`);
      reject(new Error(`No se pudo ejecutar yt-dlp: ${err.message}`));
    });
    proc.on('close', (code) => {
      clearTimeout(timeoutId);
      if (timedOut) return;

      if (!stdout.trim()) {
        log(`❌ stdout vacío, stderr: ${stderr}`);
        reject(new Error(`yt-dlp no devolvió datos: ${stderr || 'Sin detalles'}`));
        return;
      }

      let json;
      try {
        json = JSON.parse(stdout);
      } catch (parseErr) {
        log(`❌ Error parseando JSON: ${parseErr.message}`);
        log(`📄 stdout (primeros 500 chars): ${stdout.substring(0, 500)}`);
        reject(new Error(`No se pudo parsear la respuesta: ${stdout.substring(0, 200)}`));
        return;
      }

      if (json === null || typeof json !== 'object') {
        log(`❌ JSON es null o no es un objeto. stdout (primeros 200): ${stdout.substring(0, 200)}`);
        reject(new Error(`Respuesta JSON inválida (null o no objeto).`));
        return;
      }

      try {
        const result = {
          title: json.title || 'Título no disponible',
          artist: json.artist || json.uploader || json.creator || json.channel || 'Artista desconocido',
          duration: json.duration_string || (json.duration ? formatDuration(json.duration) : '0:00'),
          description: json.description || '',
          thumbnailUrl: json.thumbnail ||
            (Array.isArray(json.thumbnails) && json.thumbnails.length
              ? json.thumbnails[json.thumbnails.length - 1].url
              : '') ||
            'https://img.youtube.com/vi/default.jpg',
          chapters: [],
          isPlaylist: false,
          entries: [],
        };

        if (json.entries && Array.isArray(json.entries) && json.entries.length > 0) {
          result.isPlaylist = true;
          result.entries = json.entries.map(entry => ({
            title: entry.title || 'Pista sin título',
            url: entry.webpage_url || entry.original_url || entry.url ||
              (entry.id ? `https://www.youtube.com/watch?v=${entry.id}` : ''),
            duration: entry.duration_string || (entry.duration ? formatDuration(entry.duration) : '0:00'),
            thumbnail: entry.thumbnail ||
              (Array.isArray(entry.thumbnails) && entry.thumbnails.length
                ? entry.thumbnails[entry.thumbnails.length - 1].url
                : ''),
            artist: entry.artist || entry.uploader || entry.creator || '',
          }));
          result.title = json.title || 'Playlist';
          result.artist = json.artist || json.uploader || 'Varios Artistas';
          result.duration = '--:--';
        } else {
          let chapters = [];
          let totalDuration = json.duration || 0;

          if (json.chapters && Array.isArray(json.chapters) && json.chapters.length > 0) {
            const nativeChapters = json.chapters
              .map(ch => ({
                title: String(ch.title || '').trim(),
                start: Number(ch.start_time),
                end: Number(ch.end_time),
              }))
              .filter(ch =>
                ch.title &&
                Number.isFinite(ch.start) &&
                ch.start >= 0 &&
                (!totalDuration || ch.start < totalDuration)
              )
              .sort((a, b) => a.start - b.start);
            chapters = nativeChapters
              .filter((chapter, index) => index === 0 || chapter.start > nativeChapters[index - 1].start)
              .map((chapter, index, list) => {
                const nextStart = list[index + 1]?.start;
                const chapterEnd = Number.isFinite(chapter.end) && chapter.end > chapter.start
                  ? chapter.end
                  : nextStart || totalDuration;
                const end = nextStart ? Math.min(chapterEnd, nextStart) : chapterEnd;
                return {
                  title: chapter.title,
                  start: chapter.start,
                  end: totalDuration ? Math.min(end, totalDuration) : end,
                  isSelected: true,
                  videoUrl: '',
                };
              });
            log(`📥 ${chapters.length} capítulos nativos encontrados`);
          } else {
            const fromDesc = parseChaptersFromText(result.description, totalDuration, 0);
            if (fromDesc.length > 0) {
              chapters = fromDesc;
              log(`📝 ${chapters.length} capítulos extraídos de la descripción`);
            } else {
              log(`ℹ️ No se encontraron capítulos en la descripción`);
            }
          }
          result.chapters = chapters;
        }

        log(`✅ Metadatos obtenidos: "${result.title}" (${result.chapters.length} capítulos, ${result.entries.length} pistas)`);
        resolve(result);
      } catch (err) {
        log(`❌ Error procesando datos: ${err.message}`);
        log(`📄 json parseado (primeros 200): ${JSON.stringify(json).substring(0, 200)}`);
        reject(new Error(`Error al procesar respuesta: ${err.message}`));
      }
    });
  });
}

// ============================================================
// Normalizar las descargas al formato MP3 para garantizar compatibilidad.
// ============================================================
async function download(item, outputFolder, onProgress) {
  if (!item || !item.url) throw new Error('❌ Item inválido: falta URL');
  parseSupportedUrl(item.url);
  if (!outputFolder || !fs.existsSync(outputFolder)) throw new Error(`❌ Carpeta destino no existe: ${outputFolder}`);
  if (!item.id) item.id = generateId();

  log(`📦 Item recibido: "${item.title}"`);
  log(`📊 splitChapters: ${item.splitChapters}`);
  log(`📊 Capítulos totales: ${item.chapters?.length || 0}`);
  if (item.chapters && item.chapters.length > 0) {
    log(`📊 Primer capítulo: "${item.chapters[0].title}" (inicio: ${item.chapters[0].start}s, fin: ${item.chapters[0].end}s)`);
  }

  const guid = Math.random().toString(36).substring(2, 10);
  const baseTempName = `temp_${guid}`;
  let audioTempPath = '';
  let extension = '';

  log(`🚀 Iniciando descarga ID: ${guid}, URL: ${item.url}`);

  if (!item.title || item.title === 'Obteniendo datos...' || item.title === 'Título no disponible') {
    try {
      const meta = await getMetadata(item.url);
      item.title = meta.title;
      item.artist = meta.artist;
      item.thumbnailUrl = meta.thumbnailUrl;
      if ((!item.chapters || item.chapters.length === 0) && meta.chapters.length > 0) {
        item.chapters = meta.chapters.map(c => ({ ...c, isSelected: true }));
        log(`📥 Capítulos cargados desde metadatos: ${item.chapters.length}`);
      }
    } catch (err) {
      log(`⚠️ No se pudo obtener metadata: ${err.message}`);
    }
  }

  const selectedChapters = (item.chapters || []).filter(c => c.isSelected !== false);

  const hasListParam = item.url.includes('list=');
  const isRealPlaylist = hasListParam && !(item.splitChapters && selectedChapters.length > 0);
  const isPlaylist = item.isPlaylist || isRealPlaylist || selectedChapters.some(c => c.videoUrl);
  const isSingleSplit = !isPlaylist && item.splitChapters && selectedChapters.length > 0;

  log(`🔍 isPlaylist: ${isPlaylist}`);
  log(`🔍 isSingleSplit: ${isSingleSplit}`);
  log(`🔍 selectedChapters: ${selectedChapters.length}`);

  // 1. PLAYLIST
  if (isPlaylist) {
    log('🎵 Descargando playlist...');
    let entries = [];
    if (selectedChapters.length > 0 && selectedChapters.some(c => c.videoUrl)) {
      entries = selectedChapters.map(c => ({ title: c.title, url: c.videoUrl || item.url }));
    } else {
      try {
        const meta = await getMetadata(item.url);
        if (meta.isPlaylist && meta.entries) entries = meta.entries;
        else if (selectedChapters.length > 0) entries = selectedChapters.map(c => ({ title: c.title, url: item.url }));
        else throw new Error('No se pudo obtener la lista de pistas');
      } catch (err) {
        log(`❌ Error obteniendo playlist: ${err.message}`);
        throw new Error(`No se pudo obtener la playlist: ${err.message}`);
      }
    }

    const safeTitle = sanitizeFileName(item.title || 'Playlist');
    const albumFolder = path.join(outputFolder, safeTitle);
    fs.ensureDirSync(albumFolder);
    let trackNum = 1;
    const totalTracks = entries.length;

    for (const entry of entries) {
      const trackTitle = entry.title || `Pista ${trackNum}`;
      onProgress((trackNum * 100) / totalTracks, `Descargando pista ${trackNum}/${totalTracks}: ${trackTitle}`);

      const trackGuid = generateId();
      const trackTempName = `temp_${trackGuid}`;
      const finalVideoUrl = entry.url || item.url;
      let trackTempPath;

      try {
        trackTempPath = await downloadBestAudio(finalVideoUrl, albumFolder, trackTempName);
      } catch (err) {
        log(`❌ Error descargando pista ${trackNum}: ${err.message}`);
        trackNum++;
        continue;
      }

      const trackExtension = path.extname(trackTempPath).slice(1).toLowerCase();
      const tempImages = findImages(albumFolder, trackTempName);
      let imagePath = null;
      if (tempImages.length > 0) {
        imagePath = path.join(albumFolder, tempImages[0]);
        const squarePath = path.join(albumFolder, `${trackTempName}_square.jpg`);
        const square = await makeSquareImage(imagePath, squarePath);
        if (square) {
          imagePath = square;
          fs.removeSync(path.join(albumFolder, tempImages[0]));
        }
      }

      const safeChapterTitle = sanitizeFileName(trackTitle);
      const finalTrackFile = path.join(albumFolder, `${trackNum.toString().padStart(2, '0')} - ${safeChapterTitle}.${trackExtension}`);
      if (fs.existsSync(trackTempPath)) fs.moveSync(trackTempPath, finalTrackFile, { overwrite: true });
      else { log(`⚠️ Archivo temporal no encontrado: ${trackTempPath}`); trackNum++; continue; }

      const albumInfo = {
        album: item.album || item.title || 'Playlist',
        albumArtist: item.albumArtist || item.artist || 'Varios Artistas',
        year: item.year || '',
        genre: item.genre || '',
      };
      const trackInfo = {
        title: trackTitle,
        collaborator: entry.artist || item.artist || '',
        trackNumber: `${trackNum}/${totalTracks}`,
      };
      const coverPath = item.customCoverPath && fs.existsSync(item.customCoverPath)
        ? item.customCoverPath
        : imagePath;
      await applyTags(finalTrackFile, albumInfo, trackInfo, coverPath);

      for (const img of tempImages) fs.removeSync(path.join(albumFolder, img));
      const squareImage = path.join(albumFolder, `${trackTempName}_square.jpg`);
      if (fs.existsSync(squareImage)) fs.removeSync(squareImage);
      trackNum++;
    }

    onProgress(100, 'Playlist completada ✔');
    return { finalPath: albumFolder };
  }

  // 2. VIDEO ÚNICO
  log('🎬 Descargando video único...');
  try {
    audioTempPath = await downloadBestAudio(item.url, outputFolder, baseTempName);
    extension = path.extname(audioTempPath).slice(1).toLowerCase();
  } catch (err) {
    log(`❌ Error en descarga: ${err.message}`);
    throw new Error(`Fallo la descarga: ${err.message}`);
  }

  if (!fs.existsSync(audioTempPath)) {
    log(`❌ Archivo de audio no encontrado: ${audioTempPath}`);
    throw new Error('Archivo de audio temporal no encontrado');
  }

  const tempImages = findImages(outputFolder, baseTempName);
  let imagePath = null;
  if (tempImages.length > 0) {
    imagePath = path.join(outputFolder, tempImages[0]);
    const squarePath = path.join(outputFolder, `${baseTempName}_square.jpg`);
    const square = await makeSquareImage(imagePath, squarePath);
    if (square) {
      imagePath = square;
      fs.removeSync(path.join(outputFolder, tempImages[0]));
    }
  }

  if (item.customCoverPath && fs.existsSync(item.customCoverPath)) {
    imagePath = item.customCoverPath;
  }

  const albumInfo = {
    album: item.album || item.title || 'Single',
    albumArtist: item.albumArtist || item.artist || '',
    year: item.year || '',
    genre: item.genre || '',
  };
  const trackInfo = {
    title: item.title || 'Pista',
    collaborator: item.collaborators || item.artist || '',
    trackNumber: item.trackNumber || '1',
  };

  // --- DIVISIÓN EN CAPÍTULOS ---
  if (isSingleSplit) {
    log(`📝 Dividiendo en ${selectedChapters.length} capítulos...`);
    onProgress(99, 'Extrayendo pistas...');
    const safeTitle = sanitizeFileName(item.title || 'Album');
    const albumFolder = path.join(outputFolder, safeTitle);
    fs.ensureDirSync(albumFolder);

    try {
      await splitChapters(audioTempPath, selectedChapters, albumFolder, item, imagePath, extension);
      log('✅ División completada');
    } catch (err) {
      log(`❌ Error en splitChapters: ${err.message}`);
      if (fs.existsSync(audioTempPath)) fs.removeSync(audioTempPath);
      throw err;
    }

    fs.removeSync(audioTempPath);
    for (const image of tempImages) fs.removeSync(path.join(outputFolder, image));
    const squareImage = path.join(outputFolder, `${baseTempName}_square.jpg`);
    if (fs.existsSync(squareImage)) fs.removeSync(squareImage);
    onProgress(100, 'Pistas extraídas ✔');
    return { finalPath: albumFolder };
  }

  // --- SIN DIVISIÓN: guardar un solo archivo ---
  const finalFileName = `${sanitizeFileName(item.title || 'audio')}.${extension}`;
  const finalPath = path.join(outputFolder, finalFileName);
  if (fs.existsSync(audioTempPath)) fs.moveSync(audioTempPath, finalPath, { overwrite: true });
  else throw new Error('Archivo de audio temporal no encontrado');

  await applyTags(finalPath, albumInfo, trackInfo, imagePath);
  for (const image of tempImages) fs.removeSync(path.join(outputFolder, image));
  const squareImage = path.join(outputFolder, `${baseTempName}_square.jpg`);
  if (fs.existsSync(squareImage)) fs.removeSync(squareImage);

  onProgress(100, 'Completado ✔');
  return { finalPath };
}

// --- Funciones auxiliares ---
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

async function downloadBestAudio(url, outputFolder, filePrefix, includeThumbnail = true) {
  const outputTemplate = path.join(outputFolder, `${filePrefix}.%(ext)s`);
  const args = [
    '--no-check-certificate', '--no-playlist', '--encoding', 'utf-8', '-f', 'bestaudio/best',
    '-x', '--audio-format', 'mp3', '--audio-quality', '320k',
    `--ffmpeg-location=${ffmpegPath}`,
    '--js-runtimes', 'deno',
    '--ignore-errors',
    '--newline', '--force-overwrites', '--no-mtime',
  ];
  if (includeThumbnail) {
    args.push('--write-thumbnail', '--convert-thumbnails', 'jpg', '--no-embed-thumbnail');
  }
  args.push('-o', outputTemplate, url);
  await runYtDlp(args);

  const audioPath = fs.readdirSync(outputFolder)
    .filter(name => name.startsWith(`${filePrefix}.`))
    .map(name => path.join(outputFolder, name))
    .find(filePath => path.extname(filePath).toLowerCase() === '.mp3');
  if (!audioPath) {
    throw new Error(`yt-dlp no generó el archivo MP3 esperado para: ${url}`);
  }
  return audioPath;
}

async function downloadAudioForEditor(url, outputFolder, filePrefix) {
  parseSupportedUrl(url);
  return downloadBestAudio(url, outputFolder, filePrefix, false);
}

function findImages(folder, filePrefix) {
  return fs.readdirSync(folder)
    .filter(name => name.startsWith(`${filePrefix}.`) && IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()));
}

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ytDlpPath, args, { env: { PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' } });
    let stderr = '';
    proc.stderr.on('data', (data) => { stderr += data.toString('utf-8'); });
    proc.on('error', (err) => reject(new Error(`Error al ejecutar yt-dlp: ${err.message}`)));
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`yt-dlp exit code ${code}: ${stderr}`));
      else resolve();
    });
  });
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { env: { ...process.env } });
    let stderr = '';
    proc.stderr.on('data', (data) => { stderr += data.toString('utf-8'); });
    proc.on('error', (err) => reject(new Error(`Error al ejecutar ffmpeg: ${err.message}`)));
    proc.on('close', (code) => {
      if (code !== 0) {
        log(`❌ ffmpeg stderr: ${stderr}`);
        reject(new Error(`ffmpeg error (código ${code}): ${stderr}`));
      } else {
        resolve();
      }
    });
  });
}

async function splitChapters(sourceFile, chapters, destFolder, item, coverPath, extension = 'mp3') {
  if (!fs.existsSync(sourceFile)) {
    throw new Error(`❌ Archivo de origen no encontrado: ${sourceFile}`);
  }

  const sorted = chapters.slice().sort((a, b) => a.start - b.start);
  log(`📂 Procesando ${sorted.length} capítulos en formato MP3...`);
  
  for (let i = 0; i < sorted.length; i++) {
    const cap = sorted[i];
    const start = cap.start;
    const end = cap.end || 0;
    const duration = end - start;
    const trackNum = i + 1;
    const safeTitle = sanitizeFileName(cap.title || `Pista ${trackNum}`);
    
    const outFile = path.join(destFolder, `${trackNum.toString().padStart(2, '0')} - ${safeTitle}.${extension}`);

    if (duration <= 0) {
      log(`⚠️ Capítulo ${trackNum} tiene duración inválida (${duration}s), omitiendo.`);
      continue;
    }

    log(`🎵 Extrayendo capítulo ${trackNum}/${sorted.length}: "${cap.title}" (${formatTime(start)} → ${formatTime(end)}, duración: ${formatTime(duration)})`);

    const tempAudio = path.join(destFolder, `temp_${trackNum}.${extension}`);

    let cutArgs = [
      '-ss', formatTime(start),
      '-i', sourceFile,
      '-t', formatTime(duration),
      '-c:a', 'copy',
    ];
    cutArgs.push('-y', tempAudio);

    await runFfmpeg(cutArgs);

    if (!fs.existsSync(tempAudio) || fs.statSync(tempAudio).size === 0) {
      throw new Error(`Error al recortar el capítulo ${trackNum}: archivo temporal vacío`);
    }

    fs.moveSync(tempAudio, outFile, { overwrite: true });
    fs.removeSync(tempAudio);

    if (fs.existsSync(outFile) && fs.statSync(outFile).size > 0) {
      await applyTags(outFile, {
        album: item.album || item.title || 'Álbum',
        albumArtist: item.albumArtist || item.artist || '',
        year: item.year || '',
        genre: item.genre || '',
      }, {
        title: cap.title || `Pista ${trackNum}`,
        collaborator: cap.collaborator || item.artist || '',
        trackNumber: `${trackNum}/${sorted.length}`,
      }, coverPath);
      log(`✅ Capítulo ${trackNum} guardado: ${path.basename(outFile)} (${formatTime(duration)})`);
    } else {
      log(`⚠️ Capítulo ${trackNum} no se creó correctamente`);
    }
  }

  log('✅ Todos los capítulos extraídos correctamente');
}

async function applyTags(filePath, albumInfo, trackInfo, coverPath) {
  try {
    const { applyMetadata } = require('./tags');
    await applyMetadata(filePath, albumInfo, trackInfo, coverPath);
  } catch (err) {
    log(`⚠️ Error al aplicar metadatos: ${err.message}`);
    throw err;
  }
}

// --- EXPORTAR ---
module.exports = {
  getMetadata,
  download,
  downloadAudioForEditor,
  refreshPaths,
  getBinaryPaths,
};