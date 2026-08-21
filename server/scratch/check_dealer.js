const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const Application = require('../models/Application');
const DealerCommunication = require('../models/DealerCommunication');
const { classifyCommType } = require('../services/dealerRelationshipEngine');

async function checkDealer(dealerId) {
  await mongoose.connect(process.env.MONGODB_URI);
  const apps = await Application.find({ clientDealerId: dealerId }).sort({ applicationDate: 1 }).lean();
  const comms = await DealerCommunication.find({ internalRelationshipId2: dealerId }).sort({ communicationEventDatetime: 1 }).lean();
  
  console.log(`=== ${dealerId} VISITS (${comms.length} comms) ===`);
  const visits = comms.filter(c => classifyCommType(c) === 'visit');
  visits.forEach(v => console.log(v.communicationEventDatetime?.toISOString().split('T')[0], v.communicationType, v.communicationResult1));

  console.log(`\n=== ${dealerId} APPS & BOOKINGS (${apps.length} apps) ===`);
  apps.slice(0, 30).forEach(a => console.log(a.applicationDate?.toISOString().split('T')[0], a.status, a.amountFinanced));

  await mongoose.disconnect();
}

checkDealer(process.argv[2] || 'FL319').catch(console.error);
