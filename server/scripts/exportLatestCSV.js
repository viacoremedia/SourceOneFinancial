/**
 * Export the most recent webhook payload CSV to a local file for validation.
 * Usage: node scripts/exportLatestCSV.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const WebhookPayload = require('../models/WebhookPayload');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  console.log('✅ Connected to MongoDB');

  const latest = await WebhookPayload.findOne({}).sort({ receivedAt: -1 }).lean();
  if (!latest) { console.log('No payloads found'); process.exit(1); }

  console.log(`Latest payload: ${latest._id}`);
  console.log(`Received at: ${latest.receivedAt}`);
  console.log(`Files: ${(latest.files || []).length}`);

  const csvFile = (latest.files || []).find(f =>
    f.originalName.endsWith('.csv') || (f.mimeType && f.mimeType.includes('csv'))
  );

  if (!csvFile || !csvFile.content) {
    console.log('No CSV file found in latest payload');
    process.exit(1);
  }

  const outPath = path.join(__dirname, '..', 'data', `latest_report_${latest.receivedAt.toISOString().slice(0, 10)}.csv`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, csvFile.content, 'utf8');

  const lineCount = csvFile.content.split('\n').length;
  console.log(`\n✅ Exported ${lineCount} lines to:\n   ${outPath}`);

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
