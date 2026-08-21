const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
const DealerLocation = require('../models/DealerLocation');
const Application = require('../models/Application');
const DealerCommunication = require('../models/DealerCommunication');
const { evaluateDealerProfile } = require('../services/dealerRelationshipEngine');

// Replace evaluate logic with new rules for testing
function testEvaluateProfile(loc, dApps, dComms) {
  const p = evaluateDealerProfile(loc, dApps, dComms);
  
  const postLift = p.postVisitBookedLiftPct || 0;
  const organic = p.organicBookedRatio !== null ? p.organicBookedRatio : (100 - postLift);
  const totalBookedVol = p.lifetimeStats.totalBookedVolume || 0;
  const totalBookings = p.lifetimeStats.totalBookings || 0;
  const totalVisits = p.lifetimeStats.totalVisits || 0;
  const totalApps = p.lifetimeStats.totalApplications || 0;
  const daysUnvisited = p.daysSinceLastVisit;
  const cycles = p.verifiedCycleCount || 0;

  const isUnderwritingFriction = (totalVisits >= 3 && totalBookings === 0 && totalApps >= 5);
  const isStrategicTlc = (totalBookedVol >= 500000 && postLift >= 65 && totalVisits >= 3);
  const isEmergingTlc = (cycles === 1 && totalVisits <= 2 && totalBookings >= 1 && totalBookings <= 3 && postLift >= 60);

  const isOrganicDominated = (organic >= 50 || postLift < 50);
  const hasDemonstratedAutonomy = (daysUnvisited !== null && daysUnvisited > 120 && totalBookedVol >= 100000 && organic >= 35);

  let demand = 'insufficient_data';
  if (totalVisits < 2 && totalApps < 5 && totalBookedVol < 100000) {
    demand = 'insufficient_data';
  } else if (totalVisits >= 3 && totalBookings === 0) {
    demand = 'comfort_stop';
  } else if (isOrganicDominated && (totalBookings >= 2 || totalBookedVol >= 75000 || totalApps >= 8)) {
    demand = 'self_sufficient';
  } else if (hasDemonstratedAutonomy) {
    demand = 'self_sufficient';
  } else if (
    (totalVisits >= 2 && totalBookings >= 1 && postLift >= 65) ||
    (cycles >= 2 && postLift >= 55) ||
    (isStrategicTlc) ||
    (totalVisits >= 4 && totalBookings >= 3 && organic <= 35)
  ) {
    demand = 'high_tlc';
  } else if (isEmergingTlc) {
    demand = 'high_tlc';
  } else if (totalBookings >= 2 || totalBookedVol >= 75000 || totalApps >= 8) {
    demand = 'self_sufficient';
  }

  return {
    ...p,
    newDemand: demand
  };
}

async function runTest() {
  await mongoose.connect(process.env.MONGODB_URI);

  const accountsToCheck = ['MO106', 'TX512', 'KY108', 'AZ257', 'IL224', 'GA119', 'FL111', 'FL319', 'TN160', 'SCA161', 'SCA157', 'FL340', 'TX511'];

  const dealers = await DealerLocation.find({ clientDealerId: { $in: accountsToCheck } }).lean();
  const apps = await Application.find({ clientDealerId: { $in: accountsToCheck }, applicationDate: { $ne: null } }).lean();
  const comms = await DealerCommunication.find({ internalRelationshipId2: { $in: accountsToCheck }, communicationEventDatetime: { $ne: null } }).lean();

  const appsByDealer = new Map();
  for (const app of apps) {
    if (!app.clientDealerId) continue;
    const k = app.clientDealerId.trim().toUpperCase();
    if (!appsByDealer.has(k)) appsByDealer.set(k, []);
    appsByDealer.get(k).push(app);
  }

  const commsByDealer = new Map();
  for (const comm of comms) {
    if (!comm.internalRelationshipId2) continue;
    const k = comm.internalRelationshipId2.trim().toUpperCase();
    if (!commsByDealer.has(k)) commsByDealer.set(k, []);
    commsByDealer.get(k).push(comm);
  }

  console.log('=== BEFORE VS AFTER REFINED CLASSIFICATION ===\n');

  for (const id of accountsToCheck) {
    const loc = dealers.find(d => (d.clientDealerId || d.dealerId || '').trim().toUpperCase() === id);
    if (!loc) continue;
    const dApps = appsByDealer.get(id) || [];
    const dComms = commsByDealer.get(id) || [];

    const prof = testEvaluateProfile(loc, dApps, dComms);

    console.log(`[${id}] ${prof.dealerName}`);
    console.log(`  OLD Demand: ${prof.relationshipDemand.toUpperCase()}  --->  NEW Demand: ${prof.newDemand.toUpperCase()}`);
    console.log(`  Total Visits: ${prof.lifetimeStats.totalVisits} | Bookings: ${prof.lifetimeStats.totalBookings} ($${(prof.lifetimeStats.totalBookedVolume/1000).toFixed(0)}K)`);
    console.log(`  Post-Visit Lift: ${prof.postVisitBookedLiftPct}% | Organic Ratio: ${prof.organicBookedRatio}% | Days Unvisited: ${prof.daysSinceLastVisit}`);
    console.log('--------------------------------------------------\n');
  }

  await mongoose.disconnect();
}
runTest().catch(e => { console.error(e); process.exit(1); });
