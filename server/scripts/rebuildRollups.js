/**
 * Dedicated script to rebuild all MonthlyDealerRollups cleanly.
 * Usage: node server/scripts/rebuildRollups.js
 */
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { rebuildAllRollups } = require('../services/rollupService');

async function main() {
    if (!process.env.MONGODB_URI) {
        console.error('Error: MONGODB_URI is not set.');
        process.exit(1);
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.\n');

    console.log('=== REBUILDING ALL MONTHLY DEALER ROLLUPS ===');
    const result = await rebuildAllRollups();
    console.log('\n=== ROLLUP REBUILD COMPLETE ===');
    console.log(`  Rebuilt : ${result.rebuilt.toLocaleString()}`);
    console.log(`  Errors  : ${result.errors}`);

    await mongoose.disconnect();
    console.log('\nDone.');
    process.exit(0);
}

main().catch(err => {
    console.error('Fatal rollup rebuild error:', err);
    process.exit(1);
});
