const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const DailyDealerSnapshot = require('../models/DailyDealerSnapshot');
const { generateSnapshotsForRange } = require('../services/snapshotGeneratorService');

async function main() {
    if (!process.env.MONGODB_URI) {
        console.error('Error: MONGODB_URI is not set.');
        process.exit(1);
    }
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.');

    console.log('Clearing existing DailyDealerSnapshot collection...');
    const deleteRes = await DailyDealerSnapshot.deleteMany({});
    console.log(`Deleted ${deleteRes.deletedCount.toLocaleString()} old snapshots.`);

    console.log('Starting fresh snapshot generation from 2025-01-01 to Present...');
    await generateSnapshotsForRange({ fromDate: '2025-01-01', toDate: new Date() });

    await mongoose.disconnect();
    console.log('Done.');
    process.exit(0);
}

main().catch(err => {
    console.error(`Fatal error: ${err.message}`);
    process.exit(1);
});
