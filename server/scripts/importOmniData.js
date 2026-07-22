/**
 * Reusable OMNI Data Import Script
 * 
 * Imports Andrew's OMNI CSV tables (Dealer Information, Sales Communication, Main Application)
 * into MongoDB with automatic parser detection, ordered processing, validation, progress reporting,
 * and optional snapshot generation.
 * 
 * Usage:
 *   node server/scripts/importOmniData.js <data-directory> [options]
 * 
 * Examples:
 *   node server/scripts/importOmniData.js ./new_data
 *   node server/scripts/importOmniData.js ./new_data --table=applications
 *   node server/scripts/importOmniData.js ./new_data --dry-run
 *   node server/scripts/importOmniData.js ./new_data --skip-snapshots
 * 
 * Options:
 *   --table=<name>     Only process specific table: 'dealers'|'communications'|'applications'|'all'
 *   --dry-run          Parse and validate without database writes
 *   --skip-snapshots   Skip automatic snapshot generation after import
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { parseCSV, detectParser, getParser } = require('../services/csvParserService');
const { ingestDealerInfoCSV } = require('../services/dealerInfoIngestionService');
const { ingestCommunicationCSV } = require('../services/communicationIngestionService');
const { ingestApplicationCSV } = require('../services/applicationIngestionService');
const WebhookPayload = require('../models/WebhookPayload');

// Optional snapshot generator import (Phase 2)
let generateSnapshotsForRange = null;
try {
    const snapshotService = require('../services/snapshotGeneratorService');
    generateSnapshotsForRange = snapshotService.generateSnapshotsForRange;
} catch (e) {
    // Will be available after Phase 2 implementation
}

// Map command-line table filter to parser names
const TABLE_PARSER_MAP = {
    dealers: 'dealer_information',
    communications: 'dealer_communication',
    applications: 'main_application'
};

async function main() {
    const args = process.argv.slice(2);
    
    // Help / usage
    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log(`
OMNI Data Import Script
=======================
Usage: node server/scripts/importOmniData.js <dir> [options]

Arguments:
  <dir>              Path to directory containing CSV files (e.g. ./new_data)

Options:
  --table=<name>     Filter table: 'dealers', 'communications', 'applications', or 'all' (default: all)
  --dry-run          Parse and validate headers without writing to MongoDB
  --skip-snapshots   Skip automatic snapshot generation after import
`);
        process.exit(0);
    }

    // Parse options
    const targetDirArg = args.find(a => !a.startsWith('--'));
    if (!targetDirArg) {
        console.error('Error: No target directory specified.');
        process.exit(1);
    }

    const targetDir = path.resolve(process.cwd(), targetDirArg);
    const dryRun = args.includes('--dry-run');
    const skipSnapshots = args.includes('--skip-snapshots');
    
    const tableOpt = args.find(a => a.startsWith('--table='));
    const selectedTable = tableOpt ? tableOpt.split('=')[1].toLowerCase() : 'all';

    if (selectedTable !== 'all' && !TABLE_PARSER_MAP[selectedTable]) {
        console.error(`Invalid --table value "${selectedTable}". Allowed: dealers, communications, applications, all`);
        process.exit(1);
    }

    console.log(`\n==================================================`);
    console.log(` OMNI DATA IMPORT PIPELINE`);
    console.log(`==================================================`);
    console.log(` Target Directory : ${targetDir}`);
    console.log(` Mode             : ${dryRun ? 'DRY-RUN (Validation Only)' : 'LIVE IMPORT (Database Write)'}`);
    console.log(` Filter Table     : ${selectedTable}`);
    console.log(` Skip Snapshots   : ${skipSnapshots}`);
    console.log(`==================================================\n`);

    if (!fs.existsSync(targetDir)) {
        console.error(`Error: Directory does not exist: ${targetDir}`);
        process.exit(1);
    }

    // Scan for CSV files
    const files = fs.readdirSync(targetDir).filter(f => f.toLowerCase().endsWith('.csv'));
    if (files.length === 0) {
        console.error(`No CSV files found in ${targetDir}`);
        process.exit(1);
    }

    console.log(`Found ${files.length} CSV file(s) in directory. Categorizing...`);

    // Detect file types
    const categorized = {
        dealer_information: [],
        dealer_communication: [],
        main_application: [],
        unrecognized: []
    };

    for (const file of files) {
        const filePath = path.join(targetDir, file);
        try {
            // Read first 2KB to inspect header row
            const fd = fs.openSync(filePath, 'r');
            const buffer = Buffer.alloc(2048);
            const bytesRead = fs.readSync(fd, buffer, 0, 2048, 0);
            fs.closeSync(fd);

            const contentSnippet = buffer.toString('utf8', 0, bytesRead);
            const firstLine = contentSnippet.split('\n')[0].replace(/\r$/, '').trim();
            
            // Parse headers
            const headerParser = parseCSV(firstLine + '\nstub_row');
            const parserType = detectParser(headerParser.headers);

            if (parserType) {
                categorized[parserType].push({ file, filePath });
                console.log(`  ✓ [${parserType}] -> ${file}`);
            } else {
                categorized.unrecognized.push({ file, filePath, headers: headerParser.headers });
                console.log(`  ? [UNRECOGNIZED] -> ${file}`);
            }
        } catch (err) {
            console.error(`  ✗ Error reading header of ${file}: ${err.message}`);
        }
    }

    if (categorized.unrecognized.length > 0) {
        console.warn(`\nWarning: ${categorized.unrecognized.length} file(s) could not be matched to a registered parser.`);
    }

    // Connect to MongoDB if not dry run
    let payloadId = null;
    if (!dryRun) {
        if (!process.env.MONGODB_URI) {
            console.error('Error: MONGODB_URI is not set in environment or server/.env file.');
            process.exit(1);
        }

        console.log(`\nConnecting to MongoDB...`);
        await mongoose.connect(process.env.MONGODB_URI);
        console.log(`Connected to MongoDB database.`);

        // Create WebhookPayload record for tracking this manual import run
        const payload = await WebhookPayload.create({
            body: { source: 'manual_import_script', directory: targetDir, importedAt: new Date() },
            headers: { 'user-agent': 'importOmniData-script' },
            receivedAt: new Date()
        });
        payloadId = payload._id;
    }

    const overallStart = Date.now();
    const statsSummary = [];

    // Processing order: Dealers -> Communications -> Applications
    const executionOrder = [
        { type: 'dealer_information', label: '1. Dealer Information (Master List)', handler: ingestDealerInfoCSV },
        { type: 'dealer_communication', label: '2. Sales Communication (Visits/Contacts)', handler: ingestCommunicationCSV },
        { type: 'main_application', label: '3. Main Application (Loan Pipeline)', handler: ingestApplicationCSV }
    ];

    for (const step of executionOrder) {
        const parserType = step.type;
        const matchingFiles = categorized[parserType];

        // Check table filter
        if (selectedTable !== 'all' && TABLE_PARSER_MAP[selectedTable] !== parserType) {
            console.log(`\nSkipping ${step.label} (filtered out by --table=${selectedTable})`);
            continue;
        }

        if (matchingFiles.length === 0) {
            console.log(`\nNo files found for ${step.label}`);
            continue;
        }

        console.log(`\n--------------------------------------------------`);
        console.log(` PROCESSING: ${step.label}`);
        console.log(`--------------------------------------------------`);

        for (const item of matchingFiles) {
            console.log(`Reading CSV: ${item.file}...`);
            const fileStart = Date.now();
            const csvContent = fs.readFileSync(item.filePath, 'utf8');
            const readTimeMs = Date.now() - fileStart;
            console.log(`  Loaded ${ (csvContent.length / (1024 * 1024)).toFixed(2) } MB into memory in ${readTimeMs}ms`);

            if (dryRun) {
                const parserConfig = getParser(parserType);
                const { headers, rows } = parseCSV(csvContent, parserConfig.expectedHeaders);
                console.log(`  DRY-RUN VALIDATION SUCCESSFUL:`);
                console.log(`    Parsed ${rows.length.toLocaleString()} rows and ${headers.length} columns.`);
                statsSummary.push({ file: item.file, type: parserType, status: 'DRY-RUN OK', rows: rows.length });
            } else {
                console.log(`  Executing database ingestion for ${item.file}...`);
                const result = await step.handler(csvContent, payloadId, item.file);
                console.log(`  Result for ${item.file}:`);
                console.log(`    Rows Parsed  : ${result.rowCount.toLocaleString()}`);
                console.log(`    Processed    : ${result.recordsProcessed ? result.recordsProcessed.toLocaleString() : result.dealersProcessed.toLocaleString()}`);
                console.log(`    New/Upserted : ${(result.newRecords ?? result.newDealers ?? 0).toLocaleString()}`);
                console.log(`    Updated      : ${(result.updatedRecords ?? result.updatedDealers ?? 0).toLocaleString()}`);
                console.log(`    Duration     : ${(result.processingTimeMs / 1000).toFixed(2)}s`);
                
                statsSummary.push({
                    file: item.file,
                    type: parserType,
                    status: 'SUCCESS',
                    rows: result.rowCount,
                    durationSec: (result.processingTimeMs / 1000).toFixed(2)
                });
            }
        }
    }

    // Phase 2 Snapshot Generation Integration
    if (!dryRun && !skipSnapshots && generateSnapshotsForRange) {
        console.log(`\n--------------------------------------------------`);
        console.log(` TRIGGERING AUTOMATIC SNAPSHOT GENERATION`);
        console.log(`--------------------------------------------------`);
        try {
            await generateSnapshotsForRange({ fromDate: '2025-01-01' });
        } catch (err) {
            console.error(`Snapshot generation error: ${err.message}`);
        }
    }

    const totalSec = ((Date.now() - overallStart) / 1000).toFixed(2);

    console.log(`\n==================================================`);
    console.log(` IMPORT PIPELINE SUMMARY`);
    console.log(`==================================================`);
    console.log(` Total Execution Time: ${totalSec} seconds`);
    console.table(statsSummary);
    console.log(`==================================================\n`);

    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
    process.exit(0);
}

main().catch(err => {
    console.error(`\nFATAL IMPORT ERROR: ${err.stack || err.message}`);
    if (mongoose.connection.readyState !== 0) {
        mongoose.disconnect().finally(() => process.exit(1));
    } else {
        process.exit(1);
    }
});
