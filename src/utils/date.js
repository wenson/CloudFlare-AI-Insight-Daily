let fetchDate = getISODate();

export function setFetchDate(date) {
  fetchDate = date;
}

export function getFetchDate() {
  return fetchDate;
}

export function getISODate(dateObj = new Date()) {
  const options = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Shanghai',
  };
  return dateObj.toLocaleDateString('en-CA', options);
}

export function convertToShanghaiTime(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const options = {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
    timeZone: 'Asia/Shanghai',
  };

  const shanghaiDateString = new Intl.DateTimeFormat('en-US', options).format(date);
  const shanghaiDate = new Date(shanghaiDateString);
  return Number.isNaN(shanghaiDate.getTime()) ? null : shanghaiDate;
}

export function getShanghaiTime() {
  const date = new Date();
  const options = {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
    timeZone: 'Asia/Shanghai',
  };

  const shanghaiDateString = new Intl.DateTimeFormat('en-US', options).format(date);
  return new Date(shanghaiDateString);
}

export function isDateWithinLastDays(dateString, days, referenceDate = fetchDate) {
  const itemDate = convertToShanghaiTime(dateString);
  if (!itemDate) {
    return false;
  }

  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);

  const diffTime = today.getTime() - itemDate.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays >= 0 && diffDays < days;
}

export function formatDateToChinese(isoDateString) {
  if (!isoDateString) return '';
  const date = new Date(isoDateString);
  const options = {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    timeZone: 'Asia/Shanghai',
  };
  return new Intl.DateTimeFormat('zh-CN', options).format(date);
}

export function formatDateToChineseWithTime(isoDateString) {
  if (!isoDateString) return '';
  const date = new Date(isoDateString);
  const options = {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Shanghai',
  };
  return new Intl.DateTimeFormat('zh-CN', options).format(date);
}

export function formatRssDate(date) {
  if (!date) return new Date().toUTCString();
  return date.toUTCString();
}

export function formatDateToGMT0WithTime(isoDateString) {
  if (!isoDateString) return '';
  const date = new Date(isoDateString);
  const options = {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'GMT',
  };
  return new Intl.DateTimeFormat('zh-CN', options).format(date);
}

export function formatDateToGMT8WithTime(isoDateString) {
  if (!isoDateString) return '';
  const date = new Date(isoDateString);
  const options = {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Shanghai',
  };
  return new Intl.DateTimeFormat('zh-CN', options).format(date);
}

export function getSourceItemFetchDate(env, fallbackDate = fetchDate) {
  return env?.SOURCE_ITEM_FETCH_DATE ?? fallbackDate;
}
