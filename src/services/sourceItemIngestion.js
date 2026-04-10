import { dataSources, fetchAllData, fetchDataByCategory } from '../dataFetchers.js';
import { upsertSourceItems } from '../d1.js';
import { buildSourceItemRecord } from '../sourceItems.js';
import { getFetchDate, setFetchDate } from '../helpers.js';

export const MAX_BACKFILL_DAYS = 31;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function createCountsTemplate() {
  return Object.keys(dataSources).reduce((acc, sourceType) => {
    acc[sourceType] = 0;
    return acc;
  }, {});
}

function formatCounts(counts) {
  const snapshot = { ...counts };
  return {
    counts: snapshot,
    newsItemCount: snapshot.news ?? 0,
    paperItemCount: snapshot.paper ?? 0,
    socialMediaItemCount: snapshot.socialMedia ?? 0,
  };
}

function buildResult({
  success,
  status,
  message,
  errors,
  counts,
  date,
  mode,
}) {
  const { counts: snapshot, newsItemCount, paperItemCount, socialMediaItemCount } = formatCounts(counts);

  return {
    success,
    status,
    message,
    errors,
    counts: snapshot,
    newsItemCount,
    paperItemCount,
    socialMediaItemCount,
    date,
    mode,
  };
}

function parseDateLabel(label, value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  return date;
}

function formatDateAsString(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function enumerateDateRange(startDate, endDate, maxDays = MAX_BACKFILL_DAYS) {
  const start = parseDateLabel('startDate', startDate);
  const end = parseDateLabel('endDate', endDate);

  if (start.getTime() > end.getTime()) {
    throw new Error('startDate must be before or equal to endDate');
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const totalDays = Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1;

  if (totalDays > maxDays) {
    throw new Error(`Date range cannot exceed ${maxDays} days.`);
  }

  const dates = [];
  for (let current = new Date(start.getTime()); current.getTime() <= end.getTime(); current.setUTCDate(current.getUTCDate() + 1)) {
    dates.push(formatDateAsString(current));
  }

  return dates;
}

function buildErrorResponse({ message, status, counts, date, mode, errors }) {
  return buildResult({
    success: false,
    status,
    message,
    errors: errors ?? [],
    counts,
    date,
    mode,
  });
}

function buildSuccessResponse({ message, status, counts, date, mode, errors = [] }) {
  return buildResult({
    success: true,
    status,
    message,
    errors,
    counts,
    date,
    mode,
  });
}

export async function runSourceItemIngestion(env, options) {
  const {
    date,
    category = null,
    foloCookie = null,
    mode = 'manual',
    requireFoloCookie = false,
    allowPartialSuccess = false,
  } = options;
  const counts = createCountsTemplate();
  const requestedDate = date ?? getFetchDate() ?? formatDateAsString(new Date());
  const previousFetchDate = getFetchDate();
  setFetchDate(requestedDate);

  try {
    if (requireFoloCookie && !foloCookie) {
      return buildErrorResponse({
        message: 'FOLO_COOKIE is required for source item ingestion.',
        status: 500,
        counts,
        date: requestedDate,
        mode,
        errors: [],
      });
    }

    if (category && !Object.hasOwn(dataSources, category)) {
      return buildErrorResponse({
        message: `Unknown category: ${category}`,
        status: 400,
        counts,
        date: requestedDate,
        mode,
        errors: [],
      });
    }

    if (!env?.DB || typeof env.DB.prepare !== 'function' || typeof env.DB.batch !== 'function') {
      return buildErrorResponse({
        message: "D1 database binding 'DB' with batch support is required for /writeData.",
        status: 500,
        counts,
        date: requestedDate,
        mode,
        errors: [],
      });
    }

    if (category) {
      if (!Object.hasOwn(dataSources, category)) {
        return buildErrorResponse({
          message: `Unknown category: ${category}`,
          status: 400,
          counts,
          date: requestedDate,
          mode,
          errors: [],
        });
      }

      const { data, errors: fetchErrors } = await fetchDataByCategory(env, category, foloCookie);
      counts[category] = data.length;

      if (fetchErrors.length > 0) {
        return buildErrorResponse({
          message: `Failed to fetch data for category '${category}'.`,
          status: 502,
          counts,
          date: requestedDate,
          mode,
          errors: fetchErrors,
        });
      }

      if (data.length > 0) {
        const records = data.map((item) => buildSourceItemRecord(item, requestedDate));
        await upsertSourceItems(env.DB, records);
      }

      return buildSuccessResponse({
        message: `Data for category '${category}' fetched and stored.`,
        status: 200,
        counts,
        date: requestedDate,
        mode,
      });
    }

    if (allowPartialSuccess) {
      const sourceTypes = Object.keys(dataSources);
      let failedCategories = 0;
      const errors = [];

      for (const sourceType of sourceTypes) {
        const { data, errors: fetchErrors } = await fetchDataByCategory(env, sourceType, foloCookie);
        counts[sourceType] = data.length;

        if (fetchErrors.length > 0) {
          errors.push(...fetchErrors);
        }

        if (data.length > 0) {
          const records = data.map((item) => buildSourceItemRecord(item, requestedDate));
          await upsertSourceItems(env.DB, records);
        } else if (fetchErrors.length > 0) {
          failedCategories += 1;
        }
      }

      if (failedCategories === sourceTypes.length) {
        return buildErrorResponse({
          message: 'Failed to fetch data for all categories during partial ingestion.',
          status: 502,
          counts,
          date: requestedDate,
          mode,
          errors,
        });
      }

      return buildSuccessResponse({
        message: 'Partial source ingestion completed.',
        status: 200,
        counts,
        date: requestedDate,
        mode,
        errors,
      });
    }

    const { data: allUnifiedData, errors: unifiedErrors } = await fetchAllData(env, foloCookie);
    if (unifiedErrors.length > 0) {
      return buildErrorResponse({
        message: 'Failed to fetch one or more data sources.',
        status: 502,
        counts,
        date: requestedDate,
        mode,
        errors: unifiedErrors,
      });
    }

    const allSourceRecords = [];
    for (const sourceType of Object.keys(dataSources)) {
      const entries = allUnifiedData[sourceType] || [];
      counts[sourceType] = entries.length;
      if (entries.length > 0) {
        const records = entries.map((item) => buildSourceItemRecord(item, requestedDate));
        allSourceRecords.push(...records);
      }
    }

    if (allSourceRecords.length > 0) {
      await upsertSourceItems(env.DB, allSourceRecords);
    }

    return buildSuccessResponse({
      message: 'All data categories fetched and stored.',
      status: 200,
      counts,
      date: requestedDate,
      mode,
    });
  } catch (error) {
    console.error('Error during source item ingestion:', error);
    return buildErrorResponse({
      message: 'An unexpected error occurred during source item ingestion.',
      status: 500,
      counts,
      date: requestedDate,
      mode,
      errors: [error.message],
    });
  } finally {
    setFetchDate(previousFetchDate);
  }
}
