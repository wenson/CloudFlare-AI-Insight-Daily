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

function collapseWhitespace(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

function removeCdataMarkers(text) {
  return String(text).replace(/<!\[CDATA\[/gi, ' ').replace(/\]\]>/g, ' ');
}

export function stripHtml(html) {
  if (!html) return '';

  let processedHtml = removeCdataMarkers(html);
  processedHtml = processedHtml.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi, (_match, src, alt) => {
    return alt ? `[图片: ${alt} ${src}]` : `[图片: ${src}]`;
  });
  processedHtml = processedHtml.replace(/<img[^>]*src="([^"]*)"[^>]*>/gi, '[图片: $1]');
  processedHtml = processedHtml.replace(/<video[^>]*src="([^"]*)"[^>]*>.*?<\/video>/gi, '[视频: $1]');

  return collapseWhitespace(processedHtml.replace(/<[^>]+>/g, ' '));
}

function removeLeadingTitleBoilerplate(text, title) {
  const normalizedTitle = collapseWhitespace(title || '');
  if (!normalizedTitle) {
    return text;
  }

  const titleIndex = text.indexOf(normalizedTitle);
  if (titleIndex > 0 && titleIndex <= 120) {
    text = text.slice(titleIndex);
  }

  if (!text.startsWith(normalizedTitle)) {
    return text;
  }

  const rest = collapseWhitespace(text.slice(normalizedTitle.length));
  const cleanedRest = collapseWhitespace(
    rest.replace(/^(?:[\p{L}\p{N}_-]{1,24}\s+)?发自\s+[^|]{1,40}\|\s*公众号\s+[\p{L}\p{N}_-]{1,40}\s*/u, '')
  );

  return cleanedRest ? `${normalizedTitle} ${cleanedRest}` : normalizedTitle;
}

export function normalizeDescriptionText(input, title = '') {
  if (!input) {
    return '';
  }

  let text = stripHtml(input);
  if (!text) {
    return '';
  }

  text = text.replace(
    /^(?:[\p{L}\p{N}_-]{1,24}\s+)?\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+来源[:：][^\s]+\s+/u,
    '',
  );
  text = removeLeadingTitleBoilerplate(text, title);

  return collapseWhitespace(text);
}

export function replaceImageProxy(proxy, content) {
  const str = String(content);
  return str.replace(/upload.chinaz.com/g, 'pic.chinaz.com').replace(/https:\/\/pic.chinaz.com/g, proxy + 'https:\/\/pic.chinaz.com');
}
