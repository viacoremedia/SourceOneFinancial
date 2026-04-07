/**
 * Reassign orphaned independent dealers to their correct dealer groups.
 *
 * Uses fuzzy "startsWith" matching (same logic as analyzeOrphans.js) to find
 * ungrouped DealerLocations whose name matches an existing DealerGroup.
 *
 * Updates:
 *   1. DealerLocation.dealerGroup  → set to matched group _id
 *   2. DailyDealerSnapshot.dealerGroup → set to matched group _id (all snapshots for that location)
 *   3. DealerGroup.dealerCount     → recalculated from actual location count
 *
 * Usage:
 *   node server/scripts/reassignOrphans.js           # dry-run (no changes)
 *   node server/scripts/reassignOrphans.js --commit   # apply changes
 */

require('dotenv').config();
const mongoose = require('mongoose');
const DealerGroup = require('../models/DealerGroup');
const DealerLocation = require('../models/DealerLocation');
const DailyDealerSnapshot = require('../models/DailyDealerSnapshot');

const COMMIT = process.argv.includes('--commit');

async function main() {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) {
        console.error('No MONGO_URI found in env');
        process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');
    console.log(COMMIT ? '🔴 COMMIT MODE — changes WILL be applied\n' : '🟡 DRY-RUN — no changes will be made (use --commit to apply)\n');

    // 1. Load all existing groups
    const groups = await DealerGroup.find({}).lean();
    const groupNameMap = new Map(); // UPPERCASE name → group doc
    for (const g of groups) {
        groupNameMap.set(g.name.toUpperCase(), g);
    }

    // 2. Get all ungrouped dealers
    const ungrouped = await DealerLocation.find({ dealerGroup: null }).lean();
    console.log(`Total ungrouped dealers: ${ungrouped.length}`);
    console.log(`Total dealer groups: ${groups.length}\n`);

    // 3. Find fuzzy matches (startsWith)
    const matches = []; // { location, matchedGroup }
    const matchesByGroup = new Map(); // group name → count

    for (const dealer of ungrouped) {
        const upperName = dealer.dealerName.toUpperCase();
        for (const [groupUpper, groupDoc] of groupNameMap) {
            if (groupUpper.length >= 4 && upperName.startsWith(groupUpper)) {
                matches.push({ location: dealer, matchedGroup: groupDoc });
                matchesByGroup.set(groupDoc.name, (matchesByGroup.get(groupDoc.name) || 0) + 1);
                break;
            }
        }
    }

    console.log(`Found ${matches.length} orphaned dealers to reassign:\n`);

    // Display summary by group
    const sortedGroups = Array.from(matchesByGroup.entries()).sort((a, b) => b[1] - a[1]);
    for (const [name, count] of sortedGroups) {
        console.log(`  📦 ${name}: +${count} locations`);
    }

    if (matches.length === 0) {
        console.log('\nNothing to do.');
        await mongoose.disconnect();
        return;
    }

    if (!COMMIT) {
        console.log(`\n${'='.repeat(60)}`);
        console.log('DRY-RUN complete. Run with --commit to apply these changes.');
        console.log('='.repeat(60));
        await mongoose.disconnect();
        return;
    }

    // 4. Apply changes
    console.log(`\n${'='.repeat(60)}`);
    console.log('Applying changes...');
    console.log('='.repeat(60));

    let locationsUpdated = 0;
    let snapshotsUpdated = 0;
    const affectedGroupIds = new Set();

    for (const { location, matchedGroup } of matches) {
        // Update DealerLocation
        await DealerLocation.updateOne(
            { _id: location._id },
            { $set: { dealerGroup: matchedGroup._id } }
        );
        locationsUpdated++;

        // Update all DailyDealerSnapshot records for this location
        const snapResult = await DailyDealerSnapshot.updateMany(
            { dealerLocation: location._id },
            { $set: { dealerGroup: matchedGroup._id } }
        );
        snapshotsUpdated += snapResult.modifiedCount;

        affectedGroupIds.add(matchedGroup._id.toString());

        if (locationsUpdated % 25 === 0) {
            console.log(`  ... ${locationsUpdated}/${matches.length} locations processed`);
        }
    }

    // 5. Recalculate dealerCount for all affected groups
    console.log(`\nRecalculating dealer counts for ${affectedGroupIds.size} affected groups...`);

    for (const groupId of affectedGroupIds) {
        const count = await DealerLocation.countDocuments({ dealerGroup: new mongoose.Types.ObjectId(groupId) });
        await DealerGroup.updateOne(
            { _id: new mongoose.Types.ObjectId(groupId) },
            { $set: { dealerCount: count } }
        );
    }

    // 6. Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log('DONE ✅');
    console.log('='.repeat(60));
    console.log(`  Locations reassigned:   ${locationsUpdated}`);
    console.log(`  Snapshots updated:      ${snapshotsUpdated}`);
    console.log(`  Groups recounted:       ${affectedGroupIds.size}`);

    await mongoose.disconnect();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
