const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
const Application = require('../models/Application');
const DealerLocation = require('../models/DealerLocation');
const DealerProfile = require('../models/DealerProfile');

async function auditAccountRecency() {
  await mongoose.connect(process.env.MONGODB_URI);

  const profiles = await DealerProfile.find({}).lean();
  const apps = await Application.find({ applicationDate: { $ne: null } })
    .select('clientDealerId applicationDate bookedDate')
    .lean();

  const now = new Date('2026-08-21T00:00:00Z');

  // Map latest app date and latest booked date by dealer
  const latestAppByDealer = new Map();
  const latestBookedByDealer = new Map();

  for (const a of apps) {
    if (!a.clientDealerId) continue;
    const k = a.clientDealerId.trim().toUpperCase();
    const appD = new Date(a.applicationDate);
    if (!latestAppByDealer.has(k) || appD > latestAppByDealer.get(k)) {
      latestAppByDealer.set(k, appD);
    }
    if (a.bookedDate) {
      const bookD = new Date(a.bookedDate);
      if (!latestBookedByDealer.has(k) || bookD > latestBookedByDealer.get(k)) {
        latestBookedByDealer.set(k, bookD);
      }
    }
  }

  const dormantProfiles = [];
  const dormantBySegment = {
    high_tlc: 0,
    self_sufficient: 0,
    comfort_stop: 0,
    insufficient_data: 0
  };

  for (const p of profiles) {
    const id = (p.clientDealerId || '').trim().toUpperCase();
    const lastApp = latestAppByDealer.get(id);
    const lastBooked = latestBookedByDealer.get(id);

    const daysSinceLastApp = lastApp ? Math.round((now - lastApp) / (1000 * 60 * 60 * 24)) : null;
    const daysSinceLastBooked = lastBooked ? Math.round((now - lastBooked) / (1000 * 60 * 60 * 24)) : null;

    // Is the account dormant (> 365 days since last application or visit)?
    const isDormant = (daysSinceLastApp !== null && daysSinceLastApp > 365) || (daysSinceLastApp === null && p.daysSinceLastVisit !== null && p.daysSinceLastVisit > 365);

    if (isDormant) {
      dormantBySegment[p.relationshipDemand]++;
      dormantProfiles.push({
        id,
        name: p.dealerName.slice(0, 26),
        rep: p.assignedRep || 'House',
        demand: p.relationshipDemand,
        visits: p.lifetimeStats?.totalVisits || 0,
        apps: p.lifetimeStats?.totalApplications || 0,
        bookings: p.lifetimeStats?.totalBookings || 0,
        vol: '$' + ((p.lifetimeStats?.totalBookedVolume || 0) / 1000).toFixed(0) + 'K',
        daysSinceLastApp: daysSinceLastApp || 'Never',
        daysSinceLastBooked: daysSinceLastBooked || 'Never',
        daysSinceLastVisit: p.daysSinceLastVisit || 'Never'
      });
    }
  }

  console.log(`=== NETWORK RECENCY & CHURN / DORMANT AUDIT ===`);
  console.log(`Total Accounts with No Apps in >365 days: ${dormantProfiles.length} / ${profiles.length}`);
  console.log(`Breakdown of Inactive Accounts by Current Segment:`);
  console.log(`  - Self-Sufficient marked inactive: ${dormantBySegment.self_sufficient}`);
  console.log(`  - High TLC marked inactive: ${dormantBySegment.high_tlc}`);
  console.log(`  - Comfort Stops marked inactive: ${dormantBySegment.comfort_stop}`);
  console.log(`  - Discovery Queue marked inactive: ${dormantBySegment.insufficient_data}\n`);

  console.log('--- SAMPLE 25 INACTIVE ACCOUNTS CURRENTLY LABELED SELF-SUFFICIENT ---');
  console.table(dormantProfiles.filter(x => x.demand === 'self_sufficient').slice(0, 25));

  await mongoose.disconnect();
}
auditAccountRecency().catch(e => { console.error(e); process.exit(1); });
