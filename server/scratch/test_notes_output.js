const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
const DealerProfile = require('../models/DealerProfile');

async function testNotesRationale() {
  await mongoose.connect(process.env.MONGODB_URI);
  for (const id of ['OH164', 'FL301', 'GA149', 'WI733', 'OH128', 'IN219', 'KY147']) {
    const p = await DealerProfile.findOne({ clientDealerId: id }).lean();
    if (!p) continue;
    console.log(`[${id}] ${p.dealerName} (${p.relationshipDemand.toUpperCase()})`);
    p.decisionRationale.forEach(r => console.log(`  - ${r}`));
    console.log();
  }
  await mongoose.disconnect();
}
testNotesRationale().catch(e => { console.error(e); process.exit(1); });
