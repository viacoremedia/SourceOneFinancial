const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
const DealerLocation = require('../models/DealerLocation');
const Application = require('../models/Application');
const DealerCommunication = require('../models/DealerCommunication');
const { evaluateDealerProfile } = require('../services/dealerRelationshipEngine');

async function testRefinedRules() {
  await mongoose.connect(process.env.MONGODB_URI);

  const accountsToCheck = ['MO106', 'TX512', 'KY108', 'AZ257', 'IL224', 'GA119', 'FL111', 'FL319', 'TN160', 'SCA161', 'SCA157', 'FL340', 'TX511'];

  // Load only matching dealers
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

  console.log('=== DEEP DIVE ON CANDIDATE ACCOUNTS ===\n');

  for (const id of accountsToCheck) {
    const loc = dealers.find(d => (d.clientDealerId || d.dealerId || '').trim().toUpperCase() === id);
    if (!loc) continue;
    const dApps = appsByDealer.get(id) || [];
    const dComms = commsByDealer.get(id) || [];

    const profile = evaluateDealerProfile(loc, dApps, dComms);

    console.log(`[${id}] ${profile.dealerName}`);
    console.log(`  Assigned Rep: ${profile.assignedRep}`);
    console.log(`  Demand: ${profile.relationshipDemand.toUpperCase()}`);
    console.log(`  Total Visits: ${profile.lifetimeStats.totalVisits} | Total Bookings: ${profile.lifetimeStats.totalBookings} ($${(profile.lifetimeStats.totalBookedVolume/1000).toFixed(0)}K)`);
    console.log(`  Post-Visit Lift: ${profile.postVisitBookedLiftPct}% | Organic Ratio: ${profile.organicBookedRatio}%`);
    console.log(`  Days Unvisited: ${profile.daysSinceLastVisit}`);
    console.log(`  Verified Spike Cycles: ${profile.verifiedCycleCount}`);
    console.log(`  Rationale:`);
    profile.decisionRationale.forEach(r => console.log(`    - ${r}`));
    console.log('--------------------------------------------------\n');
  }

  await mongoose.disconnect();
}
testRefinedRules().catch(e => { console.error(e); process.exit(1); });
