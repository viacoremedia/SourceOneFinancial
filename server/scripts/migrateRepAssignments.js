/**
 * Migration: Update DealerLocation.dealerRepresentative from most recent Application
 * 
 * For each DealerLocation, finds the most recent Application by clientDealerId
 * and sets DealerLocation.dealerRepresentative to match the app's rep.
 * 
 * Usage: cd server && node scripts/migrateRepAssignments.js
 */
const mongoose = require('mongoose');
require('dotenv').config({ path: '.env' });
const DealerLocation = require('../models/DealerLocation');
const Application = require('../models/Application');
const { resolveRepName, isInactiveRep, isExcludedRep } = require('../config/repConfig');

async function migrate() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');

    const locations = await DealerLocation.find({}).select('clientDealerId dealerName dealerRepresentative').lean();
    console.log(`Processing ${locations.length} dealer locations...`);

    let updated = 0, unchanged = 0, noApps = 0, errors = 0;
    const changes = [];

    for (const loc of locations) {
        if (!loc.clientDealerId) continue;

        try {
            // Find most recent app for this dealer
            const latestApp = await Application.findOne({ clientDealerId: loc.clientDealerId })
                .sort({ applicationDate: -1 })
                .select('dealerRepresentative applicationDate')
                .lean();

            if (!latestApp || !latestApp.dealerRepresentative) {
                noApps++;
                // If no apps found, leave as-is (or set to null if currently assigned to departed rep)
                if (loc.dealerRepresentative) {
                    const handle = loc.dealerRepresentative.trim().toLowerCase();
                    if (isInactiveRep(handle) || isExcludedRep(handle)) {
                        await DealerLocation.updateOne({ _id: loc._id }, { $set: { dealerRepresentative: null } });
                        changes.push(`  ${loc.dealerName} (${loc.clientDealerId}): ${loc.dealerRepresentative} -> null (no apps, was inactive/excluded)`);
                        updated++;
                    }
                }
                continue;
            }

            const newRep = latestApp.dealerRepresentative.trim().toLowerCase();
            const oldRep = (loc.dealerRepresentative || '').trim().toLowerCase();

            if (newRep !== oldRep) {
                await DealerLocation.updateOne(
                    { _id: loc._id },
                    { $set: { dealerRepresentative: latestApp.dealerRepresentative } }
                );
                const oldDisplay = resolveRepName(oldRep) || oldRep || 'null';
                const newDisplay = resolveRepName(newRep) || newRep;
                changes.push(`  ${loc.dealerName} (${loc.clientDealerId}): ${oldDisplay} -> ${newDisplay}`);
                updated++;
            } else {
                unchanged++;
            }
        } catch (err) {
            errors++;
            console.error(`Error processing ${loc.clientDealerId}:`, err.message);
        }
    }

    console.log('\n-- Migration Summary --');
    console.log(`Total locations: ${locations.length}`);
    console.log(`Updated: ${updated}`);
    console.log(`Unchanged: ${unchanged}`);
    console.log(`No apps found: ${noApps}`);
    console.log(`Errors: ${errors}`);

    if (changes.length > 0 && changes.length <= 200) {
        console.log('\n-- Changes Made --');
        changes.forEach(c => console.log(c));
    } else if (changes.length > 200) {
        console.log(`\n-- First 50 of ${changes.length} Changes --`);
        changes.slice(0, 50).forEach(c => console.log(c));
        console.log(`  ... and ${changes.length - 50} more`);
    }

    await mongoose.disconnect();
    console.log('\nDone.');
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
