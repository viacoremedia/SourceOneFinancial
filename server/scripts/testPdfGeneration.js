/**
 * Test PDF Scorecard Generation & MongoDB Storage Engine
 * 
 * Runs end-to-end generation with live MongoDB data and verifies:
 * 1. ScorecardReport creation
 * 2. PDFKit in-memory buffer generation
 * 3. MongoDB ScorecardReportFile document insertion and binary PDF integrity (%PDF-1.x magic bytes)
 * 4. Scorecard storage stats and cleanup execution
 * 5. Clean teardown
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ScorecardReport = require('../models/ScorecardReport');
const ScorecardReportFile = require('../models/ScorecardReportFile');
const { generateScorecardPDFs } = require('../services/pdfGenerator');
const { getStorageUsage, cleanupScorecardStorage } = require('../services/scorecardStorageService');

async function run() {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sourceone';
    console.log('Connecting to MongoDB at:', mongoUri.replace(/\/\/.*@/, '//***@'));
    await mongoose.connect(mongoUri);

    console.log('\n--- 1. Testing Storage Usage Before Run ---');
    const initialStorage = await getStorageUsage();
    console.log(`Current Scorecard Storage: ${initialStorage.totalMb} MB (${initialStorage.reportCount} reports, ${initialStorage.fileCount} files)`);

    console.log('\n--- 2. Creating Test ScorecardReport Record ---');
    const testReport = new ScorecardReport({
        name: 'Test PDF Scorecard Run (MongoDB Storage)',
        config: {
            scorecard: { windowSize: 7, finPeriod: 'mtd', activityMode: 'application' },
            visitImpact: { reactivationWindow: 30, touchpointMode: 'visits', timeframe: 'ytd' },
            drd: { includeTlcList: true }
        },
        status: 'generating'
    });
    await testReport.save();
    console.log('Created report ID:', testReport._id);

    console.log('\n--- 3. Generating PDFs Directly to MongoDB Buffers ---');
    const startTime = Date.now();
    const result = await generateScorecardPDFs(testReport._id, testReport.config);
    const durationMs = Date.now() - startTime;

    console.log(`\n Generation completed in ${(durationMs / 1000).toFixed(2)}s!`);
    console.log(`Generated ${result.fileManifest.length} PDF files:`);
    for (const file of result.fileManifest) {
        console.log(`  - [${file.type.toUpperCase()}] ${file.label} (${file.filename}) — ${(file.fileSizeBytes / 1024).toFixed(1)} KB, ${file.pageCount} pages`);
    }

    console.log('\n--- 4. Verifying Report Document in MongoDB ---');
    const updated = await ScorecardReport.findById(testReport._id).lean();
    console.log('  Status:', updated.status);
    console.log('  Rep Count:', updated.repCount);
    console.log('  Summary Stats:', updated.summaryStats);

    if (updated.status !== 'ready') {
        throw new Error(`Report status should be 'ready', but got '${updated.status}'`);
    }

    console.log('\n--- 5. Verifying Binary PDF Documents in ScorecardReportFile Collection ---');
    const storedFiles = await ScorecardReportFile.find({ reportId: testReport._id }).lean();
    console.log(`Found ${storedFiles.length} stored files in MongoDB for report ${testReport._id}:`);

    if (storedFiles.length !== result.fileManifest.length) {
        throw new Error(`Expected ${result.fileManifest.length} files in MongoDB, found ${storedFiles.length}`);
    }

    for (const f of storedFiles) {
        if (!f.pdfData) {
            throw new Error(`File ${f.filename} is missing binary Buffer in pdfData`);
        }
        const buf = Buffer.isBuffer(f.pdfData) ? f.pdfData : Buffer.from(f.pdfData.buffer || f.pdfData);
        if (buf.length < 1000) {
            throw new Error(`File ${f.filename} seems too small (${buf.length} bytes)`);
        }
        // Verify standard PDF header magic bytes: %PDF-1.
        const header = buf.toString('utf-8', 0, 8);
        if (!header.startsWith('%PDF-1.')) {
            throw new Error(`File ${f.filename} header is not a valid PDF: ${header}`);
        }
        console.log(`  ✓ ${f.filename}: ${(buf.length / 1024).toFixed(1)} KB (Valid ${header.trim()})`);
    }

    console.log('\n--- 6. Testing Storage Usage & Retention Service ---');
    const afterStorage = await getStorageUsage();
    console.log(`Scorecard Storage After Run: ${afterStorage.totalMb} MB (${afterStorage.reportCount} reports, ${afterStorage.fileCount} files)`);

    const cleanupResult = await cleanupScorecardStorage({ maxAgeDays: 30, maxStorageBytes: 200 * 1024 * 1024 });
    console.log('Cleanup Result:', cleanupResult);

    console.log('\n--- 7. Cleaning Up Test Report ---');
    await ScorecardReport.findByIdAndDelete(testReport._id);
    const delFiles = await ScorecardReportFile.deleteMany({ reportId: testReport._id });
    console.log(`Deleted test report and ${delFiles.deletedCount} PDF files from MongoDB.`);

    console.log('\n✅ ALL GENERATED PDF FILES STORED IN MONGODB, RETRIEVED, AND VALIDATED AS VALID PDFS!');
    await mongoose.disconnect();
    process.exit(0);
}

run().catch(err => {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
});
