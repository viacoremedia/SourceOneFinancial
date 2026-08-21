const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
const DealerLocation = require('../models/DealerLocation');
const Application = require('../models/Application');
const DealerCommunication = require('../models/DealerCommunication');
const { evaluateDealerProfile } = require('../services/dealerRelationshipEngine');

async function test2025Onward() {
  await mongoose.connect(process.env.MONGODB_URI);

  const START_DATE = new Date('2025-01-01T00:00:00.000Z');
  const accountsToCheck = ['MO193', 'CO104', 'TX246', 'MO106', 'TX512', 'KY108', 'AZ257', 'IL224', 'FL340', 'FL319', 'TN160', 'SCA157', 'CT104'];

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

  console.log('=== VERIFICATION OF USER ACCOUNTS (FILTERED TO JAN 1, 2025 ONWARD) ===\n');

  for (const id of accountsToCheck) {
    const loc = dealers.find(d => (d.clientDealerId || d.dealerId || '').trim().toUpperCase() === id);
    if (!loc) continue;
    const dApps = appsByDealer.get(id) || [];
    const dComms = commsByDealer.get(id) || [];

    const prof = evaluateDealerProfile(loc, dApps, dComms);

    console.log(`[${id}] ${prof.dealerName}`);
    console.log(`  Assigned Rep: ${prof.assignedRep}`);
    console.log(`  Demand: ${prof.relationshipDemand.toUpperCase()} | Urgency: ${prof.urgencyStatus}`);
    console.log(`  2025+ Activity: ${prof.lifetimeStats.totalVisits} Visits | ${prof.lifetimeStats.totalApplications} Apps | ${prof.lifetimeStats.totalBookings} Bookings ($${(prof.lifetimeStats.totalBookedVolume/1000).toFixed(0)}K)`);
    console.log(`  Post-Visit Lift: ${prof.postVisitBookedLiftPct}% | Organic Ratio: ${prof.organicBookedRatio}%`);
    console.log(`  Rationale:`);
    prof.decisionRationale.forEach(r => console.log(`    - ${r}`));
    console.log('--------------------------------------------------\n');
  }

  await mongoose.disconnect();
}
test2025Onward().catch(e => { console.error(e); process.exit(1); });
