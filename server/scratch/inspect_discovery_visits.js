const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
const DealerProfile = require('../models/DealerProfile');

async function inspectDiscoveryWithVisits() {
  await mongoose.connect(process.env.MONGODB_URI);
  const profiles = await DealerProfile.find({
    relationshipDemand: 'insufficient_data',
    'lifetimeStats.totalVisits': { $gte: 3 }
  }).lean();

  console.log(`Discovery Queue accounts with >= 3 visits: ${profiles.length}\n`);

  console.table(profiles.map(p => ({
    id: p.clientDealerId,
    name: p.dealerName.slice(0, 25),
    rep: p.assignedRep || 'Unassigned',
    visits: p.lifetimeStats?.totalVisits,
    apps: p.lifetimeStats?.totalApplications,
    bookings: p.lifetimeStats?.totalBookings,
    volume: '$' + ((p.lifetimeStats?.totalBookedVolume || 0) / 1000).toFixed(0) + 'K',
    rationale: p.decisionRationale?.[0] || 'N/A'
  })));

  await mongoose.disconnect();
}
inspectDiscoveryWithVisits().catch(e => { console.error(e); process.exit(1); });
