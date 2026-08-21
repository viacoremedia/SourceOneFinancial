const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
const { getNetworkAggregateStats } = require('../services/dealerStatsService');

async function testSummaryTrends() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  // Current MTD: Aug 1 to Aug 21, 2026
  const currentStats = await getNetworkAggregateStats({ startDate: '2026-08-01', endDate: '2026-08-21' });
  // Comp MTD: July 1 to July 21, 2026
  const compStats = await getNetworkAggregateStats({ startDate: '2026-07-01', endDate: '2026-07-21' });

  function computeTrend(curr, prev) {
    if (!prev) return '0%';
    const pct = ((curr - prev) / prev) * 100;
    return (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
  }

  console.log('=== APP BOOKED METRICS & TRENDS (MTD: AUG 1-21 vs JULY 1-21) ===');
  console.log('Current App Booked Deals:', currentStats.leadBooked);
  console.log('Comp (Capped) App Booked Deals:', compStats.leadBooked);
  console.log('App Booked Deals Trend:', computeTrend(currentStats.leadBooked, compStats.leadBooked), `(${currentStats.leadBooked} vs ${compStats.leadBooked})`);

  console.log('\nCurrent App Booked Dollars:', '$' + (currentStats.leadBookedDollars / 1000000).toFixed(2) + 'M');
  console.log('Comp (Capped) App Booked Dollars:', '$' + (compStats.leadBookedDollars / 1000000).toFixed(2) + 'M');
  console.log('App Booked Dollars Trend:', computeTrend(currentStats.leadBookedDollars, compStats.leadBookedDollars), `($${(currentStats.leadBookedDollars / 1000000).toFixed(2)}M vs $${(compStats.leadBookedDollars / 1000000).toFixed(2)}M)`);

  console.log('\nCurrent Look-to-Book:', (currentStats.lookToBook * 100).toFixed(1) + '%');
  console.log('Comp Look-to-Book:', (compStats.lookToBook * 100).toFixed(1) + '%');
  console.log('Look-to-Book Trend:', computeTrend(currentStats.lookToBook, compStats.lookToBook));

  await mongoose.disconnect();
}
testSummaryTrends().catch(e => { console.error(e); process.exit(1); });
