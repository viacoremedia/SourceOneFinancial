const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
const DealerLocation = require('../models/DealerLocation');
const Application = require('../models/Application');
const DealerCommunication = require('../models/DealerCommunication');
const { evaluateDealerProfile } = require('../services/dealerRelationshipEngine');

async function testAll3940() {
  await mongoose.connect(process.env.MONGODB_URI);

  const dealers = await DealerLocation.find({ omniDealerId: { $exists: true, $ne: null } }).lean();
  const apps = await Application.find({ applicationDate: { $ne: null } }).lean();
  const comms = await DealerCommunication.find({ communicationEventDatetime: { $ne: null } }).lean();

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

  // Refined classification tester
  const segments = {
    high_tlc: 0,
    self_sufficient: 0,
    comfort_stop: 0,
    insufficient_data: 0
  };

  const highTlcList = [];
  const reclassifiedFromTlcToSelfSuff = [];

  for (const loc of dealers) {
    const id = (loc.clientDealerId || loc.dealerId || '').trim().toUpperCase();
    const dApps = appsByDealer.get(id) || [];
    const dComms = commsByDealer.get(id) || [];

    const prof = evaluateDealerProfile(loc, dApps, dComms);
    const postLift = prof.postVisitBookedLiftPct || 0;
    const organic = prof.organicBookedRatio !== null ? prof.organicBookedRatio : (100 - postLift);
    const totalBookedVol = prof.lifetimeStats.totalBookedVolume || 0;
    const totalBookings = prof.lifetimeStats.totalBookings || 0;
    const totalVisits = prof.lifetimeStats.totalVisits || 0;
    const daysUnvisited = prof.daysSinceLastVisit;

    let segment = prof.relationshipDemand;

    // Apply strict refined logic:
    // If it was high_tlc, but organic >= 50% or postLift < 50%, or unvisited > 120d with >= $100K unvisited volume
    if (segment === 'high_tlc') {
      if (organic >= 50 || postLift < 50 || (daysUnvisited !== null && daysUnvisited > 120 && totalBookedVol >= 100000 && organic >= 35)) {
        segment = 'self_sufficient';
        reclassifiedFromTlcToSelfSuff.push({
          id,
          name: prof.dealerName,
          rep: prof.assignedRep,
          visits: totalVisits,
          bookings: totalBookings,
          volume: '$' + (totalBookedVol/1000).toFixed(0) + 'K',
          postLift: postLift + '%',
          organic: organic + '%',
          daysUnvisited
        });
      } else {
        highTlcList.push({
          id,
          name: prof.dealerName,
          rep: prof.assignedRep,
          visits: totalVisits,
          bookings: totalBookings,
          volume: '$' + (totalBookedVol/1000).toFixed(0) + 'K',
          postLift: postLift + '%',
          organic: organic + '%',
          daysUnvisited
        });
      }
    }

    segments[segment]++;
  }

  console.log('=== REFINED 3,940 DATABASE CLASSIFICATION AUDIT ===');
  console.log('High TLC (True Visit-Dependent):', segments.high_tlc, `(${highTlcList.length} verified accounts)`);
  console.log('Self-Sufficient (Autonomous Flow):', segments.self_sufficient, `(Includes ${reclassifiedFromTlcToSelfSuff.length} corrected false positives)`);
  console.log('Comfort Stops (Time Sinks):', segments.comfort_stop);
  console.log('Discovery Queue:', segments.insufficient_data);

  console.log(`\n--- SAMPLE 15 CORRECTED FALSE POSITIVES (NOW SELF-SUFFICIENT) ---`);
  console.table(reclassifiedFromTlcToSelfSuff.slice(0, 15));

  console.log(`\n--- SAMPLE 15 CONFIRMED TRUE HIGH TLC ACCOUNTS ---`);
  console.table(highTlcList.slice(0, 15));

  await mongoose.disconnect();
}
testAll3940().catch(e => { console.error(e); process.exit(1); });
