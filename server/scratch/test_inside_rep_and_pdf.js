require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const User = require('../models/User');
const DealerProfile = require('../models/DealerProfile');
const { resolveRepName, getRepHandles, getActiveRepNames } = require('../config/repConfig');
const { computeRepScorecard } = require('../services/rollingAverages');
const { computeVisitImpactV2 } = require('../services/communicationImpactService');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('--- TEST 1: Rep Name Resolution ---');
  console.log('Janet Harrington =>', resolveRepName('Janet Harrington'));
  console.log('Jeff Weller =>', resolveRepName('Jeff Weller'));
  console.log('Joe Weller =>', resolveRepName('Joe Weller'));
  console.log('jharrington1 =>', resolveRepName('jharrington1'));
  console.log('jweller =>', resolveRepName('jweller'));

  console.log('\n--- TEST 2: Active Rep Names for UI ---');
  console.log(getActiveRepNames());

  console.log('\n--- TEST 3: Scorecard Data & DRD Join ---');
  const rolling = await computeRepScorecard(7, null, 'booking');
  const drdProfiles = await DealerProfile.find({ assignedRep: { $ne: null } }).lean();

  const drdRepMap = new Map();
  for (const p of drdProfiles) {
    const rep = resolveRepName(p.assignedRep);
    if (!rep) continue;
    const key = rep.toLowerCase();
    if (!drdRepMap.has(key)) {
      drdRepMap.set(key, { total: 0, highTlc: 0, selfSuff: 0, comfort: 0, insuff: 0 });
    }
    const drd = drdRepMap.get(key);
    drd.total++;
    if (p.relationshipDemand === 'high_tlc') drd.highTlc++;
    else if (p.relationshipDemand === 'self_sufficient') drd.selfSuff++;
    else if (p.relationshipDemand === 'comfort_stop') drd.comfort++;
    else drd.insuff++;
  }

  console.log('\n--- Rep Scorecard + DRD Combined Totals ---');
  for (const r of rolling.reps) {
    const displayName = resolveRepName(r.rep) || r.rep;
    const drd = drdRepMap.get(displayName.toLowerCase()) || { total: 0 };
    console.log(`Rep: ${displayName.padEnd(20)} | Deals: ${String(r.totalDealers).padStart(4)} | DRD Total: ${String(drd.total).padStart(4)} | HighTLC: ${String(drd.highTlc || 0).padStart(3)} | Inactive90: ${r.inactive90Count || 0}`);
  }

  console.log('\n--- TEST 4: User Model with inside_rep & assignedRep ---');
  const testUser = new User({
    email: 'test_inside_rep_verify@example.com',
    role: 'inside_rep',
    assignedRep: 'Dan Zilberchtein',
    status: 'active'
  });
  const valErr = testUser.validateSync();
  console.log('User validation error:', valErr ? valErr.message : 'NONE (VALID)');

  await mongoose.disconnect();
  console.log('\nAll tests completed.');
})();
