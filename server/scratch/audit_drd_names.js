require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const DealerProfile = require('../models/DealerProfile');
const { resolveRepName } = require('../config/repConfig');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected');

  // Get distinct assignedRep values
  const reps = await DealerProfile.distinct('assignedRep');
  console.log('=== Distinct assignedRep values in DealerProfile ===');
  for (const r of reps.sort()) {
    const c = await DealerProfile.countDocuments({ assignedRep: r });
    const resolved = resolveRepName(r);
    console.log(`  "${r}" => "${resolved}" (${c} dealers)`);
  }

  // Check specifically for John Harrington / Janet Weller
  console.log('\n=== Name resolution test ===');
  for (const h of ['jharrington1', 'jharrington', 'janet', 'johnh', 'jweller', 'jeff', 'joe']) {
    console.log(`  resolveRepName("${h}") => "${resolveRepName(h)}"`);
  }

  // Check what the PDF DRD map would look like
  console.log('\n=== DRD Map Keys (what pdfGenerator sees) ===');
  const drdRepMap = new Map();
  const profiles = await DealerProfile.find({ assignedRep: { $ne: null } }).select('assignedRep relationshipDemand').lean();
  for (const p of profiles) {
    const rep = resolveRepName(p.assignedRep);
    if (!rep) continue;
    const key = rep.toLowerCase();
    if (!drdRepMap.has(key)) drdRepMap.set(key, { count: 0, highTlc: 0, selfSuff: 0, comfort: 0, insuff: 0 });
    const d = drdRepMap.get(key);
    d.count++;
    if (p.relationshipDemand === 'high_tlc') d.highTlc++;
    else if (p.relationshipDemand === 'self_sufficient') d.selfSuff++;
    else if (p.relationshipDemand === 'comfort_stop') d.comfort++;
    else d.insuff++;
  }
  for (const [k, v] of [...drdRepMap.entries()].sort()) {
    console.log(`  "${k}": ${JSON.stringify(v)}`);
  }

  await mongoose.disconnect();
})();
