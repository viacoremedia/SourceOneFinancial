/**
 * Backfill Script
 * 
 * One-time script to process all existing WebhookPayload CSVs into structured data.
 * Safe to re-run — uses upsert logic so duplicates are impossible.
 * 
 * Usage: node scripts/backfill.js
 * 
 * @module scripts/backfill
 */

require('dotenv').config();
const mongoose = require('mongoose');
const WebhookPayload = require('../models/WebhookPayload');
const FileIngestionLog = require('../models/FileIngestionLog');
const DealerGroup = require('../models/DealerGroup');
const DealerLocation = require('../models/DealerLocation');
const DailyDealerSnapshot = require('../models/DailyDealerSnapshot');
const { parseCSV, detectParser } = require('../services/csvParserService');
const { ingestDealerMetricsCSV } = require('../services/dealerMetricsIngestionService');

async function backfill() {
    console.log('=== Dealer Metrics Backfill ===\n');

    // Connect to DB
    await mongoose.connect(process.env.MONGODB_URI, {
        bufferCommands: false,
        serverSelectionTimeoutMS: 30000,
        socketTimeoutMS: 300000
    });
    console.log('Connected to database\n');

    // Find all WebhookPayloads with CSV files, ordered chronologically
    const payloads = await WebhookPayload.find({
        'files.0': { $exists: true }
    }).sort({ receivedAt: 1 }).lean();

    console.log(`Found ${payloads.length} payloads with files\n`);

    let totalProcessed = 0;
    let totalSkipped = 0;
    let totalFailed = 0;
    let totalSnapshots = 0;
    let totalNewDealers = 0;
    let totalNewGroups = 0;

    for (let i = 0; i < payloads.length; i++) {
        const payload = payloads[i];
        const fileIndex = i + 1;

        for (const file of payload.files) {
            const isCSV = file.originalName.endsWith('.csv') ||
                (file.mimeType && file.mimeType.includes('csv'));

            if (!isCSV) {
                console.log(`[${fileIndex}/${payloads.length}] Skipping non-CSV: ${file.originalName}`);
                totalSkipped++;
                continue;
            }

            // Check if already processed
            const existingLog = await FileIngestionLog.findOne({
                sourcePayload: payload._id,
                status: 'completed'
            }).lean();

            if (existingLog) {
                console.log(`[${fileIndex}/${payloads.length}] Already processed: ${file.originalName} (${existingLog.reportDate?.toISOString().slice(0, 10) || 'unknown date'})`);
                totalSkipped++;
                continue;
            }

            // Detect if it's a known format
            try {
                const firstLine = file.content.split('\n')[0];
                const headers = firstLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''));
                const parserName = detectParser(headers);

                if (!parserName) {
                    console.log(`[${fileIndex}/${payloads.length}] Unknown CSV format: ${file.originalName}`);
                    totalSkipped++;
                    continue;
                }

                console.log(`[${fileIndex}/${payloads.length}] Processing: ${file.originalName} (${parserName} format)...`);

                const result = await ingestDealerMetricsCSV(
                    file.content,
                    payload._id,
                    file.originalName
                );

                totalProcessed++;
                totalSnapshots += result.dealersProcessed;
                totalNewDealers += result.newDealers;
                totalNewGroups += result.newGroups;

                console.log(`  ✅ Done: ${result.dealersProcessed} dealers, ${result.newDealers} new, ${result.newGroups} new groups, ${result.processingTimeMs}ms`);
                console.log(`     Report date: ${result.reportDate.toISOString().slice(0, 10)}`);

                if (result.errors.length > 0) {
                    console.log(`     ⚠️  ${result.errors.length} warnings: ${result.errors.slice(0, 3).join('; ')}`);
                }

            } catch (err) {
                totalFailed++;
                console.error(`  ❌ FAILED: ${file.originalName} — ${err.message}`);
            }
        }
    }

    // Print final summary
    console.log('\n=== Backfill Summary ===');
    console.log(`Files processed:  ${totalProcessed}`);
    console.log(`Files skipped:    ${totalSkipped}`);
    console.log(`Files failed:     ${totalFailed}`);
    console.log(`Total snapshots:  ${totalSnapshots}`);
    console.log(`New dealers:      ${totalNewDealers}`);
    console.log(`New groups:       ${totalNewGroups}`);

    // Print collection counts
    const dealerCount = await DealerLocation.countDocuments();
    const groupCount = await DealerGroup.countDocuments();
    const snapshotCount = await DailyDealerSnapshot.countDocuments();
    const logCount = await FileIngestionLog.countDocuments();

    console.log('\n=== Collection Totals ===');
    console.log(`DealerLocation:      ${dealerCount}`);
    console.log(`DealerGroup:         ${groupCount}`);
    console.log(`DailyDealerSnapshot: ${snapshotCount}`);
    console.log(`FileIngestionLog:    ${logCount}`);

    await mongoose.disconnect();
    console.log('\nDone — disconnected from database');
}

backfill().catch(err => {
    console.error('\nBackfill failed:', err);
    process.exit(1);
});
