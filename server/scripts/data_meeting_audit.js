const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Application = require('../models/Application');
const DealerLocation = require('../models/DealerLocation');
const DealerCommunication = require('../models/DealerCommunication');
const DealerGroup = require('../models/DealerGroup');

async function runAudit() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('=== DATA AUDIT FOR CLIENT MEETING ===\n');

  // 1. Rep Roster Audit across all 3 collections
  const appReps = await Application.distinct('dealerRepresentative');
  const locReps = await DealerLocation.distinct('dealerRepresentative');
  const commUsers = await DealerCommunication.distinct('communicationUserFullName');
  const commEmails = await DealerCommunication.distinct('communicationUserEmail');

  console.log('--- 1. SALES REPRESENTATIVE VARIATIONS ---');
  console.log('Application reps:', appReps);
  console.log('Location reps:', locReps);
  console.log('Communication users:', commUsers);
  console.log('Communication emails:', commEmails);

  // 2. Application Status & Lenders / In-House Deals
  console.log('\n--- 2. APPLICATION STATUS & LENDERS ---');
  const appStatuses = await Application.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);
  console.log('Application Statuses:', appStatuses);

  const lenders = await Application.aggregate([
    { $group: { _id: '$lender', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 20 }
  ]);
  console.log('Top Lenders:', lenders);

  // Check In-House deals: How are they classified now vs. lender names?
  const inHouseCount = await Application.countDocuments({
    $or: [
      { lender: /in-house|source\s*one|s1house/i },
      { dealerRepresentative: /house|s1house/i }
    ]
  });
  console.log('Potential In-House Deals Count:', inHouseCount);

  // 3. Communication Types, Results & Nulls
  console.log('\n--- 3. DEALER COMMUNICATION ANALYSIS ---');
  const totalComms = await DealerCommunication.countDocuments();
  const nullTypeComms = await DealerCommunication.countDocuments({ communicationType: null });
  const nullResultComms = await DealerCommunication.countDocuments({ communicationResult1: null });
  const nullFeedbackComms = await DealerCommunication.countDocuments({ communicationFeedback1: null });

  console.log(`Total Comms: ${totalComms}`);
  console.log(`Null Comm Type: ${nullTypeComms} (${((nullTypeComms/totalComms)*100).toFixed(1)}%)`);
  console.log(`Null Comm Result: ${nullResultComms} (${((nullResultComms/totalComms)*100).toFixed(1)}%)`);
  console.log(`Null Comm Feedback: ${nullFeedbackComms} (${((nullFeedbackComms/totalComms)*100).toFixed(1)}%)`);

  const commTypes = await DealerCommunication.aggregate([
    { $group: { _id: '$communicationType', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);
  console.log('Communication Types:', commTypes);

  const commResults = await DealerCommunication.aggregate([
    { $group: { _id: '$communicationResult1', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 15 }
  ]);
  console.log('Top Communication Results:', commResults);

  // 4. Dealer Location & Group Mapping Gaps
  console.log('\n--- 4. DEALER LOCATION & GROUP GAPS ---');
  const totalLocations = await DealerLocation.countDocuments();
  const nullGroupLocs = await DealerLocation.countDocuments({ dealerGroup: null });
  const nullRepLocs = await DealerLocation.countDocuments({ dealerRepresentative: null });
  const nullStateLocs = await DealerLocation.countDocuments({ statePrefix: null });

  console.log(`Total Dealer Locations: ${totalLocations}`);
  console.log(`Independent (No Group): ${nullGroupLocs} (${((nullGroupLocs/totalLocations)*100).toFixed(1)}%)`);
  console.log(`No Rep Assigned: ${nullRepLocs} (${((nullRepLocs/totalLocations)*100).toFixed(1)}%)`);
  console.log(`No State Prefix: ${nullStateLocs} (${((nullStateLocs/totalLocations)*100).toFixed(1)}%)`);

  await mongoose.disconnect();
}

runAudit();
