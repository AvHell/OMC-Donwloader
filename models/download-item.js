class DownloadItem {
  constructor(data = {}) {
    this.id = data.id || Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    this.url = data.url || '';
    this.title = data.title || 'Obteniendo datos...';
    this.artist = data.artist || 'Esperando...';
    this.album = data.album || '';
    this.albumArtist = data.albumArtist || '';
    this.collaborators = data.collaborators || '';
    this.genre = data.genre || '';
    this.year = data.year || '';
    this.trackNumber = data.trackNumber || '';
    this.duration = data.duration || '--:--';
    this.thumbnailUrl = data.thumbnailUrl || 'https://img.youtube.com/vi/default.jpg';
    this.customCoverPath = data.customCoverPath || '';
    this.format = data.format || 'MP3';
    this.splitChapters = data.splitChapters || false;
    this.chapters = data.chapters || [];
    this.status = data.status || 'En cola';
    this.progress = data.progress || 0;
    this.isDownloading = data.isDownloading || false;
    this.isCompleted = data.isCompleted || false;
    this.finalPath = data.finalPath || '';
    this.speed = '';
    this.eta = '';
  }
}

module.exports = DownloadItem;