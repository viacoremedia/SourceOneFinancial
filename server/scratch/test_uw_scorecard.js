const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
const { getUnderwriterScorecard } = require('../services/underwriterService');

async function testUW() {
  await mongoose.connect(process.env.MONGODB_URI);
  const data = await getUnderwriterScorecard({ startDate: '2026-08-01', endDate: '2026-08-21' });
  let totalApps = 0;
  let totalApproved = 0;
  let totalLeadBooked = 0;
  let totalLeadBookedVol = 0;
  let totalFundedBooked = 0;
  let totalFundedBookedVol = 0;

  for (const u of data) {
    totalApps += u.totalApps;
    totalApproved += u.approvedCount;
    totalLeadBooked += u.leadBookedCount;
    totalLeadBookedVol += u.leadBookedVolume;
    totalFundedBooked += u.closeBookedCount;
    totalFundedBookedVol += u.closeBookedVolume;
  }

  console.log('=== UNDERWRITER SCORECARD TOTALS (AUG 1-21, 2026) ===');
  console.log('Total Apps:', totalApps);
  console.log('Total Approved:', totalApproved);
  console.log('App Booked Deals:', totalLeadBooked, 'Vol:', '$' + (totalLeadBookedVol/1000000).toFixed(2) + 'M');
  console.log('Funded Booked Deals:', totalFundedBooked, 'Vol:', '$' + (totalFundedBookedVol/1000000).toFixed(2) + 'M');

  await mongoose.disconnect();
}
testUW().catch(e => { console.error(e); process.exit(1); });
