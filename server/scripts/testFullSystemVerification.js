const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { getNetworkAggregateStats } = require('../services/dealerStatsService');
const { computeRepScorecard } = require('../services/rollingAverages');
const { getLatestDataDate } = require('../utils/dateUtils');

async function verify() {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/source_one';
    console.log('Connecting to Mongo...');
    await mongoose.connect(uri);
    console.log('Connected!');

    const latestDate = await getLatestDataDate();
    console.log(`\n1. Latest Data Date resolved: ${latestDate.toISOString().split('T')[0]}`);

    console.log('\n2. Network Stats for July MTD (2026-07-01 to 2026-07-28):');
    const netStats = await getNetworkAggregateStats({ startDate: '2026-07-01', endDate: '2026-07-28' });
    console.log(`   Apps:                  ${netStats.apps}`);
    console.log(`   Approvals:             ${netStats.approvals}`);
    console.log(`   Lead Booked Deals:     ${netStats.leadBooked}`);
    console.log(`   Lead Booked Volume:    $${(netStats.leadBookedDollars / 1e6).toFixed(2)}M`);
    console.log(`   Close Funded Deals:    ${netStats.closeBooked}`);
    console.log(`   Close Funded Volume:   $${(netStats.closeBookedDollars / 1e6).toFixed(2)}M`);
    console.log(`   Look-to-Book %:        ${(netStats.lookToBook * 100).toFixed(1)}%`);
    console.log(`   Approval-to-Book %:    ${(netStats.approvalToBook * 100).toFixed(1)}%`);

    console.log('\n3. Rep Scorecard MTD (anchored to July 2026):');
    const repScorecard = await computeRepScorecard(7, null, 'application', 'mtd');
    console.log(`   Total Reps evaluated: ${repScorecard.reps?.length || 0}`);
    if (repScorecard.reps && repScorecard.reps.length > 0) {
        console.log('   Top 5 Reps by Production:');
        for (const r of repScorecard.reps.slice(0, 5)) {
            const fin = r.financials || {};
            console.log(`     - ${r.rep.padEnd(20)} Apps: ${String(fin.totalApps).padStart(4)} | Funded BKD #: ${String(fin.bookedCount).padStart(4)} | Funded Vol: $${((fin.bookedVolume || 0) / 1e6).toFixed(2)}M`);
        }
    }

    await mongoose.disconnect();
    console.log('\nVerification complete!');
}

verify().catch(err => {
    console.error(err);
    process.exit(1);
});
