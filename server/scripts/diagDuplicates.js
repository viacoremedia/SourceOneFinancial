/**
 * Quick diagnostic script to investigate duplicate DealerLocation records
 * and check snapshot backfill progress.
 * 
 * Usage: node server/scripts/diagDuplicates.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.\n');

    const db = mongoose.connection.db;
    const locCol = db.collection('dealerlocations');
    const snapCol = db.collection('dailydealersnapshots');

    // 1. Total counts
    const totalLocs = await locCol.estimatedDocumentCount();
    const totalSnaps = await snapCol.estimatedDocumentCount();
    console.log('=== COUNTS ===');
    console.log('  DealerLocations:', totalLocs.toLocaleString());
    console.log('  DailyDealerSnapshots:', totalSnaps.toLocaleString());

    // 2. Check specific duplicates from the screenshot
    console.log('\n=== SPECIFIC DEALERS FROM SCREENSHOT ===');

    const checks = [
        { label: '154 MARINE', regex: /154 MARINE/i },
        { label: '24/7 Motorcoach', regex: /24\/7 Motor/i },
        { label: '120 RV Sales', regex: /120 RV Sales/i },
        { label: '154 Marine LLC -MO125', regex: /154 Marine.*MO125/i },
    ];

    for (const { label, regex } of checks) {
        const docs = await locCol.find({ dealerName: regex })
            .project({ dealerId: 1, dealerName: 1, clientDealerId: 1, statePrefix: 1, dealerGroup: 1 })
            .toArray();
        console.log(`\n  "${label}" → ${docs.length} record(s):`);
        for (const d of docs) {
            console.log(`    dealerId=${d.dealerId} | clientDealerId=${d.clientDealerId} | name="${d.dealerName}" | st=${d.statePrefix} | group=${d.dealerGroup}`);
        }
    }

    // 3. Full duplicate name scan
    console.log('\n=== DUPLICATE DEALERNAME SCAN ===');
    const dupes = await locCol.aggregate([
        { $group: { _id: '$dealerName', count: { $sum: 1 }, ids: { $push: '$dealerId' } } },
        { $match: { count: { $gt: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 }
    ]).toArray();

    console.log(`  Found ${dupes.length} dealer names with multiple DealerLocation records:`);
    for (const d of dupes) {
        console.log(`    "${d._id}" → ${d.count}x → IDs: [${d.ids.join(', ')}]`);
    }

    // 4. Count how many dealers from dealer_info CSV vs old pipeline
    const withClientId = await locCol.countDocuments({ clientDealerId: { $ne: null } });
    const withoutClientId = await locCol.countDocuments({ $or: [{ clientDealerId: null }, { clientDealerId: { $exists: false } }] });
    console.log(`\n=== ORIGIN BREAKDOWN ===`);
    console.log(`  With clientDealerId (from OMNI CSV): ${withClientId}`);
    console.log(`  Without clientDealerId (from old Caleb pipeline): ${withoutClientId}`);

    // 5. Snapshot partial backfill status
    if (totalSnaps > 0) {
        const latestSnap = await snapCol.findOne({}, { sort: { reportDate: -1 }, projection: { reportDate: 1 } });
        const earliestSnap = await snapCol.findOne({}, { sort: { reportDate: 1 }, projection: { reportDate: 1 } });
        const uniqueDates = await snapCol.distinct('reportDate');
        console.log(`\n=== SNAPSHOT BACKFILL STATUS ===`);
        console.log(`  Date range: ${earliestSnap?.reportDate?.toISOString?.()?.slice(0,10)} → ${latestSnap?.reportDate?.toISOString?.()?.slice(0,10)}`);
        console.log(`  Unique report dates: ${uniqueDates.length}`);
        console.log(`  Target: 568 dates × ${totalLocs} dealers = ~${(568 * totalLocs).toLocaleString()} snapshots`);
        console.log(`  Progress: ${totalSnaps.toLocaleString()} / ~${(568 * totalLocs).toLocaleString()} (${((totalSnaps / (568 * totalLocs)) * 100).toFixed(1)}%)`);
    }

    await mongoose.disconnect();
    console.log('\nDone.');
}

run().catch(err => {
    console.error('ERROR:', err.message);
    process.exit(1);
});
