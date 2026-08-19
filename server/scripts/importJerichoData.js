/**
 * Jericho Historical Call Report Importer
 * 
 * Reads Andrew's Jericho "Call Report" XLSX file and ingests historical
 * dealer visit/call records into DealerCommunication documents.
 * 
 * The Jericho data uses the SAME dealer naming convention as OMNI/Badger:
 *   "DealerName -ClientDealerId - NumericOMNIId"
 *   e.g. "Fun Town RV - Cleburne -TX108 - 282466"
 * 
 * Extraction is deterministic (regex-based), NOT fuzzy matching.
 * 92.4% of rows have extractable clientDealerIds that validate against
 * the DealerLocation collection. The remaining 7.6% are ingested with
 * recipientOrganizationName only (no internalRelationshipId2).
 * 
 * Usage:
 *   node server/scripts/importJerichoData.js <xlsx-file> [options]
 * 
 * Examples:
 *   node server/scripts/importJerichoData.js ./new_data/Call\ Report\ _08-19-2026.xlsx --dry-run
 *   node server/scripts/importJerichoData.js ./new_data/Call\ Report\ _08-19-2026.xlsx
 *   node server/scripts/importJerichoData.js ./new_data/Call\ Report\ _08-19-2026.xlsx --skip-snapshots
 * 
 * Options:
 *   --dry-run          Parse and show match report without writing to MongoDB
 *   --skip-snapshots   Skip automatic snapshot regeneration after import
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const mongoose = require('mongoose');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DealerCommunication = require('../models/DealerCommunication');
const DealerLocation = require('../models/DealerLocation');
const WebhookPayload = require('../models/WebhookPayload');

// ─── Regex Patterns ─────────────────────────────────────────────────────────
// Loose pattern: handles mixed case (Tx277), spaces (TN 123), etc.
const CLIENT_DEALER_ID_PATTERN = /[-\s]([A-Za-z]{1,3})\s*(\d{3,5})\b/;
// Numeric OMNI dealer ID at end of name
const OMNI_NUMERIC_ID_PATTERN = /[-\s](\d{5,7})\s*$/;

// ─── Call Type Mapping ───────────────────────────────────────────────────────
// Map Jericho call types to standardized communication types
const CALL_TYPE_MAP = {
    'face to face': 'Visit',
    'phone': 'Phone',
    'e-mail': 'Email',
    'text': 'Text',
    'other': 'Other',
    'no production': 'Other',
    'fu on dealer package': 'Other'
};

/**
 * Extract clientDealerId from a Jericho dealer name string.
 * 
 * Examples:
 *   "Fun Town RV - Cleburne -TX108 - 282466"  → "TX108"
 *   "Ron Hoover Companies of Donna  Inc -Tx277 - 282623" → "TX277"
 *   "A and L RV Sales - Johnson City - TN 123 - 309599" → "TN123"
 *   "Gordys Lakefront Marine" → null (no ID)
 * 
 * @param {string} dealerName - Raw dealer name from Jericho
 * @returns {{ clientDealerId: string|null, omniDealerId: string|null }}
 */
function extractDealerIds(dealerName) {
    if (!dealerName) return { clientDealerId: null, omniDealerId: null };
    const name = String(dealerName).trim();

    let clientDealerId = null;
    let omniDealerId = null;

    // Extract numeric OMNI ID from end first (so we don't mistake it for a clientDealerId)
    const numericMatch = OMNI_NUMERIC_ID_PATTERN.exec(name);
    if (numericMatch) {
        omniDealerId = numericMatch[1];
    }

    // Extract clientDealerId (letters + digits pattern)
    const idMatch = CLIENT_DEALER_ID_PATTERN.exec(name);
    if (idMatch) {
        const candidate = idMatch[1].toUpperCase() + idMatch[2];
        // Sanity: skip false positives where the "ID" is actually the omniDealerId
        if (candidate !== omniDealerId) {
            clientDealerId = candidate;
        }
    }

    // Special case: "Uwharrie RV  740 Motors - NC125 - 363300"
    // The loose regex might grab "RV740" as a false positive.
    // If the clientDealerId doesn't look like a real state code, try harder.
    if (clientDealerId && !/^[A-Z]{2}\d/.test(clientDealerId)) {
        // Try finding a second match that looks more like a real state code
        const allMatches = [...name.matchAll(new RegExp(CLIENT_DEALER_ID_PATTERN.source, 'g'))];
        for (const m of allMatches) {
            const alt = m[1].toUpperCase() + m[2];
            if (alt !== clientDealerId && alt !== omniDealerId && /^[A-Z]{2}\d/.test(alt)) {
                clientDealerId = alt;
                break;
            }
        }
        // If still no 2-letter prefix, keep the original — it might be a 3-letter code like EGA102
        if (clientDealerId && !/^[A-Z]{2,3}\d/.test(clientDealerId)) {
            clientDealerId = null;
        }
    }

    return { clientDealerId, omniDealerId };
}

/**
 * Generate a deterministic, unique sourceCommunicationId for a Jericho record.
 * Format: JERICHO-{hash} where hash is md5 of rep+date+dealerName+rowIndex
 */
function generateSourceId(rep, dateStr, dealerName, rowIndex) {
    const raw = `${rep}|${dateStr}|${dealerName}|${rowIndex}`;
    const hash = crypto.createHash('md5').update(raw).digest('hex').substring(0, 12);
    return `JERICHO-${hash}`;
}

/**
 * Format an Excel date serial number or Date object to ISO string
 */
function formatDate(val) {
    if (!val) return null;
    if (val instanceof Date) {
        return isNaN(val.getTime()) ? null : val;
    }
    // Excel serial number
    if (typeof val === 'number') {
        const d = new Date((val - 25569) * 86400 * 1000);
        return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(String(val));
    return isNaN(d.getTime()) ? null : d;
}

// ─── Rep Email Lookup ────────────────────────────────────────────────────────
const REP_EMAIL_MAP = {
    'gott': 'gott@source1financial.com',
    'dzilberchtein': 'dzilberchtein@source1financial.com',
    'jsmith': 'jsmith@source1financial.com',
    'jharrington1': 'jharrington1@source1financial.com',
    'edominguez': 'edominguez@source1financial.com',
    'gcoulombe': 'gcoulombe@source1financial.com',
    'ljablonoski': 'ljablonoski@source1financial.com',
    'jweller': 'jweller@source1financial.com',
    'wstoutimore': 'wstoutimore@source1financial.com',
    'pcarter': 'pcarter@source1financial.com',
    'jrubi': 'jrubi@source1financial.com',
    's1house': 's1house@source1financial.com',
    'skimble': 'skimble@source1financial.com',
    'mschultz1': 'mschultz1@source1financial.com',
    'bsweere': 'bsweere@source1financial.com',
    'sdodge': 'sdodge@source1financial.com'
};

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log(`
Jericho Historical Call Report Importer
=======================================
Usage: node server/scripts/importJerichoData.js <xlsx-file> [options]

Options:
  --dry-run          Parse and show match report without writing to MongoDB
  --skip-snapshots   Skip automatic snapshot regeneration after import
`);
        process.exit(0);
    }

    const filePath = path.resolve(process.cwd(), args.find(a => !a.startsWith('--')));
    const dryRun = args.includes('--dry-run');
    const skipSnapshots = args.includes('--skip-snapshots');

    console.log(`\n==================================================`);
    console.log(` JERICHO HISTORICAL CALL REPORT IMPORTER`);
    console.log(`==================================================`);
    console.log(` File             : ${filePath}`);
    console.log(` Mode             : ${dryRun ? 'DRY-RUN (Analysis Only)' : 'LIVE IMPORT'}`);
    console.log(` Skip Snapshots   : ${skipSnapshots}`);
    console.log(`==================================================\n`);

    if (!fs.existsSync(filePath)) {
        console.error(`Error: File does not exist: ${filePath}`);
        process.exit(1);
    }

    // ─── Step 1: Read XLSX ───────────────────────────────────────────────────
    console.log('Reading XLSX file...');
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    console.log(`  Sheet: "${sheetName}"`);

    const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,  // Array of arrays
        raw: false,
        dateNF: 'yyyy-mm-dd'
    });

    // Find header row (skip title rows)
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(rawData.length, 10); i++) {
        const row = rawData[i];
        if (row && row.some(cell => String(cell || '').toLowerCase().includes('sales rep'))) {
            headerRowIndex = i;
            break;
        }
    }

    if (headerRowIndex === -1) {
        console.error('Could not find header row containing "Sales Rep"');
        process.exit(1);
    }

    const headers = rawData[headerRowIndex].map(h => String(h || '').trim());
    console.log(`  Headers found at row ${headerRowIndex + 1}: ${headers.join(', ')}`);

    // Map column indices
    const colIdx = {};
    headers.forEach((h, i) => { colIdx[h.toLowerCase()] = i; });

    const COL = {
        salesRep: colIdx['sales rep'],
        dateCompleted: colIdx['date completed'],
        dealerName: colIdx['dealer name'],
        callCount: colIdx['call count'],
        callType: colIdx['call type'],
        purpose: colIdx['purpose'],
        contactName: colIdx['contact name'],
        callNotesDate: colIdx['call notes date'],
        callNotes: colIdx['dealer call notes']
    };

    // Extract data rows (skip header and title rows)
    const dataRows = rawData.slice(headerRowIndex + 1).filter(row => {
        return row && row.length > 0 && row[COL.dealerName];
    });

    console.log(`  Data rows: ${dataRows.length.toLocaleString()}`);

    // ─── Step 2: Connect to MongoDB & Load Known Dealer IDs ─────────────────
    console.log('\nConnecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
    console.log('Connected to MongoDB.');

    const knownDealers = await DealerLocation.find(
        { clientDealerId: { $exists: true, $ne: null } },
        { clientDealerId: 1, dealerId: 1, dealerName: 1, _id: 1 }
    ).lean();

    const dealerIdMap = new Map();
    for (const d of knownDealers) {
        dealerIdMap.set(d.clientDealerId.toUpperCase(), d);
    }
    console.log(`Loaded ${dealerIdMap.size} known dealer IDs from DealerLocation.\n`);

    // ─── Step 3: Process Rows & Extract IDs ─────────────────────────────────
    console.log('Processing rows and extracting dealer IDs...');

    const stats = {
        total: 0,
        validated: 0,       // ID extracted AND found in DealerLocation
        extractedUnknown: 0, // ID extracted but NOT in DealerLocation
        noId: 0,            // No ID extractable
        skippedNull: 0
    };

    const unmatchedDealers = new Map();  // name -> count
    const unknownIds = new Map();        // extracted ID -> { name, count }
    const docs = [];  // Documents to upsert

    for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const salesRep = String(row[COL.salesRep] || '').trim();
        const dateCompleted = row[COL.dateCompleted];
        const dealerName = String(row[COL.dealerName] || '').trim();
        const callCount = row[COL.callCount];
        const callType = String(row[COL.callType] || '').trim();
        const purpose = String(row[COL.purpose] || '').trim();
        const contactName = String(row[COL.contactName] || '').trim();
        const callNotesDate = row[COL.callNotesDate];
        const callNotes = String(row[COL.callNotes] || '').trim();

        if (!dealerName) {
            stats.skippedNull++;
            continue;
        }

        stats.total++;

        const eventDate = formatDate(dateCompleted);
        const dateStr = eventDate ? eventDate.toISOString().split('T')[0] : 'unknown';

        // Extract dealer IDs
        const { clientDealerId, omniDealerId } = extractDealerIds(dealerName);

        // Validate against known dealers
        let matchedDealer = null;
        let matchStatus;
        if (clientDealerId && dealerIdMap.has(clientDealerId.toUpperCase())) {
            matchedDealer = dealerIdMap.get(clientDealerId.toUpperCase());
            stats.validated++;
            matchStatus = 'validated';
        } else if (clientDealerId) {
            stats.extractedUnknown++;
            matchStatus = 'unknown_id';
            const key = clientDealerId;
            unknownIds.set(key, {
                name: dealerName,
                count: (unknownIds.get(key)?.count || 0) + 1
            });
        } else {
            stats.noId++;
            matchStatus = 'no_id';
            unmatchedDealers.set(dealerName, (unmatchedDealers.get(dealerName) || 0) + 1);
        }

        // Map call type
        const mappedCallType = CALL_TYPE_MAP[(callType || '').toLowerCase()] || callType || null;

        // Build feedback text (contact name + call notes)
        let feedback = '';
        if (contactName) feedback += `Contact: ${contactName}`;
        if (callNotes) feedback += (feedback ? ' | ' : '') + callNotes;

        // Generate unique source ID
        const sourceCommunicationId = generateSourceId(salesRep, dateStr, dealerName, i);

        // Build document
        const doc = {
            sourceCommunicationId,
            sourceSystem: 'jericho',
            communicationOrganizationName: 'source-one-financial-services',
            communicationUserName: salesRep || null,
            communicationUserFullName: null,
            communicationUserEmail: REP_EMAIL_MAP[(salesRep || '').toLowerCase()] || null,
            communicationType: mappedCallType,
            recipientRelationshipType: null,
            recipientOrganizationName: dealerName,
            internalRelationshipId1: omniDealerId || null,
            internalRelationshipId2: clientDealerId || null,
            communicationResult1: purpose || null,
            communicationFeedback1: feedback || null,
            communicationEventDatetime: eventDate,
            communicationEventTimezone: null,
            lastCommunicationEventDatetime: formatDate(callNotesDate),
            isProspect: null,
            isActiveRelationship: null,
            isInactiveRelationship: null,
            lastIngestionDate: new Date()
        };

        docs.push(doc);
    }

    // ─── Step 4: Print Match Report ─────────────────────────────────────────
    console.log(`\n==================================================`);
    console.log(` MATCH REPORT`);
    console.log(`==================================================`);
    console.log(`  Total data rows:                       ${stats.total.toLocaleString()}`);
    console.log(`  ✅ Validated (ID matched DealerLocation): ${stats.validated.toLocaleString()} (${(stats.validated / stats.total * 100).toFixed(1)}%)`);
    console.log(`  ⚠️  ID extracted but unknown:             ${stats.extractedUnknown.toLocaleString()} (${(stats.extractedUnknown / stats.total * 100).toFixed(1)}%)`);
    console.log(`  ❌ No ID extractable:                    ${stats.noId.toLocaleString()} (${(stats.noId / stats.total * 100).toFixed(1)}%)`);
    console.log(`  Skipped (null dealer):                  ${stats.skippedNull.toLocaleString()}`);

    if (unknownIds.size > 0) {
        console.log(`\n  Unknown IDs (extracted but not in DealerLocation):`);
        for (const [id, info] of [...unknownIds.entries()].sort((a, b) => b[1].count - a[1].count)) {
            console.log(`    ${id} (${info.count} rows): ${info.name}`);
        }
    }

    if (unmatchedDealers.size > 0) {
        console.log(`\n  Top unmatched dealers (no extractable ID):`);
        const sorted = [...unmatchedDealers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
        for (const [name, count] of sorted) {
            console.log(`    ${count.toString().padStart(4)} rows | ${name}`);
        }
    }

    // ─── Step 5: Upsert to MongoDB (or stop if dry-run) ─────────────────────
    if (dryRun) {
        console.log(`\n✓ DRY-RUN COMPLETE — No database writes performed.`);
        console.log(`  ${docs.length.toLocaleString()} documents would be upserted.`);
        await mongoose.disconnect();
        process.exit(0);
    }

    // Create audit log entry
    const payload = await WebhookPayload.create({
        body: { source: 'jericho_import', file: filePath, importedAt: new Date() },
        headers: { 'user-agent': 'importJerichoData-script' },
        receivedAt: new Date()
    });

    console.log(`\nUpserting ${docs.length.toLocaleString()} documents into DealerCommunication...`);
    const BATCH_SIZE = 500;
    let totalUpserted = 0;
    let totalModified = 0;

    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = docs.slice(i, i + BATCH_SIZE).map(doc => ({
            updateOne: {
                filter: { sourceCommunicationId: doc.sourceCommunicationId },
                update: { $set: { ...doc, sourcePayload: payload._id } },
                upsert: true
            }
        }));

        const result = await DealerCommunication.bulkWrite(batch, { ordered: false });
        totalUpserted += result.upsertedCount || 0;
        totalModified += result.modifiedCount || 0;

        if ((i + BATCH_SIZE) % 5000 === 0 || i + BATCH_SIZE >= docs.length) {
            const progress = Math.min(i + BATCH_SIZE, docs.length);
            console.log(`  [${progress.toLocaleString()} / ${docs.length.toLocaleString()}] upserted=${totalUpserted} modified=${totalModified}`);
        }
    }

    console.log(`\n✅ INGESTION COMPLETE`);
    console.log(`  New records:     ${totalUpserted.toLocaleString()}`);
    console.log(`  Updated records: ${totalModified.toLocaleString()}`);

    // ─── Step 6: Regenerate Snapshots ────────────────────────────────────────
    if (!skipSnapshots) {
        console.log(`\n--------------------------------------------------`);
        console.log(` TRIGGERING SNAPSHOT REGENERATION (from 2025-01-01)`);
        console.log(`--------------------------------------------------`);
        try {
            const { generateSnapshotsForRange } = require('../services/snapshotGeneratorService');
            await generateSnapshotsForRange({ fromDate: '2025-01-01' });

            console.log(`\nRebuilding Monthly Dealer Rollups...`);
            const { rebuildAllRollups } = require('../services/rollupService');
            await rebuildAllRollups();
        } catch (err) {
            console.error(`Snapshot/rollup generation error: ${err.message}`);
        }
    }

    await mongoose.disconnect();
    console.log(`\nDone.`);
    process.exit(0);
}

main().catch(err => {
    console.error(`\nFATAL ERROR: ${err.stack || err.message}`);
    if (mongoose.connection.readyState !== 0) {
        mongoose.disconnect().finally(() => process.exit(1));
    } else {
        process.exit(1);
    }
});
