const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
const DealerProfile = require('../models/DealerProfile');
const DealerLocation = require('../models/DealerLocation');
const Application = require('../models/Application');
const DealerCommunication = require('../models/DealerCommunication');
const { classifyCommType, clusterVisits } = require('../services/dealerRelationshipEngine');

async function auditAllDealers() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB. Auditing all 3,940 dealer relationship profiles...\n');

  const profiles = await DealerProfile.find({}).lean();
  console.log(`Total Profiles in DB: ${profiles.length}`);

  const segmentCounts = { high_tlc: 0, self_sufficient: 0, comfort_stop: 0, insufficient_data: 0 };
  const urgencyCounts = { overdue: 0, due_soon: 0, on_track: 0, self_sufficient: 0, not_monitored: 0 };

  for (const p of profiles) {
    segmentCounts[p.relationshipDemand] = (segmentCounts[p.relationshipDemand] || 0) + 1;
    urgencyCounts[p.urgencyStatus] = (urgencyCounts[p.urgencyStatus] || 0) + 1;
  }

  console.log('=== SEGMENT BREAKDOWN ===');
  console.table(segmentCounts);
  console.log('\n=== URGENCY BREAKDOWN ===');
  console.table(urgencyCounts);

  // ── AUDIT 1: HIGH TLC PROFILE ISSUES ──
  console.log('\n==================================================');
  console.log('1. AUDITING HIGH TLC DEALT WITH EDGE CASES & RISKS');
  console.log('==================================================');

  const highTlc = profiles.filter(p => p.relationshipDemand === 'high_tlc');
  
  // Issue 1.1: High TLC with only 1 total visit in lifetime
  const singleVisitHighTlc = highTlc.filter(p => (p.lifetimeStats?.totalVisits || 0) <= 1);
  console.log(`\n[ISSUE 1.1] High TLC with <= 1 Lifetime Visit: ${singleVisitHighTlc.length}`);
  if (singleVisitHighTlc.length > 0) {
    console.table(singleVisitHighTlc.slice(0, 10).map(p => ({
      id: p.clientDealerId,
      name: p.dealerName.slice(0, 25),
      visits: p.lifetimeStats?.totalVisits,
      bookings: p.lifetimeStats?.totalBookings,
      volume: p.lifetimeStats?.totalBookedVolume,
      cycles: p.verifiedCycleCount,
      confidence: p.confidenceScore
    })));
  }

  // Issue 1.2: High TLC with $0 Booked Volume
  const zeroBookedHighTlc = highTlc.filter(p => (p.lifetimeStats?.totalBookedVolume || 0) === 0);
  console.log(`\n[ISSUE 1.2] High TLC with $0 Booked Volume (Should never happen): ${zeroBookedHighTlc.length}`);

  // Issue 1.3: High TLC with only 1 booked deal ever (Single-Hit Wonder)
  const singleDealHighTlc = highTlc.filter(p => (p.lifetimeStats?.totalBookings || 0) === 1);
  console.log(`\n[ISSUE 1.3] High TLC with only 1 Lifetime Booking: ${singleDealHighTlc.length}`);
  if (singleDealHighTlc.length > 0) {
    console.table(singleDealHighTlc.slice(0, 10).map(p => ({
      id: p.clientDealerId,
      name: p.dealerName.slice(0, 25),
      visits: p.lifetimeStats?.totalVisits,
      volume: p.lifetimeStats?.totalBookedVolume,
      rep: p.assignedRep
    })));
  }

  // ── AUDIT 2: SELF-SUFFICIENT PROFILE ISSUES ──
  console.log('\n==================================================');
  console.log('2. AUDITING SELF-SUFFICIENT (AUTONOMOUS) ISSUES');
  console.log('==================================================');

  const selfSuff = profiles.filter(p => p.relationshipDemand === 'self_sufficient');

  // Issue 2.1: Self-Sufficient with 0 Booked Deals
  const zeroBookedSelfSuff = selfSuff.filter(p => (p.lifetimeStats?.totalBookings || 0) === 0);
  console.log(`\n[ISSUE 2.1] Self-Sufficient with $0 Booked Deals: ${zeroBookedSelfSuff.length}`);
  if (zeroBookedSelfSuff.length > 0) {
    console.table(zeroBookedSelfSuff.slice(0, 10).map(p => ({
      id: p.clientDealerId,
      name: p.dealerName.slice(0, 25),
      apps: p.lifetimeStats?.totalApplications,
      visits: p.lifetimeStats?.totalVisits
    })));
  }

  // Issue 2.2: Self-Sufficient with < 3 Applications (Low data classified as autonomous)
  const lowDataSelfSuff = selfSuff.filter(p => (p.lifetimeStats?.totalApplications || 0) < 3 && (p.lifetimeStats?.totalBookings || 0) <= 1);
  console.log(`\n[ISSUE 2.2] Self-Sufficient with < 3 Apps & <= 1 Booking: ${lowDataSelfSuff.length}`);

  // Issue 2.3: Self-Sufficient with HIGH visit counts (>= 5 visits) that might actually be High TLC false negatives
  const highVisitSelfSuff = selfSuff.filter(p => (p.lifetimeStats?.totalVisits || 0) >= 5 && (p.postVisitBookedLiftPct || 0) >= 60);
  console.log(`\n[ISSUE 2.3] Self-Sufficient with >= 5 Visits & >= 60% Lift (Potential False Negative TLC): ${highVisitSelfSuff.length}`);
  if (highVisitSelfSuff.length > 0) {
    console.table(highVisitSelfSuff.slice(0, 10).map(p => ({
      id: p.clientDealerId,
      name: p.dealerName.slice(0, 25),
      visits: p.lifetimeStats?.totalVisits,
      bookings: p.lifetimeStats?.totalBookings,
      volume: p.lifetimeStats?.totalBookedVolume,
      lift: p.postVisitBookedLiftPct,
      cycles: p.verifiedCycleCount
    })));
  }

  // ── AUDIT 3: COMFORT STOP PROFILE ISSUES ──
  console.log('\n==================================================');
  console.log('3. AUDITING COMFORT STOPS (TIME SINKS)');
  console.log('==================================================');

  const comfortStops = profiles.filter(p => p.relationshipDemand === 'comfort_stop');

  // Issue 3.1: Comfort Stop with Booked Volume > 0
  const bookedComfortStops = comfortStops.filter(p => (p.lifetimeStats?.totalBookedVolume || 0) > 0);
  console.log(`\n[ISSUE 3.1] Comfort Stops with Booked Volume > $0: ${bookedComfortStops.length}`);

  // Issue 3.2: Comfort Stops with High App Activity (Underwriting/Credit Friction, NOT Rep Failure)
  const highAppComfortStops = comfortStops.filter(p => (p.lifetimeStats?.totalApplications || 0) >= 5);
  console.log(`\n[ISSUE 3.2] Comfort Stops with >= 5 Apps (Dealer IS submitting, but underwriting declined/no books): ${highAppComfortStops.length}`);
  if (highAppComfortStops.length > 0) {
    console.table(highAppComfortStops.slice(0, 10).map(p => ({
      id: p.clientDealerId,
      name: p.dealerName.slice(0, 25),
      visits: p.lifetimeStats?.totalVisits,
      apps: p.lifetimeStats?.totalApplications,
      bookings: p.lifetimeStats?.totalBookings,
      rep: p.assignedRep
    })));
  }

  // ── AUDIT 4: DISCOVERY QUEUE (INSUFFICIENT DATA) LEAKAGE ──
  console.log('\n==================================================');
  console.log('4. AUDITING DISCOVERY QUEUE (INSUFFICIENT DATA)');
  console.log('==================================================');

  const discovery = profiles.filter(p => p.relationshipDemand === 'insufficient_data');

  // Issue 4.1: Discovery Queue with Significant Booked Volume (> $100K)
  const highVolumeDiscovery = discovery.filter(p => (p.lifetimeStats?.totalBookedVolume || 0) >= 100000);
  console.log(`\n[ISSUE 4.1] Discovery Queue with >= $100K Booked Volume: ${highVolumeDiscovery.length}`);
  if (highVolumeDiscovery.length > 0) {
    console.table(highVolumeDiscovery.slice(0, 10).map(p => ({
      id: p.clientDealerId,
      name: p.dealerName.slice(0, 25),
      volume: p.lifetimeStats?.totalBookedVolume,
      bookings: p.lifetimeStats?.totalBookings,
      visits: p.lifetimeStats?.totalVisits,
      apps: p.lifetimeStats?.totalApplications
    })));
  }

  // Issue 4.2: Discovery Queue with >= 3 In-Person Visits
  const highVisitDiscovery = discovery.filter(p => (p.lifetimeStats?.totalVisits || 0) >= 3);
  console.log(`\n[ISSUE 4.2] Discovery Queue with >= 3 Visits (Should be Comfort Stop or TLC): ${highVisitDiscovery.length}`);
  if (highVisitDiscovery.length > 0) {
    console.table(highVisitDiscovery.slice(0, 10).map(p => ({
      id: p.clientDealerId,
      name: p.dealerName.slice(0, 25),
      visits: p.lifetimeStats?.totalVisits,
      bookings: p.lifetimeStats?.totalBookings,
      apps: p.lifetimeStats?.totalApplications
    })));
  }

  // ── AUDIT 5: DATA INTEGRITY & TIMELINE SANITY ──
  console.log('\n==================================================');
  console.log('5. AUDITING DATA INTEGRITY & TIMELINE AGGREGATION');
  console.log('==================================================');

  let missingRationaleCount = 0;
  let emptyTimelineCount = 0;
  let daysSinceVisitAnomalies = 0;

  for (const p of profiles) {
    if (!p.decisionRationale || p.decisionRationale.length === 0) missingRationaleCount++;
    if (!p.timelineMonthly || p.timelineMonthly.length === 0) emptyTimelineCount++;
    if (p.lifetimeStats?.totalVisits > 0 && p.daysSinceLastVisit === null) daysSinceVisitAnomalies++;
  }

  console.log(`Missing Decision Rationale: ${missingRationaleCount}`);
  console.log(`Empty Monthly Timeline: ${emptyTimelineCount}`);
  console.log(`Visit count > 0 but daysSinceLastVisit is null: ${daysSinceVisitAnomalies}`);

  await mongoose.disconnect();
  console.log('\nAudit complete.');
}

auditAllDealers().catch(e => { console.error(e); process.exit(1); });
