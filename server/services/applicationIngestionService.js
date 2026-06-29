/**
 * Application Ingestion Service
 * 
 * Ingests the Main Application Table CSV from OMNI into Application documents.
 * Upserts on applicationId — safe to re-process the same CSV (idempotent).
 * 
 * Applications change status over time (submitted → approved → booked),
 * so each upsert overwrites all fields for the matching applicationId.
 * 
 * @module services/applicationIngestionService
 */

const { parseCSV, getParser } = require('./csvParserService');
const Application = require('../models/Application');
const FileIngestionLog = require('../models/FileIngestionLog');

/**
 * Parse a date string into a Date object.
 * Returns null for empty/invalid values.
 */
function parseDate(value) {
    if (!value || String(value).trim() === '') return null;
    const d = new Date(String(value).trim());
    return isNaN(d.getTime()) ? null : d;
}

/**
 * Parse a numeric string into a Number.
 * Returns null for empty/invalid values.
 */
function parseNumber(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const n = Number(String(value).replace(/[$,%]/g, ''));
    return isNaN(n) ? null : n;
}

/**
 * Parse a boolean flag from various formats.
 * Handles: "1"/"0", "true"/"false", "yes"/"no", "Y"/"N"
 */
function parseBool(value) {
    if (value === null || value === undefined) return null;
    const v = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'y'].includes(v)) return true;
    if (['0', 'false', 'no', 'n'].includes(v)) return false;
    return null;
}

/**
 * Build a case-insensitive getter for CSV row values.
 * Since OMNI column casing is inconsistent, this lets us access
 * row['Applicationid'] or row['APPLICATIONID'] transparently.
 * 
 * @param {Object} row - A parsed CSV row object
 * @returns {function(string): string|null} Getter function
 */
function rowGetter(row) {
    const upperMap = {};
    for (const key of Object.keys(row)) {
        upperMap[key.toUpperCase()] = row[key];
    }
    return (columnName) => upperMap[columnName.toUpperCase()] ?? null;
}

/**
 * Ingest a Main Application Table CSV into Application documents.
 * 
 * @param {string} csvContent - Raw CSV string
 * @param {string} webhookPayloadId - ObjectId of the source WebhookPayload
 * @param {string} [fileName=''] - Original filename for logging
 * @returns {Promise<Object>} Ingestion summary
 */
async function ingestApplicationCSV(csvContent, webhookPayloadId, fileName = '') {
    const startTime = Date.now();
    const errors = [];

    // Step 1: Create ingestion log
    let ingestionLog;
    try {
        ingestionLog = await FileIngestionLog.findOneAndUpdate(
            { sourcePayload: webhookPayloadId, parserType: 'main_application' },
            {
                $set: { status: 'processing', fileName },
                $setOnInsert: {
                    sourcePayload: webhookPayloadId,
                    parserType: 'main_application',
                    createdAt: new Date()
                }
            },
            { upsert: true, returnDocument: 'after' }
        );
    } catch (err) {
        if (err.code === 11000) {
            ingestionLog = await FileIngestionLog.findOne({
                sourcePayload: webhookPayloadId,
                parserType: 'main_application'
            });
        } else {
            throw err;
        }
    }

    try {
        // Step 2: Parse CSV
        const parserConfig = getParser('main_application');
        const { rows } = parseCSV(csvContent, parserConfig.expectedHeaders);
        console.log(`  application ingestion: parsed ${rows.length} rows from "${fileName}"`);

        // Step 3: Build bulk upsert operations
        const bulkOps = [];
        let skipped = 0;

        for (const row of rows) {
            const get = rowGetter(row);
            const applicationId = (get('APPLICATIONID') || '').trim();

            if (!applicationId) {
                errors.push('Row missing APPLICATIONID, skipping');
                skipped++;
                continue;
            }

            const doc = {
                applicationId,
                status: get('STATUS'),
                underwriter: get('UNDERWRITER'),
                lender: get('LENDER'),
                applicationDate: parseDate(get('APPLICATIONDATE')),
                approvalDate: parseDate(get('APPROVALDATE')),
                bookedDate: parseDate(get('BOOKEDDATE')),
                amountFinanced: parseNumber(get('AMOUNTFINANCED')),
                term: parseNumber(get('TERM')),
                apr: parseNumber(get('APR')),
                cashDown: parseNumber(get('CASHDOWN')),
                totalDown: parseNumber(get('TOTALDOWN')),
                ltv: parseNumber(get('LTV')),
                dealerReserveAmount: parseNumber(get('DEALERRESERVEAMOUNT')),
                dealerReservePercent: parseNumber(get('DEALERRESERVEPERCENT')),
                backend: parseNumber(get('BACKEND')),
                invoice: parseNumber(get('INVOICE')),
                dealerMinimumRate: parseNumber(get('DEALERMINIMUMRATE')),
                coficoAuto8: parseNumber(get('COFICOAUTO8')),
                primaryFicoAuto8: parseNumber(get('PRIMARYFICOAUTO8')),
                dti: parseNumber(get('DTI')),
                pti: parseNumber(get('PTI')),
                collateralYear: get('COLLATERALYEAR'),
                collateralType: get('COLLATERALTYPE'),
                collateralNewUsed: get('COLLATERALNEWUSED'),
                dealerName: get('DEALERNAME'),
                dealerGroup: get('DEALERGROUP'),
                dealerState: get('DEALERSTATE'),
                dealerCity: get('DEALERCITY'),
                dealerRepresentative: get('DEALERREPRESENTATIVE'),
                clientDealerId: get('CLIENTDEALERID'),
                timeToBook: parseNumber(get('TIMETOBOOK')),
                timeToDecision: parseNumber(get('TIMETODECISION')),
                timeToLastFund: parseNumber(get('TIMETOLASTFUND')),
                timeToLastDecisionToLastContract: parseNumber(get('TIMETOLASTDECISIONTOLASTCONTRACT')),
                programManual: get('PROGRAMMANUAL'),
                programDefault: get('PROGRAMDEFAULT'),
                primaryState: get('PRIMARYSTATE'),
                applicationSubmittedUser: get('APPLICATIONSUBMITTEDUSER'),
                isBusinessApp: parseBool(get('ISBUSINESSAPP')),
                wasApproved: parseBool(get('WASAPPROVED')),
                wasApprovedNotBooked: parseBool(get('WASAPPROVEDNOTBOOKED')),
                sourcePayload: webhookPayloadId,
                lastIngestionDate: new Date()
            };

            bulkOps.push({
                updateOne: {
                    filter: { applicationId },
                    update: { $set: doc },
                    upsert: true
                }
            });
        }

        // Step 4: Execute bulk upsert in batches
        let totalUpserted = 0;
        let totalModified = 0;
        const BATCH_SIZE = 500;

        for (let i = 0; i < bulkOps.length; i += BATCH_SIZE) {
            const batch = bulkOps.slice(i, i + BATCH_SIZE);
            const result = await Application.bulkWrite(batch, { ordered: false });
            totalUpserted += result.upsertedCount || 0;
            totalModified += result.modifiedCount || 0;
        }

        const processingTimeMs = Date.now() - startTime;
        console.log(`  application ingestion: upserted ${totalUpserted} new, updated ${totalModified} existing`);
        console.log(`  application ingestion: completed in ${processingTimeMs}ms — ${bulkOps.length} records`);

        // Step 5: Update ingestion log
        await FileIngestionLog.updateOne(
            { _id: ingestionLog._id },
            {
                $set: {
                    status: 'completed',
                    rowCount: rows.length,
                    dealersProcessed: bulkOps.length,
                    newDealers: totalUpserted,
                    errorReason: errors.length > 0 ? errors.slice(0, 10).join('; ') : null,
                    processingTimeMs,
                    completedAt: new Date()
                }
            }
        );

        return {
            rowCount: rows.length,
            recordsProcessed: bulkOps.length,
            newRecords: totalUpserted,
            updatedRecords: totalModified,
            skipped,
            errors,
            processingTimeMs
        };

    } catch (err) {
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
        console.error(`  application ingestion: FAILED after ${processingTimeMs}ms — ${err.message}`);
        throw err;
    }
}

module.exports = { ingestApplicationCSV };
