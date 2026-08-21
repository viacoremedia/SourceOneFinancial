const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
const DealerProfile = require('../models/DealerProfile');

async function testYieldAndUWRules() {
  await mongoose.connect(process.env.MONGODB_URI);
  const profiles = await DealerProfile.find({}).lean();

  let tlcCount = 0;
  let selfSuffCount = 0;
  let comfortStopCount = 0;
  let discoveryCount = 0;

  const tlcAccounts = [];
  const reclassifiedFromTlc = [];

  for (const p of profiles) {
    const visits = p.lifetimeStats?.totalVisits || 0;
    const bookings = p.lifetimeStats?.totalBookings || 0;
    const volume = p.lifetimeStats?.totalBookedVolume || 0;
    const apps = p.lifetimeStats?.totalApplications || 0;
    const yieldPerVisit = visits > 0 ? Math.round(volume / visits) : 0;
    const approvalRate = p.pipelineStats?.approvalRatePct || 0;
    const lookToBook = p.pipelineStats?.lookToBookPct || 0;
    const postLift = p.postVisitBookedLiftPct || 0;
    const organic = p.organicBookedRatio !== null ? p.organicBookedRatio : (100 - postLift);
    const daysUnvisited = p.daysSinceLastVisit;
    const cycles = p.verifiedCycleCount || 0;

    let demand = p.relationshipDemand;

    // Is it an over-visited sink?
    const isOverVisitedSink = (visits >= 15 && yieldPerVisit < 25000 && volume < 500000);
    const isUnderwritingBottleneck = (apps >= 40 && approvalRate < 20 && lookToBook < 8);

    if (demand === 'high_tlc') {
      if (isOverVisitedSink || (isUnderwritingBottleneck && yieldPerVisit < 35000)) {
        demand = 'comfort_stop';
        reclassifiedFromTlc.push({
          id: p.clientDealerId,
          name: p.dealerName.slice(0, 26),
          rep: p.assignedRep || 'House',
          visits,
          apps,
          bookings,
          volume: '$' + (volume / 1000).toFixed(0) + 'K',
          yield: '$' + (yieldPerVisit / 1000).toFixed(1) + 'K',
          apprRate: approvalRate + '%',
          ltb: lookToBook + '%',
          reason: isOverVisitedSink ? 'Over-Visited Low Yield' : 'Underwriting Bottleneck'
        });
      } else {
        tlcAccounts.push({
          id: p.clientDealerId,
          name: p.dealerName.slice(0, 26),
          rep: p.assignedRep || 'House',
          visits,
          apps,
          bookings,
          volume: '$' + (volume / 1000).toFixed(0) + 'K',
          yield: '$' + (yieldPerVisit / 1000).toFixed(1) + 'K',
          lift: postLift + '%',
          cycles
        });
      }
    }
  }

  console.log(`=== RECLASSIFICATION OF OVER-SERVICED & UW-BLOCKED HIGH TLC ACCOUNTS ===`);
  console.log(`Reclassified from High TLC -> Comfort Stop: ${reclassifiedFromTlc.length}`);
  console.log(`True High TLC Remaining: ${tlcAccounts.length}\n`);

  console.log('--- RECLASSIFIED ACCOUNTS (SAMPLE 20) ---');
  console.table(reclassifiedFromTlc.slice(0, 20));

  console.log('\n--- CONFIRMED HIGH TLC (SAMPLE 20) ---');
  console.table(tlcAccounts.slice(0, 20));

  await mongoose.disconnect();
}
testYieldAndUWRules().catch(e => { console.error(e); process.exit(1); });
