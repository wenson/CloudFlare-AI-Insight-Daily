export function removeMarkdownCodeBlock(text) {
  if (!text) return '';
  let cleanedText = text.trim();

  const jsonFence = '```json';
  const genericFence = '```';

  if (cleanedText.startsWith(jsonFence)) {
    cleanedText = cleanedText.substring(jsonFence.length);
  } else if (cleanedText.startsWith(genericFence)) {
    cleanedText = cleanedText.substring(genericFence.length);
  }

  if (cleanedText.endsWith(genericFence)) {
    cleanedText = cleanedText.substring(0, cleanedText.length - genericFence.length);
  }
  return cleanedText.trim();
}

export function convertEnglishQuotesToChinese(text) {
  const str = String(text);
  return str.replace(/"/g, '“');
}

export function formatMarkdownText(text) {
  const str = String(text);
  return str.replace(/“/g, '"');
}
