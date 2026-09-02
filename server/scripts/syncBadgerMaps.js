#!/usr/bin/env node
/**
 * CLI Runner for Badger Maps Sync & Backfill
 * 
 * Usage:
 *   node server/scripts/syncBadgerMaps.js
 *   node server/scripts/syncBadgerMaps.js --single WI113
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { syncAllDealersFromBadger, syncSingleDealerFromBadger } = require('../services/badgerSyncService');

async function main() {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const args = process.argv.slice(2);
    const singleIdx = args.indexOf('--single');

    if (singleIdx !== -1 && args[singleIdx + 1]) {
        const dealerId = args[singleIdx + 1];
        console.log(`\n🔄 Syncing single dealer ${dealerId} from Badger Maps...`);
        try {
            const result = await syncSingleDealerFromBadger(dealerId);
            console.log('✅ Dealer synced successfully:');
            console.log(JSON.stringify(result, null, 2));
        } catch (err) {
            console.error('❌ Failed to sync dealer:', err.message);
        }
    } else {
        console.log('\n🚀 Starting Network-Wide Badger Maps Sync...');
        const startTime = Date.now();

        await syncAllDealersFromBadger({
            concurrency: 12,
            onProgress: (status) => {
                const pct = ((status.processed / status.total) * 100).toFixed(1);
                process.stdout.write(`\r[${pct}%] Processed: ${status.processed}/${status.total} | Matched & Updated: ${status.updated} | Errors: ${status.errors.length}`);
            }
        });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n\n🎉 Full Sync completed in ${elapsed}s!`);
    }

    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
}

main().catch((err) => {
    console.error('\n❌ Fatal error in Badger Maps sync:', err);
    process.exit(1);
});
