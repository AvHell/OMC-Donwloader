class ChapterInfo {
  constructor(data = {}) {
    this.title = data.title || 'Capítulo';
    this.start = data.start || 0;
    this.end = data.end || 0;
    this.isSelected = data.isSelected !== undefined ? data.isSelected : true;
    this.videoUrl = data.videoUrl || '';
    this.side = data.side || '';
    this.trackNumber = data.trackNumber || '';
    this.collaborator = data.collaborator || '';
  }
}

module.exports = ChapterInfo;