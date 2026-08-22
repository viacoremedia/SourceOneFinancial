/**
 * Test PDF Scorecard Generation Engine
 * 
 * Runs end-to-end generation with live MongoDB data and verifies:
 * 1. ScorecardReport creation
 * 2. PDFKit drawing without errors
 * 3. File existence and size on disk
 * 4. Company Overview + Individual Rep PDFs creation
 */

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ScorecardReport = require('../models/ScorecardReport');
const { generateScorecardPDFs } = require('../services/pdfGenerator');

async function run() {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sourceone';
    console.log('Connecting to MongoDB at:', mongoUri.replace(/\/\/.*@/, '//***@'));
    await mongoose.connect(mongoUri);

    console.log('Creating test ScorecardReport record...');
    const testReport = new ScorecardReport({
        name: 'Test PDF Scorecard Run',
        config: {
            scorecard: { windowSize: 7, finPeriod: 'mtd', activityMode: 'application' },
            visitImpact: { reactivationWindow: 30, touchpointMode: 'visits', timeframe: 'ytd' },
            drd: { includeTlcList: true }
        },
        status: 'generating'
    });
    await testReport.save();
    console.log('Created report ID:', testReport._id);

    console.log('Generating PDFs...');
    const startTime = Date.now();
    const result = await generateScorecardPDFs(testReport._id, testReport.config);
    const durationMs = Date.now() - startTime;

    console.log(`\n Generation completed in ${(durationMs / 1000).toFixed(2)}s!`);
    console.log(`Generated ${result.fileManifest.length} PDF files:`);
    for (const file of result.fileManifest) {
        console.log(`  - [${file.type.toUpperCase()}] ${file.label} (${file.filename}) — ${(file.fileSizeBytes / 1024).toFixed(1)} KB, ${file.pageCount} pages`);
    }

    const updated = await ScorecardReport.findById(testReport._id).lean();
    console.log('\nReport Record in DB:');
    console.log('  Status:', updated.status);
    console.log('  Rep Count:', updated.repCount);
    console.log('  Summary Stats:', updated.summaryStats);

    // Verify all files actually exist and are non-empty
    const reportDir = path.join(__dirname, '../data/scorecard-reports', String(testReport._id));
    for (const f of updated.files) {
        const fullPath = path.join(reportDir, f.filename);
        if (!fs.existsSync(fullPath)) {
            throw new Error(`File missing on disk: ${fullPath}`);
        }
        const stat = fs.statSync(fullPath);
        if (stat.size < 1000) {
            throw new Error(`File seems corrupted or too small (${stat.size} bytes): ${fullPath}`);
        }
    }

    console.log('\n✅ ALL GENERATED PDF FILES VERIFIED ON DISK AND NON-EMPTY!');
    await mongoose.disconnect();
    process.exit(0);
}

run().catch(err => {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
});
