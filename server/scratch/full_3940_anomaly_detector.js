const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
const DealerProfile = require('../models/DealerProfile');

async function runFullAnomalyDetector() {
  await mongoose.connect(process.env.MONGODB_URI);
  const profiles = await DealerProfile.find({}).lean();

  console.log(`Auditing all ${profiles.length} profiles for behavioral anomalies...\n`);

  const anomalies = {
    // 1. High TLC anomalies
    tlcWithHighOrganic: [],        // High TLC with >45% organic
    tlcWithFewVisitsFewDeals: [],  // High TLC with <2 visits or <1 deal
    tlcWithZeroPostLift: [],       // High TLC with 0% post-visit lift
    
    // 2. Self-Sufficient anomalies
    selfSuffWith100PctLift: [],    // Self-Suff with >70% post-visit lift & 2+ visits (Should this be TLC?)
    selfSuffWithZeroBookings: [],  // Self-Suff with 0 bookings
    
    // 3. Comfort Stop anomalies
    comfortStopWithBookings: [],   // Comfort stop with >= 1 booking
    comfortStopWithHighApps: [],   // Comfort stop with >= 10 apps (Underwriting review)
    
    // 4. Discovery Queue anomalies
    discoveryWithHighVolume: [],   // Discovery with > $100K booked
    discoveryWithHighVisits: [],   // Discovery with >= 3 visits
  };

  for (const p of profiles) {
    const demand = p.relationshipDemand;
    const postLift = p.postVisitBookedLiftPct || 0;
    const organic = p.organicBookedRatio !== null ? p.organicBookedRatio : (100 - postLift);
    const visits = p.lifetimeStats?.totalVisits || 0;
    const bookings = p.lifetimeStats?.totalBookings || 0;
    const volume = p.lifetimeStats?.totalBookedVolume || 0;
    const apps = p.lifetimeStats?.totalApplications || 0;
    const daysUnvisited = p.daysSinceLastVisit;

    const summary = {
      id: p.clientDealerId,
      name: p.dealerName.slice(0, 30),
      rep: p.assignedRep || 'Unassigned',
      visits,
      apps,
      bookings,
      volume: '$' + (volume / 1000).toFixed(0) + 'K',
      postLift: postLift + '%',
      organic: organic + '%',
      daysUnvisited: daysUnvisited || 'N/A',
      pattern: p.patternType,
      flags: p.flags
    };

    // Category 1: High TLC Check
    if (demand === 'high_tlc') {
      if (organic > 45) {
        anomalies.tlcWithHighOrganic.push(summary);
      }
      if (visits < 2 || bookings < 1) {
        anomalies.tlcWithFewVisitsFewDeals.push(summary);
      }
      if (postLift === 0) {
        anomalies.tlcWithZeroPostLift.push(summary);
      }
    }

    // Category 2: Self-Sufficient Check
    if (demand === 'self_sufficient') {
      if (visits >= 2 && postLift >= 70 && bookings >= 2 && organic <= 30) {
        anomalies.selfSuffWith100PctLift.push(summary);
      }
      if (bookings === 0 && apps < 8) {
        anomalies.selfSuffWithZeroBookings.push(summary);
      }
    }

    // Category 3: Comfort Stop Check
    if (demand === 'comfort_stop') {
      if (bookings > 0) {
        anomalies.comfortStopWithBookings.push(summary);
      }
      if (apps >= 10 && !p.flags?.isUnderwritingFriction) {
        anomalies.comfortStopWithHighApps.push(summary);
      }
    }

    // Category 4: Discovery Queue Check
    if (demand === 'insufficient_data') {
      if (volume >= 100000) {
        anomalies.discoveryWithHighVolume.push(summary);
      }
      if (visits >= 3) {
        anomalies.discoveryWithHighVisits.push(summary);
      }
    }
  }

  console.log('================================================================');
  console.log('         FULL DATABASE ANOMALY & EDGE CASE AUDIT REPORT         ');
  console.log('================================================================');
  
  console.log(`\n1. HIGH TLC BUCKET (Total: ${profiles.filter(p => p.relationshipDemand === 'high_tlc').length}):`);
  console.log(`   - High TLC with >45% Organic Flow: ${anomalies.tlcWithHighOrganic.length}`);
  console.log(`   - High TLC with <2 Visits or <1 Booking: ${anomalies.tlcWithFewVisitsFewDeals.length}`);
  console.log(`   - High TLC with 0% Post-Visit Lift: ${anomalies.tlcWithZeroPostLift.length}`);

  if (anomalies.tlcWithHighOrganic.length > 0) {
    console.log('\n   [Sample High TLC with >45% Organic]:');
    console.table(anomalies.tlcWithHighOrganic.slice(0, 5));
  }
  if (anomalies.tlcWithFewVisitsFewDeals.length > 0) {
    console.log('\n   [Sample High TLC with <2 visits or <1 booking]:');
    console.table(anomalies.tlcWithFewVisitsFewDeals.slice(0, 5));
  }

  console.log(`\n2. SELF-SUFFICIENT BUCKET (Total: ${profiles.filter(p => p.relationshipDemand === 'self_sufficient').length}):`);
  console.log(`   - Self-Sufficient but has >=70% Post-Visit Lift & 2+ visits: ${anomalies.selfSuffWith100PctLift.length}`);
  console.log(`   - Self-Sufficient with 0 Bookings and <8 Apps: ${anomalies.selfSuffWithZeroBookings.length}`);

  if (anomalies.selfSuffWith100PctLift.length > 0) {
    console.log('\n   [Sample Self-Suff with >=70% Post-Visit Lift]:');
    console.table(anomalies.selfSuffWith100PctLift.slice(0, 5));
  }

  console.log(`\n3. COMFORT STOP BUCKET (Total: ${profiles.filter(p => p.relationshipDemand === 'comfort_stop').length}):`);
  console.log(`   - Comfort Stops with >0 Bookings (Should NOT be comfort stop): ${anomalies.comfortStopWithBookings.length}`);
  console.log(`   - Comfort Stops with >=10 Apps not flagged for UW review: ${anomalies.comfortStopWithHighApps.length}`);

  if (anomalies.comfortStopWithBookings.length > 0) {
    console.log('\n   [Sample Comfort Stops with Bookings]:');
    console.table(anomalies.comfortStopWithBookings.slice(0, 5));
  }

  console.log(`\n4. DISCOVERY QUEUE BUCKET (Total: ${profiles.filter(p => p.relationshipDemand === 'insufficient_data').length}):`);
  console.log(`   - Discovery Queue with >=$100K Booked Volume: ${anomalies.discoveryWithHighVolume.length}`);
  console.log(`   - Discovery Queue with >=3 Visits: ${anomalies.discoveryWithHighVisits.length}`);

  if (anomalies.discoveryWithHighVolume.length > 0) {
    console.log('\n   [Sample Discovery with >=$100K Booked]:');
    console.table(anomalies.discoveryWithHighVolume.slice(0, 5));
  }

  await mongoose.disconnect();
}
runFullAnomalyDetector().catch(e => { console.error(e); process.exit(1); });
