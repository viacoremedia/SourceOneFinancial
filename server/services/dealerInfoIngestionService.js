/**
 * Dealer Information Ingestion Service
 * 
 * Ingests the Dealer Information Table CSV from OMNI.
 * Unlike the other two tables which create new document types,
 * this one enriches existing DealerLocation documents with additional
 * fields (address, phone, lifecycle dates, platform flags, etc.).
 * 
 * If a dealer doesn't exist yet, it creates a new DealerLocation.
 * If it does exist, it updates the existing record with the new fields.
 * 
 * @module services/dealerInfoIngestionService
 */

const { parseCSV, getParser } = require('./csvParserService');
const DealerLocation = require('../models/DealerLocation');
const DealerGroup = require('../models/DealerGroup');
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
 * Ingest a Dealer Information Table CSV, enriching DealerLocation documents.
 * 
 * @param {string} csvContent - Raw CSV string
 * @param {string} webhookPayloadId - ObjectId of the source WebhookPayload
 * @param {string} [fileName=''] - Original filename for logging
 * @returns {Promise<Object>} Ingestion summary
 */
async function ingestDealerInfoCSV(csvContent, webhookPayloadId, fileName = '') {
    const startTime = Date.now();
    const errors = [];

    // Step 1: Create ingestion log
    let ingestionLog;
    try {
        ingestionLog = await FileIngestionLog.findOneAndUpdate(
            { sourcePayload: webhookPayloadId, parserType: 'dealer_information' },
            {
                $set: { status: 'processing', fileName },
                $setOnInsert: {
                    sourcePayload: webhookPayloadId,
                    parserType: 'dealer_information',
                    createdAt: new Date()
                }
            },
            { upsert: true, returnDocument: 'after' }
        );
    } catch (err) {
        if (err.code === 11000) {
            ingestionLog = await FileIngestionLog.findOne({
                sourcePayload: webhookPayloadId,
                parserType: 'dealer_information'
            });
        } else {
            throw err;
        }
    }

    try {
        // Step 2: Parse CSV
        const parserConfig = getParser('dealer_information');
        const { rows } = parseCSV(csvContent, parserConfig.expectedHeaders);
        console.log(`  dealer info ingestion: parsed ${rows.length} rows from "${fileName}"`);

        // Step 3: Build bulk upsert operations
        const bulkOps = [];
        let skipped = 0;
        let newDealers = 0;

        // Pre-load existing dealer IDs for new-dealer counting
        const existingDealers = new Set(
            (await DealerLocation.find({}, { dealerId: 1 }).lean()).map(d => d.dealerId)
        );

        for (const row of rows) {
            const get = rowGetter(row);
            const dealerId = (get('DEALERID') || '').trim().toUpperCase();

            if (!dealerId) {
                errors.push('Row missing DEALERID, skipping');
                skipped++;
                continue;
            }

            const dealerName = (get('DEALERNAME') || '').trim();
            if (!dealerName) {
                errors.push(`Dealer ${dealerId} missing DEALERNAME, skipping`);
                skipped++;
                continue;
            }

            if (!existingDealers.has(dealerId)) {
                newDealers++;
            }

            const updateFields = {
                dealerName,
                clientDealerId: get('CLIENTDEALERID'),
                globalId: get('GLOBALID'),
                dba: get('DBA'),
                dealerGroupName: get('DEALERGROUP'),
                region: get('REGION'),
                dealerAddress: get('DEALERADDRESS'),
                dealerCity: get('DEALERCITY'),
                dealerState: get('DEALERSTATE'),
                dealerPostalCode: get('DEALERPOSTALCODE'),
                county: get('COUNTY'),
                dealerPhoneNumber: get('DEALERPHONENUMBER'),
                dealerFaxNumber: get('DEALERFAXNUMBER'),
                enrollmentDate: parseDate(get('ENROLLMENTDATE')),
                activatedDate: parseDate(get('ACTIVATEDDATE')),
                deactivatedDate: parseDate(get('DEACTIVATEDDATE')),
                dealerAgreementDate: parseDate(get('DEALERAGREEMENTDATE')),
                dealerLicenseExpiration: parseDate(get('DEALERLICENSEEXPIRATION')),
                terminationDate: parseDate(get('TERMINATIONDATE')),
                isActive: parseBool(get('ISACTIVE')),
                collateralType: get('COLLATERALTYPE'),
                dealerRepresentative: get('DEALERREPRESENTATIVE'),
                documentDelivery: get('DOCUMENTDELIVERY'),
                bookout: get('BOOKOUT'),
                isActiveForDealerTrack: parseBool(get('ISACTIVEFORDEALERTRACK')),
                isActiveForRouteOne: parseBool(get('ISACTIVEFORROUTEONE')),
                isEsignAllowed: parseBool(get('ISESIGNALLOWED')),
                isFundingReserveHold: parseBool(get('ISFUNDINGRESERVEHOLD')),
                isBmoDealer: parseBool(get('ISBMODEALER')),
                isMedallionDealer: parseBool(get('ISMEDALLIONDEALER')),
                isActiveForRouteOneCanada: parseBool(get('ISACTIVEFORROUTEONECANADA')),
                isActiveForCreditLane: parseBool(get('ISACTIVEFORCREDITLANE')),
                isActiveForCudl: parseBool(get('ISACTIVEFORCUDL')),
                isSourceOneOnly: parseBool(get('ISSOURCEONEONLY')),
                isFsbDealer: parseBool(get('ISFSBDEALER')),
                isSalesTaxRequired: parseBool(get('ISSALESTAXREQUIRED')),
                isMultiDecisionEnabled: parseBool(get('ISMULTIDECISIONENABLED')),
                lastInfoIngestionDate: new Date()
            };

            bulkOps.push({
                updateOne: {
                    filter: { dealerId },
                    update: {
                        $set: updateFields,
                        $setOnInsert: { dealerId, createdAt: new Date() }
                    },
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
            const result = await DealerLocation.bulkWrite(batch, { ordered: false });
            totalUpserted += result.upsertedCount || 0;
            totalModified += result.modifiedCount || 0;
        }

        const processingTimeMs = Date.now() - startTime;
        console.log(`  dealer info ingestion: upserted ${totalUpserted} new, updated ${totalModified} existing`);
        console.log(`  dealer info ingestion: completed in ${processingTimeMs}ms — ${bulkOps.length} dealers`);

        // Step 5: Update ingestion log
        await FileIngestionLog.updateOne(
            { _id: ingestionLog._id },
            {
                $set: {
                    status: 'completed',
                    rowCount: rows.length,
                    dealersProcessed: bulkOps.length,
                    newDealers,
                    errorReason: errors.length > 0 ? errors.slice(0, 10).join('; ') : null,
                    processingTimeMs,
                    completedAt: new Date()
                }
            }
        );

        return {
            rowCount: rows.length,
            dealersProcessed: bulkOps.length,
            newDealers,
            updatedDealers: totalModified,
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
        console.error(`  dealer info ingestion: FAILED after ${processingTimeMs}ms — ${err.message}`);
        throw err;
    }
}

module.exports = { ingestDealerInfoCSV };
