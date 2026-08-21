const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
const DealerCommunication = require('../models/DealerCommunication');
const Application = require('../models/Application');

async function auditCrmDataReality() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB. Auditing CRM Notes and Monthly Seasonality...\n');

  const START_2025 = new Date('2025-01-01T00:00:00.000Z');

  // 1. Audit Monthly Application Seasonality (2025-2026)
  const apps = await Application.find({ applicationDate: { $gte: START_2025 } })
    .select('applicationDate status amountFinanced')
    .lean();

  const appsByMonth = {};
  for (const a of apps) {
    const d = new Date(a.applicationDate);
    const m = d.getMonth() + 1; // 1-12
    appsByMonth[m] = (appsByMonth[m] || 0) + 1;
  }

  console.log('=== APPLICATION VOLUME BY MONTH (2025-2026) ===');
  const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  for (let m = 1; m <= 12; m++) {
    const count = appsByMonth[m] || 0;
    const bar = '█'.repeat(Math.round(count / 500));
    console.log(`${monthNames[m].padEnd(4)}: ${count.toString().padStart(6)} apps | ${bar}`);
  }

  // 2. Audit Communication Text Fields
  const commsWithFeedback = await DealerCommunication.find({
    communicationEventDatetime: { $gte: START_2025 },
    $or: [
      { communicationFeedback1: { $exists: true, $ne: '', $ne: null } },
      { communicationResult1: { $exists: true, $ne: '', $ne: null } }
    ]
  })
    .select('internalRelationshipId2 communicationEventDatetime communicationUserFullName communicationType communicationFeedback1 communicationResult1')
    .lean();

  console.log(`\n=== CRM NOTES AUDIT ===`);
  console.log(`Total 2025+ Communications with Notes: ${commsWithFeedback.length}`);

  // Test keyword matches
  const turnoverKeywords = [
    'new f&i', 'new finance', 'new manager', 'turnover', 'left', 'no longer with', 'replaced', 'new contact', 'new gm', 'new general manager'
  ];

  const competitorKeywords = [
    'competitor', 'ally', 'huntington', 'medallion', 'us bank', 'credit union', 'rate match', 'buying deeper', 'rate sheet', 'rates are high', 'cheaper rate'
  ];

  const matchedTurnover = [];
  const matchedCompetitors = [];

  for (const c of commsWithFeedback) {
    const text = `${c.communicationFeedback1 || ''} ${c.communicationResult1 || ''}`.toLowerCase();
    
    for (const kw of turnoverKeywords) {
      if (text.includes(kw)) {
        matchedTurnover.push({
          id: c.internalRelationshipId2,
          rep: c.communicationUserFullName,
          date: c.communicationEventDatetime?.toISOString().slice(0, 10),
          keyword: kw,
          text: (c.communicationFeedback1 || c.communicationResult1 || '').slice(0, 80)
        });
        break;
      }
    }

    for (const kw of competitorKeywords) {
      if (text.includes(kw)) {
        matchedCompetitors.push({
          id: c.internalRelationshipId2,
          rep: c.communicationUserFullName,
          date: c.communicationEventDatetime?.toISOString().slice(0, 10),
          keyword: kw,
          text: (c.communicationFeedback1 || c.communicationResult1 || '').slice(0, 80)
        });
        break;
      }
    }
  }

  console.log(`\nVerified High-Signal Matches:`);
  console.log(`- Personnel / F&I Turnover Matches: ${matchedTurnover.length}`);
  console.log(`- Competitor / Rate Friction Matches: ${matchedCompetitors.length}`);

  console.log('\n--- SAMPLE 8 PERSONNEL / TURNOVER NOTES ---');
  console.table(matchedTurnover.slice(0, 8));

  console.log('\n--- SAMPLE 8 COMPETITOR / RATE NOTES ---');
  console.table(matchedCompetitors.slice(0, 8));

  await mongoose.disconnect();
}
auditCrmDataReality().catch(e => { console.error(e); process.exit(1); });
