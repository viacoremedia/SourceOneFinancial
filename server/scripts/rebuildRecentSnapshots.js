/**
 * Standalone CLI Script to Rebuild Recent Snapshots and Monthly Rollups
 * 
 * Usage:
 *   node server/scripts/rebuildRecentSnapshots.js [options]
 * 
 * Options:
 *   --months=<N>          Number of months back (default: 3)
 *   --from=<YYYY-MM-DD>   Explicit start date override
 *   --to=<YYYY-MM-DD>     Explicit end date override
 */

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { rebuildRecentSnapshots } = require('../services/snapshotGeneratorService');

async function main() {
    const args = process.argv.slice(2);

    let monthsBack = 3;
    let fromDate = null;
    let toDate = null;

    const monthsOpt = args.find(a => a.startsWith('--months='));
    if (monthsOpt) monthsBack = parseInt(monthsOpt.split('=')[1], 10);

    const fromOpt = args.find(a => a.startsWith('--from='));
    if (fromOpt) fromDate = fromOpt.split('=')[1];

    const toOpt = args.find(a => a.startsWith('--to='));
    if (toOpt) toDate = toOpt.split('=')[1];

    if (!process.env.MONGODB_URI) {
        console.error('Error: MONGODB_URI is not set in environment.');
        process.exit(1);
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.');

    const result = await rebuildRecentSnapshots({
        monthsBack,
        fromDate,
        toDate
    });

    console.log('Result:', JSON.stringify(result, null, 2));

    await mongoose.disconnect();
    console.log('Disconnected.');
    process.exit(0);
}

main().catch(err => {
    console.error(`Fatal error: ${err.message}`);
    process.exit(1);
});
