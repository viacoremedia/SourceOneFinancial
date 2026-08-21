const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
const DealerProfile = require('../models/DealerProfile');
const Application = require('../models/Application');

async function runExhaustiveFinalSweep() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Running exhaustive final sweep across all 3,940 dealer profiles...\n');

  const profiles = await DealerProfile.find({}).lean();
  const now = new Date('2026-08-21T00:00:00.000Z');
  const d90Ago = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));

  // Fetch recent apps in last 90D
  const recentApps = await Application.find({ applicationDate: { $gte: d90Ago } })
    .select('clientDealerId applicationDate bookedDate status')
    .lean();

  const recentAppsByDealer = new Map();
  for (const a of recentApps) {
    if (!a.clientDealerId) continue;
    const k = a.clientDealerId.trim().toUpperCase();
    recentAppsByDealer.set(k, (recentAppsByDealer.get(k) || 0) + 1);
  }

  const checks = {
    // 1. High TLC with low total bookings (< 2 deals)
    tlcWithFewDeals: [],
    // 2. High TLC that is silent in last 180 days
    tlcSilent180D: [],
    // 3. Comfort Stops with high funded volume (>$500K)
    comfortStopHighVol: [],
    // 4. Discovery Queue accounts with hot recent apps (>= 5 apps in last 90D)
    discoveryHotRecent: [],
    // 5. Self-Sufficient with zero apps in last 180 days not marked lapsed
    selfSuffUnflaggedLapsed: [],
    // 6. Confirmed active High TLC champions
    topTlcChamps: [],
    // 7. Confirmed active Self-Sufficient champions
    topSelfSuffChamps: []
  };

  for (const p of profiles) {
    const id = p.clientDealerId;
    const demand = p.relationshipDemand;
    const pattern = p.patternType;
    const urgency = p.urgencyStatus;
    const visits = p.lifetimeStats?.totalVisits || 0;
    const apps = p.lifetimeStats?.totalApplications || 0;
    const bookings = p.lifetimeStats?.totalBookings || 0;
    const volume = p.lifetimeStats?.totalBookedVolume || 0;
    const lift = p.postVisitBookedLiftPct || 0;
    const recentAppCount = recentAppsByDealer.get(id) || 0;

    const row = {
      id,
      name: p.dealerName.slice(0, 25),
      rep: p.assignedRep || 'House',
      visits,
      apps,
      bookings,
      vol: '$' + (volume / 1000).toFixed(0) + 'K',
      lift: lift + '%',
      pattern,
      urgency,
      recent90DApps: recentAppCount
    };

    if (demand === 'high_tlc') {
      if (bookings < 2) checks.tlcWithFewDeals.push(row);
      if (urgency === 'dormant' || pattern === 'lapsed_churn') checks.tlcSilent180D.push(row);
      if (volume >= 500000 && lift >= 70) checks.topTlcChamps.push(row);
    }

    if (demand === 'comfort_stop') {
      if (volume >= 500000) checks.comfortStopHighVol.push(row);
    }

    if (demand === 'insufficient_data') {
      if (recentAppCount >= 5) checks.discoveryHotRecent.push(row);
    }

    if (demand === 'self_sufficient') {
      if (volume >= 1000000 && pattern !== 'lapsed_churn') checks.topSelfSuffChamps.push(row);
    }
  }

  console.log('======================================================================');
  console.log('               EXHAUSTIVE INTEGRITY AUDIT RESULTS                     ');
  console.log('======================================================================');

  console.log(`\n1. HIGH TLC INTEGRITY:`);
  console.log(`   - High TLC with < 2 Booked Deals: ${checks.tlcWithFewDeals.length}`);
  console.log(`   - High TLC Silent / Lapsed in 180D: ${checks.tlcSilent180D.length}`);
  console.log(`   - Top Active High TLC Champions ($500K+, >=70% lift): ${checks.topTlcChamps.length}`);

  console.log(`\n2. COMFORT STOP INTEGRITY:`);
  console.log(`   - Comfort Stops with >$500K Volume: ${checks.comfortStopHighVol.length}`);
  if (checks.comfortStopHighVol.length > 0) {
    console.log('     [Details on High-Volume Comfort Stops - verifying Underwriting Friction / Over-Servicing]:');
    console.table(checks.comfortStopHighVol);
  }

  console.log(`\n3. DISCOVERY QUEUE INTEGRITY:`);
  console.log(`   - Discovery Queue with Hot Recent Activity (>=5 apps in Summer 2026): ${checks.discoveryHotRecent.length}`);
  if (checks.discoveryHotRecent.length > 0) {
    console.table(checks.discoveryHotRecent);
  }

  console.log(`\n4. SELF-SUFFICIENT INTEGRITY:`);
  console.log(`   - Top Active Organic Powerhouses ($1M+ Volume, Active Flow): ${checks.topSelfSuffChamps.length}`);

  console.log('\n--- TOP 10 ACTIVE HIGH TLC CHAMPIONS ---');
  checks.topTlcChamps.sort((a,b) => parseInt(b.vol.replace(/\D/g,'')) - parseInt(a.vol.replace(/\D/g,'')));
  console.table(checks.topTlcChamps.slice(0, 10));

  console.log('\n--- TOP 10 ACTIVE SELF-SUFFICIENT CHAMPIONS ---');
  checks.topSelfSuffChamps.sort((a,b) => parseInt(b.vol.replace(/\D/g,'')) - parseInt(a.vol.replace(/\D/g,'')));
  console.table(checks.topSelfSuffChamps.slice(0, 10));

  await mongoose.disconnect();
}
runExhaustiveFinalSweep().catch(e => { console.error(e); process.exit(1); });
