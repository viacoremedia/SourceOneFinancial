const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
const DealerLocation = require('../models/DealerLocation');
const Application = require('../models/Application');
const DealerCommunication = require('../models/DealerCommunication');
const { evaluateDealerProfile } = require('../services/dealerRelationshipEngine');

async function testTX246() {
  await mongoose.connect(process.env.MONGODB_URI);
  const loc = await DealerLocation.findOne({ clientDealerId: 'TX246' }).lean();
  const apps = await Application.find({ clientDealerId: 'TX246', applicationDate: { $ne: null } }).lean();
  const comms = await DealerCommunication.find({ internalRelationshipId2: 'TX246', communicationEventDatetime: { $ne: null } }).lean();

  const prof = evaluateDealerProfile(loc, apps, comms);

  console.log('=== TX246 (Ron Hoover Co of Boerne) EVALUATION ===');
  console.log('Dealer Name:', prof.dealerName);
  console.log('Assigned Rep:', prof.assignedRep);
  console.log('Demand Bucket:', prof.relationshipDemand.toUpperCase());
  console.log('Pattern Type:', prof.patternType);
  console.log('Total Visits:', prof.lifetimeStats.totalVisits);
  console.log('Total Apps:', prof.lifetimeStats.totalApplications);
  console.log('Total Bookings:', prof.lifetimeStats.totalBookings, '($' + (prof.lifetimeStats.totalBookedVolume/1000).toFixed(0) + 'K)');
  console.log('Approval Rate:', prof.pipelineStats.approvalRatePct + '%');
  console.log('Look-To-Book:', prof.pipelineStats.lookToBookPct + '%');
  console.log('Urgency Status:', prof.urgencyStatus);
  console.log('\nDecision Rationale:');
  prof.decisionRationale.forEach(r => console.log('  -', r));

  await mongoose.disconnect();
}
testTX246().catch(e => { console.error(e); process.exit(1); });
