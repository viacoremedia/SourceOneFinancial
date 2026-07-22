const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const SalesBudget = require('../models/SalesBudget');
const Application = require('../models/Application');

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const budgets = await SalesBudget.find({}).lean();
  console.log('--- ALL SALES BUDGETS ---');
  for (const b of budgets) {
    console.log(b);
  }

  // Let's also find all distinct dealerRepresentative values in Application
  const reps = await Application.distinct('dealerRepresentative');
  console.log('--- ALL REPS IN APPLICATION ---', reps);

  await mongoose.disconnect();
  process.exit(0);
}

test();
