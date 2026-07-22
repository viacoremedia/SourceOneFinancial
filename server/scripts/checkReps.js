const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const Application = require('../models/Application');
const DealerLocation = require('../models/DealerLocation');
const SalesBudget = require('../models/SalesBudget');

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('--- CONNECTED TO MONGODB ---');

  // 1. Application collection reps
  const appReps = await Application.distinct('dealerRepresentative');
  console.log('Application collection distinct dealerRepresentative:', appReps);

  // 2. DealerLocation collection reps
  const locReps = await DealerLocation.distinct('dealerRepresentative');
  console.log('DealerLocation collection distinct dealerRepresentative:', locReps);

  // 3. SalesBudget collection reps
  const budgetReps = await SalesBudget.distinct('repName');
  console.log('SalesBudget collection distinct repName:', budgetReps);

  // 4. Counts per rep in DealerLocation
  const locCounts = await DealerLocation.aggregate([
    { $group: { _id: '$dealerRepresentative', count: { $sum: 1 }, states: { $addToSet: '$statePrefix' } } }
  ]);
  console.log('DealerLocation Rep Breakdown:', JSON.stringify(locCounts, null, 2));

  // 5. Counts per rep in Application
  const appCounts = await Application.aggregate([
    { $group: { _id: '$dealerRepresentative', count: { $sum: 1 } } }
  ]);
  console.log('Application Rep Breakdown:', JSON.stringify(appCounts, null, 2));

  // 6. Check state breakdown in Application
  const appStateCounts = await Application.aggregate([
    { $group: { _id: '$dealerState', count: { $sum: 1 } } }
  ]);
  console.log('Application State Breakdown (sample 10):', appStateCounts.slice(0, 10));

  await mongoose.disconnect();
  process.exit(0);
}

test();
