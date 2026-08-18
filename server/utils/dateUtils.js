/**
 * Date Utilities for Data Anchoring
 * 
 * Provides centralized date resolution to anchor relative timeframes (e.g., MTD, YTD)
 * against the latest imported report/application date in MongoDB rather than wall-clock new Date().
 */

const Application = require('../models/Application');
const DailyDealerSnapshot = require('../models/DailyDealerSnapshot');

let cachedLatestDate = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60 * 1000; // Cache for 1 minute

/**
 * Get the latest report/data date available in the database.
 * Falls back to current date if database is empty.
 * 
 * @returns {Promise<Date>}
 */
async function getLatestDataDate() {
    const nowMs = Date.now();
    if (cachedLatestDate && (nowMs - lastFetchTime) < CACHE_TTL_MS) {
        return new Date(cachedLatestDate.getTime());
    }

    try {
        // Query latest snapshot reportDate
        const latestSnap = await DailyDealerSnapshot.findOne({})
            .sort({ reportDate: -1 })
            .select('reportDate')
            .lean();

        if (latestSnap && latestSnap.reportDate) {
            cachedLatestDate = new Date(latestSnap.reportDate);
            lastFetchTime = nowMs;
            return new Date(cachedLatestDate.getTime());
        }

        // Fallback: Query latest application applicationDate
        const latestApp = await Application.findOne({ applicationDate: { $ne: null } })
            .sort({ applicationDate: -1 })
            .select('applicationDate')
            .lean();

        if (latestApp && latestApp.applicationDate) {
            cachedLatestDate = new Date(latestApp.applicationDate);
            lastFetchTime = nowMs;
            return new Date(cachedLatestDate.getTime());
        }
    } catch (err) {
        console.error('Error fetching latest data date:', err.message);
    }

    return new Date();
}

/**
 * Clear memory cache (e.g., after new data ingestion)
 */
function clearLatestDateCache() {
    cachedLatestDate = null;
    lastFetchTime = 0;
}

module.exports = {
    getLatestDataDate,
    clearLatestDateCache
};
