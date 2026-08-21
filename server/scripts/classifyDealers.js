/**
 * CLI Script: Classify Dealers by Relationship Demand (DRD v6.2)
 * 
 * Analyzes full lifetime application (2019-2026) and normalized communication (2024-2026) timelines
 * to categorize all dealers into relationship demand tiers (High TLC, Self-Sufficient, Comfort Stop, Discovery Queue).
 * 
 * Usage:
 *   node server/scripts/classifyDealers.js [options]
 * 
 * Options:
 *   --dealer <DEALER_ID>    Inspect single dealer timeline & classification details
 *   --help                  Show help message
 */

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { recomputeAllProfiles, evaluateDealerProfile } = require('../services/dealerRelationshipEngine');
const DealerLocation = require('../models/DealerLocation');
const Application = require('../models/Application');
const DealerCommunication = require('../models/DealerCommunication');

async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
Classify Dealers by Relationship Demand (v6.2 Final)
===================================================
Usage: node server/scripts/classifyDealers.js [options]

Options:
  --dealer <DEALER_ID>    Inspect single dealer timeline & classification details
`);
        process.exit(0);
    }

    const dealerIdx = args.indexOf('--dealer');
    const targetDealerId = dealerIdx !== -1 && args[dealerIdx + 1] ? args[dealerIdx + 1].toUpperCase() : null;

    console.log(`\n==================================================`);
    console.log(` DEALER RELATIONSHIP DEMAND (DRD) CLASSIFIER v6.2`);
    console.log(`==================================================`);
    console.log(` Mode   : ${targetDealerId ? `SINGLE DEALER (${targetDealerId})` : 'LIVE DATABASE RUN (All Dealers)'}`);
    console.log(`==================================================\n`);

    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
    console.log('Connected to MongoDB.\n');

    if (targetDealerId) {
        // Inspect single dealer in depth
        const loc = await DealerLocation.findOne({
            $or: [{ clientDealerId: targetDealerId }, { dealerId: targetDealerId }]
        }).lean();

        if (!loc) {
            console.error(`Dealer location not found for code "${targetDealerId}"`);
            await mongoose.disconnect();
            process.exit(1);
        }

        const key = (loc.clientDealerId || loc.dealerId).trim().toUpperCase();
        const apps = await Application.find({ clientDealerId: key }).sort({ applicationDate: 1 }).lean();
        const comms = await DealerCommunication.find({ internalRelationshipId2: key }).sort({ communicationEventDatetime: 1 }).lean();

        const profile = evaluateDealerProfile(loc, apps, comms);

        console.log(`--- DEALER PROFILE: ${profile.dealerName} (${profile.clientDealerId}) ---`);
        console.log(`  State Prefix              : ${profile.statePrefix}`);
        console.log(`  Assigned Rep              : ${profile.assignedRep || 'Unassigned'}`);
        console.log(`  Relationship Demand       : ${profile.relationshipDemand.toUpperCase()}`);
        console.log(`  Pattern Type              : ${profile.patternType}`);
        console.log(`  Confidence Score          : ${(profile.confidenceScore * 100).toFixed(0)}%`);
        console.log(`  Recommended Cadence       : ${profile.recommendedCadenceDays ? `${profile.recommendedCadenceDays} Days` : 'N/A'}`);
        console.log(`  Urgency Status            : ${profile.urgencyStatus.toUpperCase()}`);
        console.log(`  Days Since Last Visit     : ${profile.daysSinceLastVisit !== null ? `${profile.daysSinceLastVisit} days ago` : 'Never'}`);
        console.log(`  Post-Visit Booked Lift    : ${profile.postVisitBookedLiftPct !== null ? `${profile.postVisitBookedLiftPct}%` : 'N/A'}`);
        console.log(`  Organic Booked Ratio      : ${profile.organicBookedRatio}%`);
        console.log(`  Verified Cycle Count      : ${profile.verifiedCycleCount}`);
        console.log(`  Flags                     : Fading TLC=${profile.flags.isFadingTlc} | Emerging TLC=${profile.flags.isEmergingTlc} | Catalytic=${profile.flags.isCatalyticActivation}`);
        console.log(`\n  Lifetime Stats:`);
        console.log(`    Total In-Person Visits  : ${profile.lifetimeStats.totalVisits}`);
        console.log(`    Total Phone Calls       : ${profile.lifetimeStats.totalCalls}`);
        console.log(`    Total Applications      : ${profile.lifetimeStats.totalApplications}`);
        console.log(`    Total Booked Loans      : ${profile.lifetimeStats.totalBookings}`);
        console.log(`    Total Booked Volume     : $${profile.lifetimeStats.totalBookedVolume.toLocaleString()}`);
        console.log(`    Yield Per Visit         : $${profile.lifetimeYieldPerVisit.toLocaleString()}`);
        console.log(`\n  Decision Rationale:`);
        profile.decisionRationale.forEach(r => console.log(`    • ${r}`));
        console.log(`\n  Interaction Cycles (${profile.interactionCycles.length}):`);
        profile.interactionCycles.slice(0, 5).forEach(c => console.log(`    [Cycle ${c.cycleNumber}] ${c.summaryText}`));

        await mongoose.disconnect();
        process.exit(0);
    }

    const result = await recomputeAllProfiles();

    await mongoose.disconnect();
    console.log('\nDone.');
    process.exit(0);
}

main().catch(err => {
    console.error(`\nFATAL ERROR: ${err.stack || err.message}`);
    if (mongoose.connection.readyState !== 0) {
        mongoose.disconnect().finally(() => process.exit(1));
    } else {
        process.exit(1);
    }
});
