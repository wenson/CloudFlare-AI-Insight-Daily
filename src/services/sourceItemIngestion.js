import { dataSources, fetchAllData, fetchDataByCategory } from '../dataFetchers.js';
import { upsertSourceItems } from '../d1.js';
import { buildSourceItemRecord } from '../sourceItems.js';
import { getSourceItemFetchDate } from '../utils/date.js';

export const MAX_BACKFILL_DAYS = 31;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function createCountsTemplate() {
  return Object.keys(dataSources).reduce((acc, sourceType) => {
    acc[sourceType] = 0;
    return acc;
  }, {});
}

function formatCounts(counts = createCountsTemplate()) {
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
  includeCounts = true,
  partialSuccess = false,
}) {
  const base = {
    success,
    status,
    message,
    errors,
    date,
    mode,
  };
  if (partialSuccess) {
    base.partialSuccess = true;
  }

  if (!includeCounts) {
    return base;
  }

  const { counts: snapshot, newsItemCount, paperItemCount, socialMediaItemCount } = formatCounts(counts);
  return {
    ...base,
    counts: snapshot,
    newsItemCount,
    paperItemCount,
    socialMediaItemCount,
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

function buildErrorResponse({ message, status, counts, date, mode, errors, includeCounts = true }) {
  return buildResult({
    success: false,
    status,
    message,
    errors: errors ?? [],
    counts,
    date,
    mode,
    includeCounts,
  });
}

function buildSuccessResponse({ message, status, counts, date, mode, errors = [], includeCounts = true }) {
  return buildResult({
    success: true,
    status,
    message,
    errors,
    counts,
    date,
    mode,
    includeCounts,
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
  const requestedDate = date ?? getSourceItemFetchDate(env, formatDateAsString(new Date()));
  const fetchEnv = { ...env, SOURCE_ITEM_FETCH_DATE: requestedDate };

  try {
    if (requireFoloCookie && !foloCookie) {
      return buildErrorResponse({
        message: 'FOLO_COOKIE is required for source item ingestion.',
        status: 500,
        counts,
        date: requestedDate,
        mode,
        errors: [],
        includeCounts: false,
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
        includeCounts: false,
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
        includeCounts: false,
      });
    }

    if (category) {
      const { data, errors: fetchErrors } = await fetchDataByCategory(fetchEnv, category, foloCookie);
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
        const { data, errors: fetchErrors } = await fetchDataByCategory(fetchEnv, sourceType, foloCookie);
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

      const partialSuccess = errors.length > 0;
      return buildResult({
        success: !partialSuccess,
        message: partialSuccess
          ? 'Partial source ingestion completed with errors.'
          : 'Partial source ingestion completed.',
        status: 200,
        counts,
        date: requestedDate,
        mode,
        errors,
        partialSuccess,
      });
    }

    const sourceTypes = Object.keys(dataSources);
    const { data: allUnifiedData, errors: unifiedErrors } = await fetchAllData(fetchEnv, foloCookie);
    const allSourceRecords = [];
    for (const sourceType of sourceTypes) {
      const entries = allUnifiedData[sourceType] || [];
      counts[sourceType] = entries.length;
      if (entries.length > 0) {
        const records = entries.map((item) => buildSourceItemRecord(item, requestedDate));
        allSourceRecords.push(...records);
      }
    }

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
    if (mode === 'manual') {
      throw error;
    }
    return buildErrorResponse({
      message: 'An unexpected error occurred during source item ingestion.',
      status: 500,
      counts,
      date: requestedDate,
      mode,
      errors: [error.message],
      includeCounts: false,
    });
  }
}
