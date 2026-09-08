const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DealerLocation = require('../models/DealerLocation');
const DealerProfile = require('../models/DealerProfile');
const { resolveRepName } = require('../config/repConfig');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const loc = await DealerLocation.findOne({ dealerId: 'AZ308' }).lean();
  const prof = await DealerProfile.findOne({ clientDealerId: 'AZ308' }).lean();

  console.log('--- AZ308 In DB ---');
  console.log('DealerLocation:', {
    dealerId: loc?.dealerId,
    dealerName: loc?.dealerName,
    state: loc?.dealerState || loc?.statePrefix,
    dealerRepresentative: loc?.dealerRepresentative,
    resolvedRep: resolveRepName(loc?.dealerRepresentative)
  });
  console.log('DealerProfile:', {
    clientDealerId: prof?.clientDealerId,
    dealerName: prof?.dealerName,
    assignedRep: prof?.assignedRep,
    resolvedRep: resolveRepName(prof?.assignedRep)
  });

  await mongoose.disconnect();
}

check().catch(console.error);
