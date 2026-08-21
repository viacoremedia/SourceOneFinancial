const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
const DealerLocation = require('../models/DealerLocation');
const Application = require('../models/Application');
const DealerCommunication = require('../models/DealerCommunication');

async function testSmartFlags() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB. Testing Precision CRM Flags & Seasonal Windows...\n');

  const START_2025 = new Date('2025-01-01T00:00:00.000Z');
  const now = new Date('2026-08-21T00:00:00.000Z');
  const d120Ago = new Date(now.getTime() - (120 * 24 * 60 * 60 * 1000));

  const comms = await DealerCommunication.find({
    communicationEventDatetime: { $gte: START_2025 }
  })
    .select('internalRelationshipId2 communicationEventDatetime communicationUserFullName communicationType communicationFeedback1 communicationResult1')
    .lean();

  const competitorMatches = new Map();
  const turnoverMatches = new Map();

  for (const c of comms) {
    if (!c.internalRelationshipId2) continue;
    const id = c.internalRelationshipId2.trim().toUpperCase();
    const res = (c.communicationResult1 || '').toLowerCase();
    const feed = (c.communicationFeedback1 || '').toLowerCase();
    const text = `${res} ${feed}`;
    const dt = new Date(c.communicationEventDatetime);

    // 1. Strict Competitor Check (Must be within last 120 days or explicit result)
    if (res.includes('lost to competitor') || feed.includes('lost to competitor') || feed.includes('competitor rate') || feed.includes('cheaper rate') || feed.includes('ally') || feed.includes('huntington') || feed.includes('us bank')) {
      if (!competitorMatches.has(id) || dt > competitorMatches.get(id).date) {
        competitorMatches.set(id, {
          date: dt,
          rep: c.communicationUserFullName,
          note: c.communicationFeedback1 || c.communicationResult1
        });
      }
    }

    // 2. Strict Personnel Turnover Check (Avoid generic 'new contact' dropdown!)
    if (feed.includes('new f&i') || feed.includes('new finance') || feed.includes('new manager') || feed.includes('manager left') || feed.includes('f&i left') || feed.includes('turnover') || feed.includes('new director')) {
      if (!turnoverMatches.has(id) || dt > turnoverMatches.get(id).date) {
        turnoverMatches.set(id, {
          date: dt,
          rep: c.communicationUserFullName,
          note: c.communicationFeedback1 || c.communicationResult1
        });
      }
    }
  }

  console.log(`=== PRECISION HIGH-SIGNAL CRM FLAGS FOUND ===`);
  console.log(`Verified Competitor Friction Accounts : ${competitorMatches.size} accounts`);
  console.log(`Verified Personnel / F&I Turnover     : ${turnoverMatches.size} accounts`);

  console.log('\n--- SAMPLE 5 COMPETITOR FLAGS ---');
  let i = 0;
  for (const [id, data] of competitorMatches.entries()) {
    if (i++ >= 5) break;
    console.log(`[${id}] Date: ${data.date.toISOString().slice(0, 10)} | Rep: ${data.rep} | Note: "${data.note}"`);
  }

  console.log('\n--- SAMPLE 5 TURNOVER FLAGS ---');
  i = 0;
  for (const [id, data] of turnoverMatches.entries()) {
    if (i++ >= 5) break;
    console.log(`[${id}] Date: ${data.date.toISOString().slice(0, 10)} | Rep: ${data.rep} | Note: "${data.note}"`);
  }

  await mongoose.disconnect();
}
testSmartFlags().catch(e => { console.error(e); process.exit(1); });
