/**
 * Standalone CLI Script to Generate Snapshots
 * 
 * Usage:
 *   node server/scripts/generateSnapshots.js [options]
 * 
 * Options:
 *   --from=<YYYY-MM-DD>   Start date (default: 2025-01-01)
 *   --to=<YYYY-MM-DD>     End date (default: today)
 *   --dealer=<dealerId>   Optional single dealer ID (e.g. TX400)
 */

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { generateSnapshotsForRange } = require('../services/snapshotGeneratorService');

async function main() {
    const args = process.argv.slice(2);

    let fromDate = '2025-01-01';
    let toDate = new Date();
    let dealerIds = null;

    const fromOpt = args.find(a => a.startsWith('--from='));
    if (fromOpt) fromDate = fromOpt.split('=')[1];

    const toOpt = args.find(a => a.startsWith('--to='));
    if (toOpt) toDate = toOpt.split('=')[1];

    const dealerOpt = args.find(a => a.startsWith('--dealer='));
    if (dealerOpt) dealerIds = [dealerOpt.split('=')[1].trim().toUpperCase()];

    if (!process.env.MONGODB_URI) {
        console.error('Error: MONGODB_URI is not set.');
        process.exit(1);
    }

    console.log(`Connecting to MongoDB...`);
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(`Connected.`);

    await generateSnapshotsForRange({ fromDate, toDate, dealerIds });

    await mongoose.disconnect();
    console.log('Done.');
    process.exit(0);
}

main().catch(err => {
    console.error(`Fatal error: ${err.message}`);
    process.exit(1);
});
