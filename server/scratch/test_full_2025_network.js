const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
const DealerLocation = require('../models/DealerLocation');
const Application = require('../models/Application');
const DealerCommunication = require('../models/DealerCommunication');
const { evaluateDealerProfile } = require('../services/dealerRelationshipEngine');

async function testFull2025Network() {
  await mongoose.connect(process.env.MONGODB_URI);

  const START_DATE = new Date('2025-01-01T00:00:00.000Z');

  const dealers = await DealerLocation.find({ omniDealerId: { $exists: true, $ne: null } }).lean();
  const apps = await Application.find({ applicationDate: { $gte: START_DATE } }).lean();
  const comms = await DealerCommunication.find({ communicationEventDatetime: { $gte: START_DATE } }).lean();

  console.log(`=== FULL NETWORK SIMULATION (JAN 1, 2025 ONWARD) ===`);
  console.log(`Dealers: ${dealers.length}`);
  console.log(`2025+ Apps: ${apps.length}`);
  console.log(`2025+ Comms: ${comms.length}\n`);

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

  const segments = {
    high_tlc: 0,
    self_sufficient: 0,
    comfort_stop: 0,
    insufficient_data: 0
  };

  const urgency = {
    overdue: 0,
    due_soon: 0,
    on_track: 0,
    dormant: 0,
    self_sufficient: 0,
    not_monitored: 0
  };

  const tlcList = [];
  const comfortStopList = [];
  const selfSuffList = [];

  for (const loc of dealers) {
    const id = (loc.clientDealerId || loc.dealerId || '').trim().toUpperCase();
    const dApps = appsByDealer.get(id) || [];
    const dComms = commsByDealer.get(id) || [];

    const prof = evaluateDealerProfile(loc, dApps, dComms);

    segments[prof.relationshipDemand]++;
    urgency[prof.urgencyStatus] = (urgency[prof.urgencyStatus] || 0) + 1;

    const row = {
      id,
      name: prof.dealerName.slice(0, 24),
      rep: prof.assignedRep || 'House',
      visits: prof.lifetimeStats.totalVisits,
      apps: prof.lifetimeStats.totalApplications,
      bookings: prof.lifetimeStats.totalBookings,
      vol: '$' + (prof.lifetimeStats.totalBookedVolume/1000).toFixed(0) + 'K',
      lift: (prof.postVisitBookedLiftPct || 0) + '%',
      org: (prof.organicBookedRatio || 0) + '%',
      urgency: prof.urgencyStatus
    };

    if (prof.relationshipDemand === 'high_tlc') tlcList.push(row);
    if (prof.relationshipDemand === 'comfort_stop') comfortStopList.push(row);
    if (prof.relationshipDemand === 'self_sufficient') selfSuffList.push(row);
  }

  console.log(`Segment Distribution (2025-2026):`);
  console.log(`  🔴 High TLC (Visit-Dependent) : ${segments.high_tlc} (${((segments.high_tlc/dealers.length)*100).toFixed(1)}%)`);
  console.log(`  🟢 Self-Sufficient (Organic)   : ${segments.self_sufficient} (${((segments.self_sufficient/dealers.length)*100).toFixed(1)}%)`);
  console.log(`  🟠 Comfort Stop (Time Sinks)   : ${segments.comfort_stop} (${((segments.comfort_stop/dealers.length)*100).toFixed(1)}%)`);
  console.log(`  ⚪ Discovery Queue (Low Data) : ${segments.insufficient_data} (${((segments.insufficient_data/dealers.length)*100).toFixed(1)}%)\n`);

  console.log(`Urgency Distribution:`);
  console.log(`  🚨 Overdue    : ${urgency.overdue}`);
  console.log(`  ⏳ Due Soon   : ${urgency.due_soon}`);
  console.log(`  ✅ On Track   : ${urgency.on_track}`);
  console.log(`  🟢 Self-Suff  : ${urgency.self_sufficient}`);
  console.log(`  ⚪ Not Mon.   : ${urgency.not_monitored}\n`);

  console.log('--- SAMPLE 15 TOP HIGH TLC ACCOUNTS (2025+) ---');
  tlcList.sort((a,b) => parseInt(b.vol.replace(/\D/g,'')) - parseInt(a.vol.replace(/\D/g,'')));
  console.table(tlcList.slice(0, 15));

  console.log('\n--- SAMPLE 15 TOP SELF-SUFFICIENT ACCOUNTS (2025+) ---');
  selfSuffList.sort((a,b) => parseInt(b.vol.replace(/\D/g,'')) - parseInt(a.vol.replace(/\D/g,'')));
  console.table(selfSuffList.slice(0, 15));

  console.log('\n--- SAMPLE 15 TOP COMFORT STOPS (2025+) ---');
  console.table(comfortStopList.slice(0, 15));

  await mongoose.disconnect();
}
testFull2025Network().catch(e => { console.error(e); process.exit(1); });
