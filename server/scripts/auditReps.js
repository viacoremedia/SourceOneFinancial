const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const Application = require('../models/Application');
const DealerLocation = require('../models/DealerLocation');

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const appReps = await Application.distinct('dealerRepresentative');
  const locReps = await DealerLocation.distinct('dealerRepresentative');
  
  const allReps = Array.from(new Set([...appReps, ...locReps])).filter(Boolean).sort();
  console.log('--- ALL UNIQUE REPS IN MONGO DB ---');
  
  for (const r of allReps) {
    const locs = await DealerLocation.countDocuments({ dealerRepresentative: r });
    const apps = await Application.countDocuments({ dealerRepresentative: r });
    console.log(`Rep: "${r}" -> ${locs} locations, ${apps} apps`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

test();
