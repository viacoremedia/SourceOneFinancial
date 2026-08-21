const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
const DealerProfile = require('../models/DealerProfile');

async function testOverVisitedTlc() {
  await mongoose.connect(process.env.MONGODB_URI);
  const profiles = await DealerProfile.find({ relationshipDemand: 'high_tlc' }).lean();

  const overVisitedLowYield = profiles.filter(p => {
    const visits = p.lifetimeStats?.totalVisits || 0;
    const bookings = p.lifetimeStats?.totalBookings || 0;
    const volume = p.lifetimeStats?.totalBookedVolume || 0;
    return visits >= 10 && (bookings <= 2 || volume < 150000);
  });

  console.log(`High TLC accounts with >=10 visits but <=2 bookings (<$150K vol): ${overVisitedLowYield.length}\n`);
  console.table(overVisitedLowYield.map(p => ({
    id: p.clientDealerId,
    name: p.dealerName.slice(0, 26),
    rep: p.assignedRep || 'House',
    visits: p.lifetimeStats?.totalVisits,
    apps: p.lifetimeStats?.totalApplications,
    bookings: p.lifetimeStats?.totalBookings,
    volume: '$' + ((p.lifetimeStats?.totalBookedVolume || 0)/1000).toFixed(0) + 'K',
    yieldPerVisit: '$' + (Math.round((p.lifetimeStats?.totalBookedVolume || 0) / p.lifetimeStats?.totalVisits / 1000)) + 'K'
  })));

  await mongoose.disconnect();
}
testOverVisitedTlc().catch(e => { console.error(e); process.exit(1); });
