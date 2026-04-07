/**
 * Analyze orphaned independent dealers that should belong to existing groups.
 * 
 * Cross-references ungrouped DealerLocation names against existing DealerGroup
 * names to find misplaced dealers.
 * 
 * Usage: node server/scripts/analyzeOrphans.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const DealerGroup = require('../models/DealerGroup');
const DealerLocation = require('../models/DealerLocation');
const { extractGroupName } = require('../services/dealerGroupDetector');

async function main() {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) {
        console.error('No MONGO_URI found in env');
        process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB\n');

    // 1. Get all existing groups (name → id)
    const groups = await DealerGroup.find({}).lean();
    const groupNameMap = new Map(); // UPPERCASE name → group doc
    for (const g of groups) {
        groupNameMap.set(g.name.toUpperCase(), g);
    }
    console.log(`Total dealer groups: ${groups.length}`);

    // 2. Get all ungrouped dealers
    const ungrouped = await DealerLocation.find({ dealerGroup: null }).lean();
    console.log(`Total ungrouped (independent) dealers: ${ungrouped.length}\n`);

    // 3. For each ungrouped dealer, extract what its group name WOULD be
    //    and check if that group already exists
    const orphans = []; // { dealer, matchedGroup }
    const orphansByGroup = new Map(); // group name → [dealer names]

    for (const dealer of ungrouped) {
        const extractedName = extractGroupName(dealer.dealerName, dealer.dealerId);
        if (extractedName && groupNameMap.has(extractedName)) {
            const matchedGroup = groupNameMap.get(extractedName);
            orphans.push({
                dealerId: dealer.dealerId,
                dealerName: dealer.dealerName,
                groupName: matchedGroup.name,
                groupSlug: matchedGroup.slug,
            });

            if (!orphansByGroup.has(matchedGroup.name)) {
                orphansByGroup.set(matchedGroup.name, []);
            }
            orphansByGroup.get(matchedGroup.name).push(dealer.dealerName);
        }
    }

    // 4. Also check for partial name matches (dealer name CONTAINS a group name)
    const fuzzyMatches = [];
    for (const dealer of ungrouped) {
        const upperName = dealer.dealerName.toUpperCase();
        // Skip if already matched via exact extraction
        if (orphans.some(o => o.dealerId === dealer.dealerId)) continue;

        for (const [groupUpper, groupDoc] of groupNameMap) {
            // Check if the dealer name starts with the group name
            if (groupUpper.length >= 4 && upperName.startsWith(groupUpper)) {
                fuzzyMatches.push({
                    dealerId: dealer.dealerId,
                    dealerName: dealer.dealerName,
                    groupName: groupDoc.name,
                    matchType: 'startsWith',
                });
                break;
            }
        }
    }

    // 5. Output results
    console.log('='.repeat(70));
    console.log(`EXACT MATCHES: ${orphans.length} dealers should belong to existing groups`);
    console.log('='.repeat(70));

    // Sort by group name
    const sortedGroups = Array.from(orphansByGroup.entries())
        .sort((a, b) => b[1].length - a[1].length);

    for (const [groupName, dealers] of sortedGroups) {
        console.log(`\n  📦 ${groupName} (${dealers.length} orphaned locations)`);
        for (const d of dealers) {
            console.log(`       └─ ${d}`);
        }
    }

    if (fuzzyMatches.length > 0) {
        console.log(`\n${'='.repeat(70)}`);
        console.log(`FUZZY MATCHES: ${fuzzyMatches.length} dealers might belong to groups`);
        console.log('='.repeat(70));
        for (const m of fuzzyMatches) {
            console.log(`  ⚠️  "${m.dealerName}" → possibly "${m.groupName}"`);
        }
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log('SUMMARY');
    console.log('='.repeat(70));
    console.log(`  Total ungrouped dealers: ${ungrouped.length}`);
    console.log(`  Exact group matches:     ${orphans.length}`);
    console.log(`  Fuzzy group matches:     ${fuzzyMatches.length}`);
    console.log(`  Truly independent:       ${ungrouped.length - orphans.length - fuzzyMatches.length}`);

    await mongoose.disconnect();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
