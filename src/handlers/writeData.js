// src/handlers/writeData.js
import { getISODate, getFetchDate } from '../helpers.js';
import { fetchAllData, fetchDataByCategory, dataSources } from '../dataFetchers.js'; // 导入 fetchDataByCategory 和 dataSources
import { upsertSourceItems } from '../d1.js';
import { buildSourceItemRecord } from '../sourceItems.js';

export async function handleWriteData(request, env) {
    const dateParam = getFetchDate();
    const dateStr = dateParam ? dateParam : getISODate();
    console.log(`Starting /writeData process for date: ${dateStr}`);
    let category = null;
    let foloCookie = null;
    
    try {
        // 尝试解析请求体，获取 category 参数
        if (request.headers.get('Content-Type')?.includes('application/json')) {
            const requestBody = await request.json();
            category = requestBody.category;
            foloCookie = requestBody.foloCookie; // 获取 foloCookie
        }

        console.log(`Starting /writeData process for category: ${category || 'all'} with foloCookie presence: ${!!foloCookie}`);

        let dataToStore = {};
        let fetchPromises = [];
        let successMessage = '';
        let errors = [];

        if (category) {
            if (!Object.hasOwn(dataSources, category)) {
                return new Response(JSON.stringify({
                    success: false,
                    message: `Unknown category: ${category}`
                }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            if (!env?.DB || typeof env.DB.prepare !== 'function' || typeof env.DB.batch !== 'function') {
                return new Response(JSON.stringify({
                    success: false,
                    message: "D1 database binding 'DB' with batch support is required for /writeData.",
                }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            // 只抓取指定分类的数据
            const { data: fetchedData, errors: categoryErrors } = await fetchDataByCategory(env, category, foloCookie);
            dataToStore[category] = fetchedData;
            errors = categoryErrors;
            if (errors.length > 0) {
                return new Response(JSON.stringify({
                    success: false,
                    message: `Failed to fetch data for category '${category}'.`,
                    errors,
                    [`${category}ItemCount`]: fetchedData.length,
                }), {
                    status: 502,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            fetchPromises.push(upsertSourceItems(env.DB, fetchedData.map((item) => buildSourceItemRecord(item, dateStr))));
            successMessage = `Data for category '${category}' fetched and stored.`;
            console.log(`Transformed ${category}: ${fetchedData.length} items.`);
        } else {
            if (!env?.DB || typeof env.DB.prepare !== 'function' || typeof env.DB.batch !== 'function') {
                return new Response(JSON.stringify({
                    success: false,
                    message: "D1 database binding 'DB' with batch support is required for /writeData.",
                }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            // 抓取所有分类的数据 (现有逻辑)
            const { data: allUnifiedData, errors: fetchErrors } = await fetchAllData(env, foloCookie);
            errors = fetchErrors;

            if (errors.length > 0) {
                return new Response(JSON.stringify({
                    success: false,
                    message: 'Failed to fetch one or more data sources.',
                    errors,
                    ...Object.fromEntries(Object.entries(allUnifiedData).map(([key, value]) => [`${key}ItemCount`, value.length]))
                }), {
                    status: 502,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            
            const allSourceRecords = [];
            for (const sourceType in dataSources) {
                if (Object.hasOwnProperty.call(dataSources, sourceType)) {
                    dataToStore[sourceType] = allUnifiedData[sourceType] || [];
                    allSourceRecords.push(...dataToStore[sourceType].map((item) => buildSourceItemRecord(item, dateStr)));
                    console.log(`Transformed ${sourceType}: ${dataToStore[sourceType].length} items.`);
                }
            }
            fetchPromises.push(upsertSourceItems(env.DB, allSourceRecords));
            successMessage = `All data categories fetched and stored.`;
        }

        await Promise.all(fetchPromises);

        if (errors.length > 0) {
            console.warn("/writeData completed with errors:", errors);
            return new Response(JSON.stringify({ 
                success: false, 
                message: `${successMessage} Some errors occurred.`, 
                errors: errors, 
                ...Object.fromEntries(Object.entries(dataToStore).map(([key, value]) => [`${key}ItemCount`, value.length]))
            }), {
                status: 200, headers: { 'Content-Type': 'application/json' }
            });
        } else {
            console.log("/writeData process completed successfully.");
            return new Response(JSON.stringify({ 
                success: true, 
                message: successMessage,
                ...Object.fromEntries(Object.entries(dataToStore).map(([key, value]) => [`${key}ItemCount`, value.length]))
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
    } catch (error) {
        console.error("Unhandled error in /writeData:", error);
        return new Response(JSON.stringify({ success: false, message: "An unhandled error occurred during data processing.", error: error.message, details: error.stack }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }
}
