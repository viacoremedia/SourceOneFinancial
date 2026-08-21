const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
const DealerProfile = require('../models/DealerProfile');

async function checkComfortStopYield() {
  await mongoose.connect(process.env.MONGODB_URI);
  const profiles = await DealerProfile.find({}).lean();

  const highVisitsLowYield = [];

  for (const p of profiles) {
    const visits = p.lifetimeStats?.totalVisits || 0;
    const bookings = p.lifetimeStats?.totalBookings || 0;
    const volume = p.lifetimeStats?.totalBookedVolume || 0;
    const apps = p.lifetimeStats?.totalApplications || 0;
    const yieldPerVisit = visits > 0 ? volume / visits : 0;

    // Accounts with 5+ visits, <= 1 booking, and low yield (< $15K per visit)
    if (visits >= 5 && bookings <= 1 && yieldPerVisit < 20000) {
      highVisitsLowYield.push({
        id: p.clientDealerId,
        name: p.dealerName.slice(0, 28),
        rep: p.assignedRep || 'Unassigned',
        visits,
        apps,
        bookings,
        volume: '$' + (volume / 1000).toFixed(0) + 'K',
        yieldPerVisit: '$' + (yieldPerVisit / 1000).toFixed(1) + 'K',
        currentDemand: p.relationshipDemand
      });
    }
  }

  console.log(`High-Visit, Low-Yield Accounts (5+ visits, <=1 booking, <$20K yield): ${highVisitsLowYield.length}\n`);
  console.table(highVisitsLowYield);

  await mongoose.disconnect();
}
checkComfortStopYield().catch(e => { console.error(e); process.exit(1); });
