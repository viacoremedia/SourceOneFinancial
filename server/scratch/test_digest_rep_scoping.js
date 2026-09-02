require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { getRepQuery, getRepSearchTerms } = require('../config/repConfig');
const DealerLocation = require('../models/DealerLocation');
const DailyDealerSnapshot = require('../models/DailyDealerSnapshot');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, { bufferCommands: false });
  console.log('Connected to MongoDB');

  const latest = await DailyDealerSnapshot.findOne({}).sort({ reportDate: -1 }).lean();
  const reportDate = latest ? latest.reportDate : new Date('2026-08-27T00:00:00.000Z');
  console.log('Report date:', reportDate.toISOString().slice(0, 10));

  const statusSwitch = {
    $switch: {
      branches: [
        { case: { $eq: ['$daysSinceLastApplication', null] }, then: 'never_active' },
        { case: { $lte: ['$daysSinceLastApplication', 30] }, then: 'active' },
        { case: { $lte: ['$daysSinceLastApplication', 60] }, then: '30d_inactive' },
        { case: { $lte: ['$daysSinceLastApplication', 90] }, then: '60d_inactive' },
        { case: { $lte: ['$daysSinceLastApplication', 120] }, then: '90d_inactive' },
      ],
      default: 'long_inactive'
    }
  };

  // 1. All dealers
  const allBreakdown = await DailyDealerSnapshot.aggregate([
    { $match: { reportDate } },
    { $addFields: { _derivedStatus: statusSwitch } },
    { $group: { _id: '$_derivedStatus', count: { $sum: 1 } } }
  ]);
  console.log('\n--- ALL DEALERS BREAKDOWN ---');
  console.log(allBreakdown);

  // 2. By Reps
  const reps = ['Dan Zilberchtein', 'Ward Stoutimore', 'John Harrington', 'Genevieve Coulombe'];
  for (const r of reps) {
    const q = getRepQuery('dealerRepresentative', r);
    const locs = await DealerLocation.find(q).select('_id').lean();
    const locIds = locs.map(l => l._id);

    const repBreakdown = await DailyDealerSnapshot.aggregate([
      { $match: { reportDate, dealerLocation: { $in: locIds } } },
      { $addFields: { _derivedStatus: statusSwitch } },
      { $group: { _id: '$_derivedStatus', count: { $sum: 1 } } }
    ]);
    console.log(`\n--- REP: ${r} (Total Locs: ${locIds.length}) ---`);
    console.log(repBreakdown);
  }

  await mongoose.disconnect();
}

run().catch(console.error);
