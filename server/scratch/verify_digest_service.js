require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { collectDigestData } = require('../services/reports/dailyDigest');
const DailyDealerSnapshot = require('../models/DailyDealerSnapshot');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, { bufferCommands: false });
  console.log('Connected to MongoDB');

  const latest = await DailyDealerSnapshot.findOne({}).sort({ reportDate: -1 }).lean();
  const date = latest ? latest.reportDate : new Date('2026-08-27');
  console.log('Testing for date:', date.toISOString().slice(0, 10));

  // 1. Company wide
  const allData = await collectDigestData(date, 'application');
  console.log('\n=== COMPANY WIDE ===');
  console.log('Total Dealers:', allData.totalDealers, 'Snapshots:', allData.totalSnapshotsToday, 'Groups:', allData.totalGroups);
  console.log('Status Breakdown:', allData.status);
  console.log('Status Changes:', allData.statusChanges);
  console.log('At-Risk count:', allData.atRiskDealers.length);
  console.log('Transitions count:', allData.statusTransitions.length);

  // 2. Reps
  const reps = ['Dan Zilberchtein', 'Ward Stoutimore', 'John Harrington', 'Genevieve Coulombe'];
  for (const rep of reps) {
    const repData = await collectDigestData(date, 'application', rep);
    console.log(`\n=== REP: ${rep} ===`);
    console.log('Total Dealers:', repData.totalDealers, 'Snapshots:', repData.totalSnapshotsToday, 'Groups:', repData.totalGroups);
    console.log('Status Breakdown:', repData.status);
    console.log('Status Changes:', repData.statusChanges);
    console.log('At-Risk count:', repData.atRiskDealers.length);
    console.log('Transitions count:', repData.statusTransitions.length);
  }

  await mongoose.disconnect();
}

run().catch(console.error);
