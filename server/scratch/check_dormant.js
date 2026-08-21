const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
const DealerProfile = require('../models/DealerProfile');
const DailyDealerSnapshot = require('../models/DailyDealerSnapshot');

async function checkDormant() {
  await mongoose.connect(process.env.MONGODB_URI);
  const profiles = await DealerProfile.find({}).lean();
  
  const highTlc = profiles.filter(p => p.relationshipDemand === 'high_tlc');
  console.log('Total High TLC accounts:', highTlc.length);

  const dormantHighTlc = highTlc.filter(p => (p.daysSinceLastVisit || 0) > 365 || (p.daysSinceLastTouch || 0) > 365);
  console.log(`High TLC unvisited for > 365 days (> 1 year): ${dormantHighTlc.length}`);
  
  const overdueProfiles = profiles.filter(p => p.urgencyStatus === 'overdue');
  console.log('Total Overdue accounts:', overdueProfiles.length);
  const dormantOverdue = overdueProfiles.filter(p => (p.daysSinceLastVisit || 0) > 365);
  console.log(`Overdue accounts unvisited > 365 days (like TX511 757d): ${dormantOverdue.length}`);

  if (dormantOverdue.length > 0) {
    console.log('\nSample Dormant Overdue Accounts:');
    console.table(dormantOverdue.slice(0, 10).map(p => ({
      id: p.clientDealerId,
      name: p.dealerName.slice(0, 25),
      daysUnvisited: p.daysSinceLastVisit,
      lastVisit: p.lastVisitDate ? p.lastVisitDate.toISOString().split('T')[0] : 'N/A',
      apps: p.lifetimeStats?.totalApplications,
      bookings: p.lifetimeStats?.totalBookings
    })));
  }

  await mongoose.disconnect();
}
checkDormant().catch(e => { console.error(e); process.exit(1); });
