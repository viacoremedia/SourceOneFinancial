const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
const DealerLocation = require('../models/DealerLocation');
const Application = require('../models/Application');
const DealerCommunication = require('../models/DealerCommunication');
const { evaluateDealerProfile } = require('../services/dealerRelationshipEngine');

async function testUserScreenshots() {
  await mongoose.connect(process.env.MONGODB_URI);

  const START_DATE = new Date('2025-01-01T00:00:00.000Z');
  const accountsToCheck = ['NC128', 'OH194', 'KY112', 'FL193', 'CO104', 'MO193', 'TX246', 'FL340', 'CT104'];

  const dealers = await DealerLocation.find({ clientDealerId: { $in: accountsToCheck } }).lean();
  const apps = await Application.find({ clientDealerId: { $in: accountsToCheck }, applicationDate: { $gte: START_DATE } }).lean();
  const comms = await DealerCommunication.find({ internalRelationshipId2: { $in: accountsToCheck }, communicationEventDatetime: { $gte: START_DATE } }).lean();

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

  console.log('=== VERIFICATION OF USER SCREENSHOTS WITH REFINED RECENCY & MULTI-CYCLE RULES ===\n');

  for (const id of accountsToCheck) {
    const loc = dealers.find(d => (d.clientDealerId || d.dealerId || '').trim().toUpperCase() === id);
    if (!loc) continue;
    const dApps = appsByDealer.get(id) || [];
    const dComms = commsByDealer.get(id) || [];

    const prof = evaluateDealerProfile(loc, dApps, dComms);

    console.log(`[${id}] ${prof.dealerName}`);
    console.log(`  Assigned Rep: ${prof.assignedRep}`);
    console.log(`  Demand: ${prof.relationshipDemand.toUpperCase()} | Pattern: ${prof.patternType} | Urgency: ${prof.urgencyStatus}`);
    console.log(`  2025+ Activity: ${prof.lifetimeStats.totalVisits} Visits | ${prof.lifetimeStats.totalApplications} Apps | ${prof.lifetimeStats.totalBookings} Bookings ($${(prof.lifetimeStats.totalBookedVolume/1000).toFixed(0)}K)`);
    console.log(`  Post-Visit Lift: ${prof.postVisitBookedLiftPct}% | Organic: ${prof.organicBookedRatio}%`);
    console.log(`  Rationale:`);
    prof.decisionRationale.forEach(r => console.log(`    - ${r}`));
    console.log('--------------------------------------------------\n');
  }

  await mongoose.disconnect();
}
testUserScreenshots().catch(e => { console.error(e); process.exit(1); });
