/**
 * Dry-run: find potential duplicate groups by matching first 2 slug words.
 * e.g. "blue-compass-rv" + "blue-compass" → same group
 */
require('dotenv').config();
const mongoose = require('mongoose');
const DG = require('../models/DealerGroup');

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected\n');

    const groups = await DG.find({}).select('name slug dealerCount').sort({ name: 1 }).lean();

    // Group by first 2 slug words
    const buckets = {};
    for (const g of groups) {
        const key = g.slug.split('-').slice(0, 2).join('-');
        if (!buckets[key]) buckets[key] = [];
        buckets[key].push(g);
    }

    let dupeCount = 0;
    for (const [key, items] of Object.entries(buckets)) {
        if (items.length > 1) {
            dupeCount++;
            // Sort: keep the one with most locations
            items.sort((a, b) => b.dealerCount - a.dealerCount);
            const keep = items[0];
            const remove = items.slice(1);
            console.log(`[${key}] KEEP: "${keep.name}" (${keep.dealerCount} locs) id:${keep._id}`);
            remove.forEach(r => {
                console.log(`       MERGE: "${r.name}" (${r.dealerCount} locs) id:${r._id}`);
            });
            console.log();
        }
    }

    console.log(`Found ${dupeCount} potential duplicate sets`);
    await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
