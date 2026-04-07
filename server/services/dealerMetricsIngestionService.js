/**
 * Dealer Metrics Ingestion Service
 * 
 * Orchestrates the full CSV → structured data pipeline:
 * 1. Creates FileIngestionLog entry
 * 2. Parses CSV via csvParserService
 * 3. Resolves dealers/groups via dealerGroupDetector
 * 4. Bulk upserts DailyDealerSnapshot documents
 * 5. Updates FileIngestionLog with results
 * 
 * Idempotent — safe to re-process the same CSV (upsert on dealerLocation + reportDate).
 * 
 * @module services/dealerMetricsIngestionService
 */

const { parseCSV, getParser } = require('./csvParserService');
const { resolveDealerBatch } = require('./dealerGroupDetector');
const DailyDealerSnapshot = require('../models/DailyDealerSnapshot');
const FileIngestionLog = require('../models/FileIngestionLog');

/**
 * Parse a date string (YYYY-MM-DD or YYYY-MM-DD HH:MM) into a Date object.
 * Returns null for empty/invalid values.
 * 
 * @param {string|null} value - Date string from CSV
 * @returns {Date|null}
 */
function parseDate(value) {
    if (!value || value.trim() === '') return null;
    const d = new Date(value.trim());
    return isNaN(d.getTime()) ? null : d;
}

/**
 * Parse a numeric string into a Number.
 * Returns null for empty/invalid values.
 * 
 * @param {string|null} value - Numeric string from CSV
 * @returns {number|null}
 */
function parseNumber(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const n = Number(value);
    return isNaN(n) ? null : n;
}

/**
 * Parse a 0/1 flag into a Boolean.
 * Returns false for empty/invalid values.
 * 
 * @param {string|null} value - Flag string from CSV ('0' or '1')
 * @returns {boolean}
 */
function parseFlag(value) {
    return String(value).trim() === '1';
}

/**
 * Determine the report date for a CSV file.
 * 
 * Uses the **maximum** LAST APPLICATION DATE found in the file.
 * Source One sends a daily report where the data lags by 1 day — e.g.,
 * a file uploaded on April 7th contains data through April 6th.
 * The max application date reliably identifies that boundary.
 * 
 * The old "most common" approach failed because many long-inactive dealers
 * share stale application dates, skewing the mode toward older dates.
 * 
 * @param {Object[]} rows - Parsed CSV rows
 * @returns {Date} The report date
 */
function inferReportDate(rows) {
    let maxDate = null;

    for (const row of rows) {
        const dateStr = (row['LAST APPLICATION DATE'] || '').trim();
        if (!dateStr) continue;

        const d = new Date(dateStr);
        if (isNaN(d.getTime())) continue;

        if (!maxDate || d > maxDate) {
            maxDate = d;
        }
    }

    if (maxDate) return maxDate;

    // Fallback: use today's date
    return new Date();
}

/**
 * Ingest a dealer metrics CSV file into structured MongoDB documents.
 * 
 * This is the main entry point for the ingestion pipeline. It's idempotent —
 * re-processing the same CSV will upsert (not duplicate) snapshot documents.
 * 
 * @param {string} csvContent - Raw CSV string content
 * @param {string} webhookPayloadId - ObjectId of the source WebhookPayload document
 * @param {string} [fileName=''] - Original filename for logging
 * @returns {Promise<{
 *   rowCount: number,
 *   dealersProcessed: number,
 *   newDealers: number,
 *   newGroups: number,
 *   errors: string[],
 *   processingTimeMs: number,
 *   reportDate: Date
 * }>}
 */
async function ingestDealerMetricsCSV(csvContent, webhookPayloadId, fileName = '') {
    const startTime = Date.now();
    const errors = [];

    // Step 1: Create ingestion log entry
    let ingestionLog;
    try {
        ingestionLog = await FileIngestionLog.findOneAndUpdate(
            { sourcePayload: webhookPayloadId },
            {
                $set: {
                    status: 'processing',
                    fileName
                },
                $setOnInsert: {
                    sourcePayload: webhookPayloadId,
                    createdAt: new Date()
                }
            },
            { upsert: true, returnDocument: 'after' }
        );
    } catch (err) {
        if (err.code === 11000) {
            ingestionLog = await FileIngestionLog.findOne({ sourcePayload: webhookPayloadId });
        } else {
            throw err;
        }
    }

    try {
        // Step 2: Parse CSV
        const parserConfig = getParser('dealer_metrics');
        const { rows } = parseCSV(csvContent, parserConfig.expectedHeaders);
        console.log(`  ingestion: parsed ${rows.length} rows from "${fileName}"`);

        // Step 3: Determine report date
        const reportDate = inferReportDate(rows);
        console.log(`  ingestion: report date is ${reportDate.toISOString().slice(0, 10)}`);

        // Step 4: Resolve dealers and groups
        const { dealerMap, newDealers, newGroups } = await resolveDealerBatch(rows);

        // Step 5: Build snapshot documents for bulk upsert
        const bulkOps = [];
        let skipped = 0;

        for (const row of rows) {
            const dealerId = (row['DEALER ID'] || '').trim().toUpperCase();
            const dealerInfo = dealerMap.get(dealerId);

            if (!dealerInfo) {
                errors.push(`No dealer info resolved for "${dealerId}"`);
                skipped++;
                continue;
            }

            const activityStatus = (row['APPLICATION ACTIVITY STATUS'] || '').trim().toLowerCase();
            const validStatuses = ['active', '30d_inactive', '60d_inactive', 'long_inactive', 'never_active'];
            if (!validStatuses.includes(activityStatus)) {
                errors.push(`Invalid activity status "${activityStatus}" for dealer ${dealerId}`);
                skipped++;
                continue;
            }

            const snapshot = {
                dealerLocation: dealerInfo.dealerLocationId,
                dealerGroup: dealerInfo.dealerGroupId || null,
                reportDate: reportDate,
                lastApplicationDate: parseDate(row['LAST APPLICATION DATE']),
                priorApplicationDate: parseDate(row['PRIOR APPLICATION DATE']),
                daysSinceLastApplication: parseNumber(row['DAYS SINCE LAST APPLICATION']),
                lastApprovalDate: parseDate(row['LAST APPROVAL DATE']),
                daysSinceLastApproval: parseNumber(row['DAYS SINCE LAST APPROVAL']),
                lastBookedDate: parseDate(row['LAST BOOKED DATE']),
                daysSinceLastBooking: parseNumber(row['DAYS SINCE LAST BOOKING']),
                activityStatus: activityStatus,
                latestCommunicationDatetime: parseDate(row['LATEST COMMUNICATION DATETIME']),
                reactivatedAfterVisit: parseFlag(row['REACTIVATED AFTER SALES VISIT FLAG']),
                daysFromVisitToNextApp: parseNumber(row['DAYS FROM VISIT TO NEXT APPLICATION']),
                sourcePayload: webhookPayloadId
            };

            bulkOps.push({
                updateOne: {
                    filter: {
                        dealerLocation: dealerInfo.dealerLocationId,
                        reportDate: reportDate
                    },
                    update: { $set: snapshot },
                    upsert: true
                }
            });
        }

        // Step 6: Execute bulk upsert
        let bulkResult = null;
        if (bulkOps.length > 0) {
            // Process in batches of 500 to avoid hitting MongoDB limits
            const BATCH_SIZE = 500;
            let totalUpserted = 0;
            let totalModified = 0;

            for (let i = 0; i < bulkOps.length; i += BATCH_SIZE) {
                const batch = bulkOps.slice(i, i + BATCH_SIZE);
                const result = await DailyDealerSnapshot.bulkWrite(batch, { ordered: false });
                totalUpserted += result.upsertedCount || 0;
                totalModified += result.modifiedCount || 0;
            }

            console.log(`  ingestion: upserted ${totalUpserted} new, updated ${totalModified} existing snapshots`);
        }

        const processingTimeMs = Date.now() - startTime;

        // Step 7: Update ingestion log with success
        await FileIngestionLog.updateOne(
            { _id: ingestionLog._id },
            {
                $set: {
                    status: 'completed',
                    reportDate,
                    rowCount: rows.length,
                    dealersProcessed: bulkOps.length,
                    newDealers,
                    newGroups,
                    errorReason: errors.length > 0 ? errors.slice(0, 10).join('; ') : null,
                    processingTimeMs,
                    completedAt: new Date()
                }
            }
        );

        const summary = {
            rowCount: rows.length,
            dealersProcessed: bulkOps.length,
            newDealers,
            newGroups,
            errors,
            processingTimeMs,
            reportDate
        };

        console.log(`  ingestion: completed in ${processingTimeMs}ms — ${bulkOps.length} dealers, ${newDealers} new, ${newGroups} new groups`);

        // Step 8: Trigger monthly rollup rebuild for the affected month
        let rollupsRebuilt = false;
        try {
            const { rebuildRollupsForDate } = require('./rollupService');
            await rebuildRollupsForDate(reportDate);
            rollupsRebuilt = true;
        } catch (rollupErr) {
            console.error(`  ingestion: rollup rebuild failed (non-fatal): ${rollupErr.message}`);
        }

        return summary;

    } catch (err) {
        // Update ingestion log with failure
        const processingTimeMs = Date.now() - startTime;
        await FileIngestionLog.updateOne(
            { _id: ingestionLog._id },
            {
                $set: {
                    status: 'failed',
                    errorReason: err.message,
                    processingTimeMs,
                    completedAt: new Date()
                }
            }
        );

        console.error(`  ingestion: FAILED after ${processingTimeMs}ms — ${err.message}`);
        throw err;
    }
}

module.exports = {
    ingestDealerMetricsCSV
};
