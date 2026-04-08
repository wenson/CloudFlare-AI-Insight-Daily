// src/dataFetchers.js
import NewsAggregatorDataSource from './dataSources/newsAggregator.js';
import PapersDataSource from './dataSources/papers.js';
import TwitterDataSource from './dataSources/twitter.js';
import RedditDataSource from './dataSources/reddit.js';


// Register data sources as arrays to support multiple sources per type
export const dataSources = {
    news: { name: '新闻', sources: [NewsAggregatorDataSource] },
    paper: { name: '论文', sources: [PapersDataSource] },
    socialMedia: { name: '社交平台', sources: [TwitterDataSource, RedditDataSource] },
    // Add new data sources here as arrays, e.g.,
    // newType: { name: '新类型', sources: [NewTypeDataSource1, NewTypeDataSource2] },
};

/**
 * Fetches and transforms data from all data sources for a specified type.
 * @param {string} sourceType - The type of data source (e.g., 'news', 'paper', 'socialMedia').
 * @param {object} env - The environment variables.
 * @param {string} [foloCookie] - The Folo authentication cookie.
 * @returns {Promise<{data: Array<object>, errors: string[]}>} Fetch result and captured upstream errors.
 */
export async function fetchAndTransformDataForType(sourceType, env, foloCookie) {
    const sources = dataSources[sourceType].sources;
    if (!sources || !Array.isArray(sources)) {
        console.error(`No data sources registered for type: ${sourceType}`);
        return {
            data: [],
            errors: [`No data sources registered for type: ${sourceType}`],
        };
    }

    let allUnifiedDataForType = [];
    const errors = [];
    for (const dataSource of sources) {
        try {
            // Pass foloCookie to the fetch method of the data source
            const rawData = await dataSource.fetch(env, foloCookie);
            const unifiedData = dataSource.transform(rawData, sourceType);
            allUnifiedDataForType = allUnifiedDataForType.concat(unifiedData);
        } catch (error) {
            console.error(`Error fetching or transforming data from source ${dataSource.type} for type ${sourceType}:`, error.message);
            errors.push(`${sourceType}: ${error.message}`);
        }
    }

    // Sort by published_date in descending order for each type
    allUnifiedDataForType.sort((a, b) => {
        const dateA = new Date(a.published_date);
        const dateB = new Date(b.published_date);
        return dateB.getTime() - dateA.getTime();
    });

    return {
        data: allUnifiedDataForType,
        errors,
    };
}

/**
 * Fetches and transforms data from all registered data sources across all types.
 * @param {object} env - The environment variables.
 * @param {string} [foloCookie] - The Folo authentication cookie.
 * @returns {Promise<{data: object, errors: string[]}>} Fetched data plus aggregated upstream errors.
 */
export async function fetchAllData(env, foloCookie) {
    const allUnifiedData = {};
    const errors = [];
    const fetchPromises = [];

    for (const sourceType in dataSources) {
        if (Object.hasOwnProperty.call(dataSources, sourceType)) {
            fetchPromises.push(
                fetchAndTransformDataForType(sourceType, env, foloCookie).then(result => {
                    allUnifiedData[sourceType] = result.data;
                    errors.push(...result.errors);
                })
            );
        }
    }
    await Promise.allSettled(fetchPromises); // Use allSettled to ensure all promises complete
    return {
        data: allUnifiedData,
        errors,
    };
}

/**
 * Fetches and transforms data from all data sources for a specific category.
 * @param {object} env - The environment variables.
 * @param {string} category - The category to fetch data for (e.g., 'news', 'paper', 'socialMedia').
 * @param {string} [foloCookie] - The Folo authentication cookie.
 * @returns {Promise<{data: Array<object>, errors: string[]}>} Fetched data plus category-scoped errors.
 */
export async function fetchDataByCategory(env, category, foloCookie) {
    if (!Object.hasOwn(dataSources, category)) {
        console.warn(`Attempted to fetch data for unknown category: ${category}`);
        return {
            data: [],
            errors: [`Unknown category: ${category}`],
        };
    }
    return await fetchAndTransformDataForType(category, env, foloCookie);
}
