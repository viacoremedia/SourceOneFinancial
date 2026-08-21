const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
const DealerProfile = require('../models/DealerProfile');

async function fullTlcVerification() {
  await mongoose.connect(process.env.MONGODB_URI);
  const tlc = await DealerProfile.find({ relationshipDemand: 'high_tlc' })
    .sort({ 'lifetimeStats.totalBookedVolume': -1 })
    .lean();

  console.log(`=== FULL VERIFICATION OF ALL ${tlc.length} HIGH TLC ACCOUNTS ===\n`);

  let borderlineCount = 0;
  let strongTlcCount = 0;
  let singleVisitEmerging = 0;

  const fullList = [];

  for (let i = 0; i < tlc.length; i++) {
    const p = tlc[i];
    const postLift = p.postVisitBookedLiftPct || 0;
    const organic = p.organicBookedRatio !== null ? p.organicBookedRatio : (100 - postLift);
    const visits = p.lifetimeStats?.totalVisits || 0;
    const bookings = p.lifetimeStats?.totalBookings || 0;
    const volume = p.lifetimeStats?.totalBookedVolume || 0;
    const apps = p.lifetimeStats?.totalApplications || 0;
    const cycles = p.verifiedCycleCount || 0;
    const daysUnvisited = p.daysSinceLastVisit;

    let auditStatus = 'STRONG_TLC';
    if (visits === 1) {
      singleVisitEmerging++;
      auditStatus = 'EMERGING_1_VISIT';
    } else if (postLift < 60 || organic > 40) {
      borderlineCount++;
      auditStatus = 'BORDERLINE';
    } else {
      strongTlcCount++;
    }

    fullList.push({
      idx: i + 1,
      id: p.clientDealerId,
      name: p.dealerName.slice(0, 24),
      rep: p.assignedRep || 'House',
      visits,
      bookings,
      vol: '$' + (volume / 1000).toFixed(0) + 'K',
      lift: postLift + '%',
      org: organic + '%',
      unvisited: daysUnvisited || 0,
      cycles,
      status: auditStatus
    });
  }

  console.log(`Verification Breakdown:`);
  console.log(`  ✅ Strong Touch-Dependent High TLC (Lift >= 60%, Organic <= 40%, 2+ visits): ${strongTlcCount}`);
  console.log(`  🌱 Emerging High TLC (1 visit with high conversion): ${singleVisitEmerging}`);
  console.log(`  ⚠️ Borderline Accounts: ${borderlineCount}`);

  console.log('\n--- TOP 30 HIGH TLC ACCOUNTS BY VOLUME ---');
  console.table(fullList.slice(0, 30));

  console.log('\n--- BOTTOM 30 HIGH TLC ACCOUNTS BY VOLUME ---');
  console.table(fullList.slice(-30));

  if (borderlineCount > 0) {
    console.log('\n--- ALL BORDERLINE ACCOUNTS ---');
    console.table(fullList.filter(x => x.status === 'BORDERLINE'));
  }

  await mongoose.disconnect();
}
fullTlcVerification().catch(e => { console.error(e); process.exit(1); });
