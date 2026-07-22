/**
 * Dealer Location Deduplication & Consolidation Script
 * 
 * Merges orphaned DealerLocation documents (e.g. numeric OMNI IDs like "393032")
 * into their canonical alphanumeric counterparts (e.g. "NV114").
 * 
 * Reassigns snapshots and removes orphan documents.
 * 
 * Usage: node server/scripts/dedupDealerLocations.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const DealerLocation = require('../models/DealerLocation');
const DailyDealerSnapshot = require('../models/DailyDealerSnapshot');

async function run() {
    console.log('=== DEALER LOCATION DEDUPLICATION SCRIPT ===');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.\n');

    const allLocations = await DealerLocation.find({}).lean();
    console.log(`Loaded ${allLocations.length} total DealerLocation documents.`);

    // Index locations by dealerId
    const locationById = new Map();
    for (const loc of allLocations) {
        locationById.set(loc.dealerId.trim().toUpperCase(), loc);
    }

    let mergedCount = 0;
    let reassignedSnapshotsTotal = 0;
    let deletedCount = 0;

    // Scan for orphan numeric records or records where clientDealerId points to an existing alphanumeric dealerId
    for (const loc of allLocations) {
        const id = loc.dealerId.trim().toUpperCase();
        const clientCode = (loc.clientDealerId || '').trim().toUpperCase();

        // Check if this document is a numeric orphan whose clientDealerId exists as another DealerLocation
        if (clientCode && clientCode !== id && locationById.has(clientCode)) {
            const canonical = locationById.get(clientCode);

            console.log(`\nMerging Orphan "${loc.dealerName}" (${id}) → Canonical (${canonical.dealerId})`);

            // Build merge updates for canonical
            const mergeFields = {};
            const fieldsToCopy = [
                'dealerName', 'dba', 'dealerGroupName', 'region', 'dealerAddress', 'dealerCity',
                'dealerState', 'dealerPostalCode', 'county', 'dealerPhoneNumber', 'dealerFaxNumber',
                'enrollmentDate', 'activatedDate', 'deactivatedDate', 'dealerAgreementDate',
                'dealerLicenseExpiration', 'terminationDate', 'isActive', 'collateralType',
                'dealerRepresentative', 'documentDelivery', 'bookout', 'isActiveForDealerTrack',
                'isActiveForRouteOne', 'isEsignAllowed', 'isFundingReserveHold', 'isBmoDealer',
                'isMedallionDealer', 'isActiveForRouteOneCanada', 'isActiveForCreditLane',
                'isActiveForCudl', 'isSourceOneOnly', 'isFsbDealer', 'isSalesTaxRequired',
                'isMultiDecisionEnabled', 'lastInfoIngestionDate'
            ];

            for (const key of fieldsToCopy) {
                if (loc[key] != null && canonical[key] == null) {
                    mergeFields[key] = loc[key];
                }
            }
            mergeFields.omniDealerId = loc.omniDealerId || id;
            mergeFields.clientDealerId = clientCode;

            // Update canonical record
            await DealerLocation.updateOne({ _id: canonical._id }, { $set: mergeFields });

            // Delete any snapshots pointing to orphan (they will be regenerated in backfill)
            const snapRes = await DailyDealerSnapshot.deleteMany({ dealerLocation: loc._id });
            if (snapRes.deletedCount > 0) {
                console.log(`  Deleted ${snapRes.deletedCount} orphan snapshots`);
                reassignedSnapshotsTotal += snapRes.deletedCount;
            }

            // Delete orphan record
            await DealerLocation.deleteOne({ _id: loc._id });
            deletedCount++;
            mergedCount++;
        }
    }

    // Additional pass: check by duplicate exact dealerName if one is numeric ID and one is alphanumeric ID
    const remainingLocations = await DealerLocation.find({}).lean();
    const nameMap = new Map(); // dealerName -> loc[]
    for (const loc of remainingLocations) {
        const normName = loc.dealerName.trim().toUpperCase();
        if (!nameMap.has(normName)) nameMap.set(normName, []);
        nameMap.get(normName).push(loc);
    }

    for (const [name, list] of nameMap.entries()) {
        if (list.length > 1) {
            // Find if there's an alphanumeric one and numeric one
            const alphaDoc = list.find(l => !/^\d+$/.test(l.dealerId));
            const numericDocs = list.filter(l => /^\d+$/.test(l.dealerId));

            if (alphaDoc && numericDocs.length > 0) {
                for (const numDoc of numericDocs) {
                    console.log(`\nName Match Merging: "${name}" (${numDoc.dealerId}) → Canonical (${alphaDoc.dealerId})`);
                    
                    // Delete orphan snapshots
                    const snapRes = await DailyDealerSnapshot.deleteMany({ dealerLocation: numDoc._id });
                    if (snapRes.deletedCount > 0) {
                        reassignedSnapshotsTotal += snapRes.deletedCount;
                    }

                    // Copy omniDealerId
                    await DealerLocation.updateOne(
                        { _id: alphaDoc._id },
                        { $set: { omniDealerId: numDoc.dealerId, clientDealerId: alphaDoc.dealerId } }
                    );

                    // Delete numeric doc
                    await DealerLocation.deleteOne({ _id: numDoc._id });
                    deletedCount++;
                    mergedCount++;
                }
            }
        }
    }

    const finalCount = await DealerLocation.countDocuments();
    console.log('\n=== DEDUPLICATION COMPLETE ===');
    console.log(`  Merged/Deleted Orphans     : ${mergedCount}`);
    console.log(`  Reassigned Snapshots Total : ${reassignedSnapshotsTotal}`);
    console.log(`  Final DealerLocation Count : ${finalCount}`);

    await mongoose.disconnect();
}

run().catch(err => {
    console.error('Deduplication Error:', err);
    process.exit(1);
});
