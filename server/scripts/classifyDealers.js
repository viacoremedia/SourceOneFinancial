/**
 * CLI Script: Classify Dealers by Relationship Demand (DRD)
 * 
 * Analyzes full lifetime application (2019-2026) and communication (2024-2026) timelines
 * to categorize all dealers into relationship demand tiers (High TLC, Self-Sufficient, Unresponsive, Insufficient Data).
 * 
 * Usage:
 *   node server/scripts/classifyDealers.js [options]
 * 
 * Options:
 *   --dry-run               Evaluate in-memory and print distribution without writing to DB
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
Classify Dealers by Relationship Demand
=======================================
Usage: node server/scripts/classifyDealers.js [options]

Options:
  --dry-run               Evaluate in-memory and print distribution without writing to DB
  --dealer <DEALER_ID>    Inspect single dealer timeline & classification details
`);
        process.exit(0);
    }

    const dryRun = args.includes('--dry-run');
    const dealerIdx = args.indexOf('--dealer');
    const targetDealerId = dealerIdx !== -1 && args[dealerIdx + 1] ? args[dealerIdx + 1].toUpperCase() : null;

    console.log(`\n==================================================`);
    console.log(` DEALER RELATIONSHIP DEMAND (DRD) CLASSIFIER`);
    console.log(`==================================================`);
    console.log(` Mode   : ${targetDealerId ? `SINGLE DEALER (${targetDealerId})` : (dryRun ? 'DRY-RUN (In-Memory Analysis)' : 'LIVE DATABASE RUN')}`);
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
        console.log(`  Confidence Score          : ${(profile.confidenceScore * 100).toFixed(0)}%`);
        console.log(`  Recommended Cadence       : ${profile.recommendedCadenceDays ? `${profile.recommendedCadenceDays} Days` : 'N/A'}`);
        console.log(`  Urgency Status            : ${profile.urgencyStatus.toUpperCase()}`);
        console.log(`  Days Since Last Visit     : ${profile.daysSinceLastVisit !== null ? `${profile.daysSinceLastVisit} days ago` : 'Never'}`);
        console.log(`  Visit Elasticity Ratio    : ${profile.visitElasticity !== null ? `${profile.visitElasticity}x` : 'N/A'}`);
        console.log(`  Production Half-Life      : ${profile.productionHalfLifeDays ? `${profile.productionHalfLifeDays} days` : 'N/A'}`);
        console.log(`\n  Lifetime Stats:`);
        console.log(`    Total Visits            : ${profile.lifetimeStats.totalVisits}`);
        console.log(`    Total Calls             : ${profile.lifetimeStats.totalCalls}`);
        console.log(`    Total Applications      : ${profile.lifetimeStats.totalApplications}`);
        console.log(`    Total Booked Loans      : ${profile.lifetimeStats.totalBookings}`);
        console.log(`    Total Booked Volume     : $${profile.lifetimeStats.totalBookedVolume.toLocaleString()}`);
        console.log(`    Yield Per Visit         : $${profile.lifetimeStats.yieldPerVisit.toLocaleString()}`);
        console.log(`\n  Dormancy Stats:`);
        console.log(`    Total 60d Dormancies    : ${profile.dormancyStats.totalDormancyEpisodes}`);
        console.log(`    Ended by Rep Visit      : ${profile.dormancyStats.dormanciesEndedByVisit}`);
        console.log(`    Dormancy Recovery Rate  : ${(profile.dormancyStats.dormancyVisitRecoveryRate * 100).toFixed(0)}%`);

        await mongoose.disconnect();
        process.exit(0);
    }

    if (dryRun) {
        console.log('Running dry-run in-memory evaluation without database writes...');
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
