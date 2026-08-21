const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
const DealerProfile = require('../models/DealerProfile');

async function checkTx511() {
  await mongoose.connect(process.env.MONGODB_URI);
  const p = await DealerProfile.findOne({ clientDealerId: 'TX511' }).lean();
  console.log('TX511 PROFILE:');
  console.log('Dealer:', p.dealerName);
  console.log('Demand:', p.relationshipDemand);
  console.log('Urgency Status:', p.urgencyStatus);
  console.log('Days Since Last Visit:', p.daysSinceLastVisit);
  console.log('Flags:', p.flags);
  console.log('Decision Rationale:', p.decisionRationale);
  await mongoose.disconnect();
}
checkTx511().catch(e => { console.error(e); process.exit(1); });
