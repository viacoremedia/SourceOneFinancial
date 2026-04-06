/**
 * Backfill statePrefix on all DealerLocation documents.
 * The pre-validate hook wasn't triggered on bulk inserts,
 * so this script extracts the alpha prefix from dealerId.
 * 
 * Usage: node scripts/backfillStatePrefix.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const DealerLocation = require('../models/DealerLocation');

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find all locations missing statePrefix
    const locations = await DealerLocation.find({
        $or: [
            { statePrefix: null },
            { statePrefix: { $exists: false } },
            { statePrefix: '' },
        ],
    }).lean();

    console.log(`Found ${locations.length} locations without statePrefix`);

    let updated = 0;
    for (const loc of locations) {
        const match = loc.dealerId.match(/^([A-Z]+)/i);
        if (match) {
            const prefix = match[1].toUpperCase();
            await DealerLocation.updateOne(
                { _id: loc._id },
                { $set: { statePrefix: prefix } }
            );
            updated++;
        }
    }

    console.log(`Updated ${updated} locations`);

    // Now show all distinct prefixes
    const prefixes = await DealerLocation.distinct('statePrefix');
    console.log('\nAll distinct state prefixes:');
    console.log(JSON.stringify(prefixes.sort(), null, 2));
    console.log(`\nTotal: ${prefixes.length} unique prefixes`);

    await mongoose.disconnect();
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
