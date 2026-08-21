const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
const Application = require('../models/Application');
const DealerLocation = require('../models/DealerLocation');
const DealerCommunication = require('../models/DealerCommunication');
const { evaluateDealerProfile } = require('../services/dealerRelationshipEngine');

async function checkCO104() {
  await mongoose.connect(process.env.MONGODB_URI);
  const loc = await DealerLocation.findOne({ clientDealerId: 'CO104' }).lean();
  const apps = await Application.find({ clientDealerId: 'CO104', applicationDate: { $ne: null } }).lean();
  const comms = await DealerCommunication.find({ internalRelationshipId2: 'CO104', communicationEventDatetime: { $ne: null } }).lean();

  const prof = evaluateDealerProfile(loc, apps, comms);

  console.log('=== CO104 (Pikes Peak Traveland) ===');
  console.log('Total Apps:', prof.lifetimeStats.totalApplications);
  console.log('Total Bookings:', prof.lifetimeStats.totalBookings, '($' + (prof.lifetimeStats.totalBookedVolume/1000).toFixed(0) + 'K)');
  console.log('Days Since Last Visit:', prof.daysSinceLastVisit);
  console.log('Latest App Date in raw data:', apps.sort((a,b) => new Date(b.applicationDate) - new Date(a.applicationDate))[0]?.applicationDate);
  console.log('Latest Booked Date in raw data:', apps.filter(a => a.bookedDate).sort((a,b) => new Date(b.bookedDate) - new Date(a.bookedDate))[0]?.bookedDate);
  console.log('Current Demand:', prof.relationshipDemand);
  console.log('Current Urgency:', prof.urgencyStatus);
  console.log('Rationale:');
  prof.decisionRationale.forEach(r => console.log('  -', r));

  await mongoose.disconnect();
}
checkCO104().catch(e => { console.error(e); process.exit(1); });
