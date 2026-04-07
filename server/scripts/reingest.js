/**
 * Local re-ingestion script — connects directly to production MongoDB
 * and re-processes stuck/wrong-date payloads using the current inferReportDate logic (max date).
 * 
 * Usage: node scripts/reingest.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const WebhookPayload = require('../models/WebhookPayload');
const FileIngestionLog = require('../models/FileIngestionLog');
const { detectParser } = require('../services/csvParserService');
const { ingestDealerMetricsCSV } = require('../services/dealerMetricsIngestionService');

const PAYLOAD_IDS = [
  '69d4ee009b1496f84a19f656', // Apr 7 — stuck in processing
  '69d39cf6a853a57b019e61e9', // Apr 6 — reportDate wrong (shows Apr 4, should be Apr 5)
  '69d24ba5a37f55ea096be9c7', // Apr 5 — reportDate same as Apr 6 (Apr 4), needs recalc
  '69ca72c6256c1aea0a646903', // Mar 30 — reportDate Mar 28, should be Mar 29
];

async function reingestPayload(payloadId) {
  console.log(`\n🔄 Re-ingesting payload ${payloadId}...`);

  const payload = await WebhookPayload.findById(payloadId).lean();
  if (!payload) {
    console.log(`   ❌ Payload not found`);
    return;
  }

  // Clear any stuck/failed ingestion log for this payload
  const deleted = await FileIngestionLog.deleteMany({ sourcePayload: payload._id });
  console.log(`   Cleared ${deleted.deletedCount} old ingestion log(s)`);

  for (const file of (payload.files || [])) {
    const isCSV = file.originalName.endsWith('.csv') ||
      (file.mimeType && file.mimeType.includes('csv'));
    if (!isCSV) continue;

    try {
      const firstLine = file.content.split('\n')[0];
      const headers = firstLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      const parserName = detectParser(headers);

      if (!parserName) {
        console.log(`   ⚠️  Skipped ${file.originalName} — unknown format`);
        continue;
      }

      console.log(`   📊 Processing ${file.originalName} (${parserName} format)...`);
      const result = await ingestDealerMetricsCSV(
        file.content,
        payload._id,
        file.originalName
      );

      console.log(`   ✅ Done — reportDate: ${result.reportDate.toISOString().slice(0, 10)}, dealers: ${result.dealersProcessed}, time: ${result.processingTimeMs}ms`);
    } catch (err) {
      console.error(`   ❌ FAILED: ${err.message}`);
    }
  }
}

async function main() {
  console.log('=== Source One Local Re-Ingestion ===');
  console.log(`MongoDB: ${process.env.MONGODB_URI ? '✅ configured' : '❌ missing'}`);

  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 300000,
  });
  console.log('✅ Connected to MongoDB\n');

  for (const id of PAYLOAD_IDS) {
    await reingestPayload(id);
  }

  // Print final state
  console.log('\n\n=== Final Ingestion Log ===');
  const logs = await FileIngestionLog.find({}).sort({ createdAt: -1 }).limit(20).lean();
  for (const log of logs) {
    const date = log.reportDate ? log.reportDate.toISOString().slice(0, 10) : 'null';
    const status = log.status.padEnd(10);
    console.log(`  ${log.sourcePayload} | ${status} | reportDate: ${date} | dealers: ${log.dealersProcessed} | ${log.fileName}`);
  }

  await mongoose.disconnect();
  console.log('\n✅ Done — disconnected from MongoDB');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
