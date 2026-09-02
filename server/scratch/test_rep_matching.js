require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { REPS, getActiveRepNames, resolveRepName } = require('../config/repConfig');
const DealerProfile = require('../models/DealerProfile');

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getRepSearchTerms(input) {
  const name = resolveRepName(input) || input.trim();
  const config = REPS[name];
  const terms = new Set([name, input.trim()]);
  if (config) {
    if (config.handles) config.handles.forEach(h => terms.add(h));
    if (config.legacyNames) config.legacyNames.forEach(l => terms.add(l));
  }
  return Array.from(terms);
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, { bufferCommands: false });
  const activeNames = getActiveRepNames();
  console.log('=== TEST ALL ACTIVE REPS WITH getRepSearchTerms ===');
  for (const repName of activeNames) {
    const terms = getRepSearchTerms(repName);
    const regexes = terms.map(t => new RegExp('^' + escapeRegex(t) + '$', 'i'));
    const count = await DealerProfile.countDocuments({ assignedRep: { $in: regexes } });
    const highTlc = await DealerProfile.countDocuments({ assignedRep: { $in: regexes }, relationshipDemand: 'high_tlc' });
    const selfSuff = await DealerProfile.countDocuments({ assignedRep: { $in: regexes }, relationshipDemand: 'self_sufficient' });
    const comfort = await DealerProfile.countDocuments({ assignedRep: { $in: regexes }, relationshipDemand: 'comfort_stop' });
    const lapsed = await DealerProfile.countDocuments({ assignedRep: { $in: regexes }, relationshipDemand: 'lapsed' });
    const disc = await DealerProfile.countDocuments({ assignedRep: { $in: regexes }, relationshipDemand: 'insufficient_data' });
    console.log(`${repName}: Total=${count}, HighTLC=${highTlc}, SelfSuff=${selfSuff}, Comfort=${comfort}, Lapsed=${lapsed}, Discovery=${disc}`);
  }
  await mongoose.disconnect();
}

run().catch(console.error);
