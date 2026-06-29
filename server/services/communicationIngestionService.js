/**
 * Communication Ingestion Service
 * 
 * Ingests the Dealer Communication Table CSV from OMNI into
 * DealerCommunication documents. Upserts on sourceCommunicationId.
 * 
 * Communication records are immutable — they don't change after creation.
 * Re-sending the same record is a harmless no-op.
 * 
 * @module services/communicationIngestionService
 */

const { parseCSV, getParser } = require('./csvParserService');
const DealerCommunication = require('../models/DealerCommunication');
const FileIngestionLog = require('../models/FileIngestionLog');

/**
 * Parse a date string into a Date object.
 */
function parseDate(value) {
    if (!value || String(value).trim() === '') return null;
    const d = new Date(String(value).trim());
    return isNaN(d.getTime()) ? null : d;
}

/**
 * Parse a boolean flag from various formats.
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
 */
function rowGetter(row) {
    const upperMap = {};
    for (const key of Object.keys(row)) {
        upperMap[key.toUpperCase()] = row[key];
    }
    return (columnName) => upperMap[columnName.toUpperCase()] ?? null;
}

/**
 * Ingest a Dealer Communication Table CSV into DealerCommunication documents.
 * 
 * @param {string} csvContent - Raw CSV string
 * @param {string} webhookPayloadId - ObjectId of the source WebhookPayload
 * @param {string} [fileName=''] - Original filename for logging
 * @returns {Promise<Object>} Ingestion summary
 */
async function ingestCommunicationCSV(csvContent, webhookPayloadId, fileName = '') {
    const startTime = Date.now();
    const errors = [];

    // Step 1: Create ingestion log
    let ingestionLog;
    try {
        ingestionLog = await FileIngestionLog.findOneAndUpdate(
            { sourcePayload: webhookPayloadId, parserType: 'dealer_communication' },
            {
                $set: { status: 'processing', fileName },
                $setOnInsert: {
                    sourcePayload: webhookPayloadId,
                    parserType: 'dealer_communication',
                    createdAt: new Date()
                }
            },
            { upsert: true, returnDocument: 'after' }
        );
    } catch (err) {
        if (err.code === 11000) {
            ingestionLog = await FileIngestionLog.findOne({
                sourcePayload: webhookPayloadId,
                parserType: 'dealer_communication'
            });
        } else {
            throw err;
        }
    }

    try {
        // Step 2: Parse CSV
        const parserConfig = getParser('dealer_communication');
        const { rows } = parseCSV(csvContent, parserConfig.expectedHeaders);
        console.log(`  communication ingestion: parsed ${rows.length} rows from "${fileName}"`);

        // Step 3: Build bulk upsert operations
        const bulkOps = [];
        let skipped = 0;

        for (const row of rows) {
            const get = rowGetter(row);
            const sourceCommunicationId = (get('SOURCESYSTEMCOMMUNICATIONID') || '').trim();

            if (!sourceCommunicationId) {
                errors.push('Row missing SOURCESYSTEMCOMMUNICATIONID, skipping');
                skipped++;
                continue;
            }

            const doc = {
                sourceCommunicationId,
                sourceSystem: get('SOURCESYSTEM'),
                communicationOrganizationName: get('COMMUNICATIONORGANIZATIONNAME'),
                communicationUserName: get('COMMUNICATIONUSERNAME'),
                communicationUserFullName: get('COMMUNICATIONUSERFULLNAME'),
                communicationUserEmail: get('COMMUNICATIONUSEREMAIL'),
                communicationType: get('COMMUNICATIONTYPE'),
                recipientRelationshipType: get('RECIPIENTRELATIONSHIPTYPE'),
                recipientOrganizationName: get('RECIPIENTORGANIZATIONNAME'),
                internalRelationshipId1: get('INTERNALRELATIONSHIPID1'),
                internalRelationshipId2: get('INTERNALRELATIONSHIPID2'),
                communicationResult1: get('COMMUNICATIONRESULT1'),
                communicationFeedback1: get('COMMUNICATIONFEEDBACK1'),
                communicationEventDatetime: parseDate(get('COMMUNICATIONEVENTDATETIME')),
                communicationEventTimezone: get('COMMUNICATIONEVENTTIMZEONE') || get('COMMUNICATIONEVENTTIMEZONE'),
                lastCommunicationEventDatetime: parseDate(get('LASTCOMMUNICATIONEVENTDATETIME')),
                isProspect: parseBool(get('ISPROSPECT')),
                isActiveRelationship: parseBool(get('ISACTIVERELATIONSHIP')),
                isInactiveRelationship: parseBool(get('ISINACTIVERELATIONSHIP')),
                sourcePayload: webhookPayloadId,
                lastIngestionDate: new Date()
            };

            bulkOps.push({
                updateOne: {
                    filter: { sourceCommunicationId },
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
            const result = await DealerCommunication.bulkWrite(batch, { ordered: false });
            totalUpserted += result.upsertedCount || 0;
            totalModified += result.modifiedCount || 0;
        }

        const processingTimeMs = Date.now() - startTime;
        console.log(`  communication ingestion: upserted ${totalUpserted} new, updated ${totalModified} existing`);
        console.log(`  communication ingestion: completed in ${processingTimeMs}ms — ${bulkOps.length} records`);

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
        console.error(`  communication ingestion: FAILED after ${processingTimeMs}ms — ${err.message}`);
        throw err;
    }
}

module.exports = { ingestCommunicationCSV };
