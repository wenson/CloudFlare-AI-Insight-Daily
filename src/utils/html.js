export function escapeHtml(unsafe) {
  if (unsafe === null || typeof unsafe === 'undefined') {
    return '';
  }
  const str = String(unsafe);
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return str.replace(/[&<>"']/g, (char) => map[char]);
}

export function stripHtml(html) {
  if (!html) return '';

  let processedHtml = html.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi, (_match, src, alt) => {
    return alt ? `[图片: ${alt} ${src}]` : `[图片: ${src}]`;
  });
  processedHtml = processedHtml.replace(/<img[^>]*src="([^"]*)"[^>]*>/gi, '[图片: $1]');
  processedHtml = processedHtml.replace(/<video[^>]*src="([^"]*)"[^>]*>.*?<\/video>/gi, '[视频: $1]');

  return processedHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function replaceImageProxy(proxy, content) {
  const str = String(content);
  return str.replace(/upload.chinaz.com/g, 'pic.chinaz.com').replace(/https:\/\/pic.chinaz.com/g, proxy + 'https:\/\/pic.chinaz.com');
}
