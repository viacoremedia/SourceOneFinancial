/**
 * Normalize statePrefix on all DealerLocation documents.
 * 
 * Rules:
 * - 3-letter codes starting with 'E' (EPIC locations): strip leading 'E' → 2-letter state
 * - 'SCA' / 'NCA' → 'CA' (Southern/Northern California)
 * - 'IFG' → needs manual mapping (IFG dealer group)
 * - 'M' alone → data anomaly, attempt lookup from dealerName
 * - 'PR' → Puerto Rico (keep as-is, not in budget)
 * - Standard 2-letter codes: keep as-is
 * 
 * Usage: node scripts/normalizeStatePrefix.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const DealerLocation = require('../models/DealerLocation');

// Special prefix → state mappings
const PREFIX_MAP = {
    // California regions
    'SCA': 'CA',
    'NCA': 'CA',
    // IFG group — these span multiple states, try to determine from name
    'IFG': null, // handled separately
    // Single letter
    'M': null, // handled separately
};

function normalizePrefix(prefix, dealerName) {
    if (!prefix) return null;

    // Direct 2-letter state codes → keep
    if (prefix.length === 2) return prefix;

    // Check special map
    if (PREFIX_MAP[prefix] !== undefined) {
        if (PREFIX_MAP[prefix]) return PREFIX_MAP[prefix];
        // null means we need to figure it out from the name
        // Try to extract state from dealerName (look for 2-letter state pattern)
        const stateMatch = dealerName.match(/\b([A-Z]{2})\d+$/);
        if (stateMatch) return stateMatch[1];
        return prefix; // can't determine, keep raw
    }

    // 3-letter codes starting with 'E' → strip leading 'E'
    if (prefix.length === 3 && prefix.startsWith('E')) {
        return prefix.substring(1);
    }

    // Anything else → keep
    return prefix;
}

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const locations = await DealerLocation.find({}).lean();
    console.log(`Processing ${locations.length} locations...`);

    let updated = 0;
    const changes = {};

    for (const loc of locations) {
        // Re-extract raw prefix from dealerId
        const rawMatch = loc.dealerId.match(/^([A-Z]+)/i);
        const rawPrefix = rawMatch ? rawMatch[1].toUpperCase() : null;

        const normalized = normalizePrefix(rawPrefix, loc.dealerName);

        if (normalized !== loc.statePrefix) {
            await DealerLocation.updateOne(
                { _id: loc._id },
                { $set: { statePrefix: normalized } }
            );
            const key = `${rawPrefix} → ${normalized}`;
            changes[key] = (changes[key] || 0) + 1;
            updated++;
        }
    }

    console.log(`\nUpdated ${updated} locations`);
    console.log('\nChanges made:');
    Object.entries(changes)
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([change, count]) => {
            console.log(`  ${change}: ${count} locations`);
        });

    // Final distinct check
    const prefixes = await DealerLocation.distinct('statePrefix');
    console.log('\nFinal distinct prefixes:');
    console.log(JSON.stringify(prefixes.filter(Boolean).sort(), null, 2));
    console.log(`Total: ${prefixes.filter(Boolean).length} unique states`);

    await mongoose.disconnect();
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
