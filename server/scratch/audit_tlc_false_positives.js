const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
const DealerProfile = require('../models/DealerProfile');

async function auditTlcAccounts() {
  await mongoose.connect(process.env.MONGODB_URI);
  const profiles = await DealerProfile.find({ relationshipDemand: 'high_tlc' }).lean();

  console.log(`Total High TLC Accounts: ${profiles.length}\n`);

  const falsePositives = [];
  const truePositives = [];

  for (const p of profiles) {
    const postLift = p.postVisitBookedLiftPct || 0;
    const organicRatio = p.organicBookedRatio !== null ? p.organicBookedRatio : (100 - postLift);
    const totalVisits = p.lifetimeStats?.totalVisits || 0;
    const totalBookedVol = p.lifetimeStats?.totalBookedVolume || 0;
    const totalBookings = p.lifetimeStats?.totalBookings || 0;
    const totalApps = p.lifetimeStats?.totalApplications || 0;
    const verifiedCycles = p.verifiedCycleCount || 0;
    const isEmerging = p.flags?.isEmergingTlc;
    const isStrategic = p.flags?.isStrategicTlc;
    const daysUnvisited = p.daysSinceLastVisit;

    // Check if the dealer actually has high organic volume (e.g. organicRatio >= 50%)
    // Or if postVisitBookedLiftPct is low (< 50%)
    // Or if they produced massive bookings during 180+ days unvisited
    const isOrganicDominated = organicRatio >= 50 || postLift < 50;
    const hasSustainedUnvisitedProduction = daysUnvisited > 180 && totalBookedVol > 100000 && organicRatio >= 40;

    const issues = [];
    if (isOrganicDominated) {
      issues.push(`Organic Dominated (${organicRatio}% organic vs ${postLift}% post-visit lift)`);
    }
    if (hasSustainedUnvisitedProduction) {
      issues.push(`Sustained Production Unvisited (${daysUnvisited}d unvisited, $${(totalBookedVol/1000).toFixed(0)}K vol)`);
    }

    const item = {
      id: p.clientDealerId,
      name: p.dealerName.slice(0, 28),
      rep: p.assignedRep || 'Unassigned',
      visits: totalVisits,
      bookings: totalBookings,
      volume: '$' + (totalBookedVol/1000).toFixed(0) + 'K',
      postLiftPct: postLift + '%',
      organicPct: organicRatio + '%',
      pattern: p.patternType,
      cycles: verifiedCycles,
      daysUnvisited: daysUnvisited || 'N/A',
      issues: issues.join(' | ')
    };

    if (issues.length > 0) {
      falsePositives.push(item);
    } else {
      truePositives.push(item);
    }
  }

  console.log(`=== AUDIT SUMMARY OF 243 "HIGH TLC" ACCOUNTS ===`);
  console.log(`🚨 Suspected False Positives (High Organic / Low Touch Dependency): ${falsePositives.length} (${(falsePositives.length / profiles.length * 100).toFixed(1)}%)`);
  console.log(`✅ Legitimate High TLC (Strict Spike & Decay / True Visit Dependency): ${truePositives.length} (${(truePositives.length / profiles.length * 100).toFixed(1)}%)`);

  console.log('\n--- SAMPLE 20 FALSE POSITIVES ---');
  console.table(falsePositives.slice(0, 20).map(x => ({
    id: x.id,
    name: x.name,
    rep: x.rep,
    visits: x.visits,
    bookings: x.bookings,
    volume: x.volume,
    postLift: x.postLiftPct,
    organic: x.organicPct,
    daysUnvisited: x.daysUnvisited,
    issues: x.issues
  })));

  console.log('\n--- SAMPLE 10 LEGITIMATE HIGH TLC ACCOUNTS ---');
  console.table(truePositives.slice(0, 10).map(x => ({
    id: x.id,
    name: x.name,
    rep: x.rep,
    visits: x.visits,
    bookings: x.bookings,
    volume: x.volume,
    postLift: x.postLiftPct,
    organic: x.organicPct,
    daysUnvisited: x.daysUnvisited,
    cycles: x.cycles
  })));

  await mongoose.disconnect();
}
auditTlcAccounts().catch(e => { console.error(e); process.exit(1); });
