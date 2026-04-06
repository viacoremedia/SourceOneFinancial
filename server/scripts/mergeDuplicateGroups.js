/**
 * Merge duplicate dealer groups (1-6 confirmed).
 * Moves all locations + snapshots from the smaller duplicate to the larger one,
 * then deletes the empty group.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const DG = require('../models/DealerGroup');
const DL = require('../models/DealerLocation');
const DDS = require('../models/DailyDealerSnapshot');

const MERGES = [
    // 1. Blue Compass
    { keepId: '69d3dc5f2b7d2b40095e066d', removeId: '69d3dc602b7d2b40095e0671', name: 'Blue Compass' },
    // 2. Bobby Combs
    { keepId: '69d3dc672b7d2b40095e06e0', removeId: '69d3dc662b7d2b40095e06d6', name: 'Bobby Combs' },
    // 3. Campers Inn
    { keepId: '69d3dc602b7d2b40095e067a', removeId: '69d3dc602b7d2b40095e067d', name: 'Campers Inn' },
    // 4. General RV
    { keepId: '69d3dc602b7d2b40095e0673', removeId: '69d3dc622b7d2b40095e0697', name: 'General RV' },
    // 5. International RV
    { keepId: '69d3dc672b7d2b40095e06e3', removeId: '69d3dc6a2b7d2b40095e070c', name: 'International RV' },
    // 6. RV Country
    { keepId: '69d3dc602b7d2b40095e067c', removeId: '69d3dc672b7d2b40095e06dc', name: 'RV Country' },
];

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    for (const merge of MERGES) {
        const keep = await DG.findById(merge.keepId).lean();
        const remove = await DG.findById(merge.removeId).lean();

        if (!keep || !remove) {
            console.log(`⚠ Skipping ${merge.name}: one or both IDs not found`);
            continue;
        }

        console.log(`Merging "${remove.name}" (${remove.dealerCount}) → "${keep.name}" (${keep.dealerCount})`);

        // Move locations
        const locResult = await DL.updateMany(
            { dealerGroup: new mongoose.Types.ObjectId(merge.removeId) },
            { $set: { dealerGroup: new mongoose.Types.ObjectId(merge.keepId) } }
        );
        console.log(`  ✓ Moved ${locResult.modifiedCount} locations`);

        // Move snapshots
        const snapResult = await DDS.updateMany(
            { dealerGroup: new mongoose.Types.ObjectId(merge.removeId) },
            { $set: { dealerGroup: new mongoose.Types.ObjectId(merge.keepId) } }
        );
        console.log(`  ✓ Moved ${snapResult.modifiedCount} snapshots`);

        // Update dealer count on kept group
        const newCount = keep.dealerCount + locResult.modifiedCount;
        await DG.updateOne(
            { _id: merge.keepId },
            { $set: { dealerCount: newCount } }
        );
        console.log(`  ✓ Updated dealerCount to ${newCount}`);

        // Delete empty group
        await DG.deleteOne({ _id: merge.removeId });
        console.log(`  ✓ Deleted "${remove.name}" (${merge.removeId})\n`);
    }

    await mongoose.disconnect();
    console.log('Done!');
}

run().catch(err => { console.error(err); process.exit(1); });
