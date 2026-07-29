/**
 * Pre-Import Data Analyzer
 * 
 * Validates CSV files in a directory before running importOmniData.js.
 * Performs the same analysis a human would do manually:
 *   - Detects table type via parser registry header matching
 *   - Validates all required headers are present
 *   - Counts rows and columns
 *   - Extracts date ranges for time-series tables
 *   - Detects duplicate files mapped to the same table
 *   - Flags potential issues (missing tables, duplicate files, low row counts)
 * 
 * Usage:
 *   node server/scripts/analyzeImportData.js <data-directory>
 *   node server/scripts/analyzeImportData.js ./new_data --json
 * 
 * @module scripts/analyzeImportData
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Import parser registry (no DB connection needed)
const { parseCSV, detectParser, getParser } = require('../services/csvParserService');

// ── Date column mappings per table type ──────────────────────────────────
const DATE_COLUMNS = {
    main_application: 'APPLICATIONDATE DATE',
    dealer_communication: 'COMMUNICATIONEVENTDATETIME',
    dealer_information: 'ENROLLMENTDATE'   // less meaningful but still interesting
};

// ── ANSI color helpers ───────────────────────────────────────────────────
const c = {
    green: (s) => `\x1b[32m${s}\x1b[0m`,
    red: (s) => `\x1b[31m${s}\x1b[0m`,
    yellow: (s) => `\x1b[33m${s}\x1b[0m`,
    cyan: (s) => `\x1b[36m${s}\x1b[0m`,
    bold: (s) => `\x1b[1m${s}\x1b[0m`,
    dim: (s) => `\x1b[2m${s}\x1b[0m`,
    check: '✓',
    cross: '✗',
    warn: '⚠'
};

/**
 * Parse a CSV file fully — header detection + row parsing + date extraction.
 */
function analyzeFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const fileName = path.basename(filePath);
    const fileSizeBytes = fs.statSync(filePath).size;
    const fileSizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(2);

    // MD5 for duplicate detection
    const md5 = crypto.createHash('md5').update(content).digest('hex');

    // Parse headers only first (fast detection)
    const firstNewline = content.indexOf('\n');
    const headerLine = content.substring(0, firstNewline).replace(/\r$/, '').trim();

    // Use our parser to get structured headers
    let headers, rows;
    try {
        const parsed = parseCSV(content);
        headers = parsed.headers;
        rows = parsed.rows;
    } catch (err) {
        return {
            fileName,
            filePath,
            fileSizeMB,
            md5,
            error: err.message,
            parserType: null,
            headers: [],
            rowCount: 0,
            columnCount: 0,
            dateRange: null,
            missingHeaders: [],
            extraHeaders: []
        };
    }

    // Detect parser type
    const parserType = detectParser(headers);

    // Check required headers
    let missingHeaders = [];
    let extraHeaders = [];
    if (parserType) {
        const config = getParser(parserType);
        const upperActual = headers.map(h => h.toUpperCase());
        missingHeaders = config.expectedHeaders.filter(
            h => !upperActual.includes(h.toUpperCase())
        );
        const upperExpected = config.expectedHeaders.map(h => h.toUpperCase());
        extraHeaders = headers.filter(
            h => !upperExpected.includes(h.toUpperCase())
        );
    }

    // Extract date range if applicable
    let dateRange = null;
    const dateCol = parserType ? DATE_COLUMNS[parserType] : null;
    if (dateCol) {
        const upperHeaders = headers.map(h => h.toUpperCase());
        const dateIdx = upperHeaders.indexOf(dateCol.toUpperCase());
        if (dateIdx !== -1) {
            const dates = rows
                .map(row => {
                    const val = row[headers[dateIdx]];
                    return val ? val.trim().substring(0, 10) : null;  // YYYY-MM-DD
                })
                .filter(d => d && d.match(/^\d{4}-\d{2}-\d{2}/))
                .sort();

            if (dates.length > 0) {
                dateRange = {
                    earliest: dates[0],
                    latest: dates[dates.length - 1],
                    daysSpanned: Math.ceil(
                        (new Date(dates[dates.length - 1]) - new Date(dates[0])) / (1000 * 60 * 60 * 24)
                    ) + 1,
                    datesFound: dates.length
                };
            }
        }
    }

    return {
        fileName,
        filePath,
        fileSizeMB,
        md5,
        error: null,
        parserType,
        headers,
        rowCount: rows.length,
        columnCount: headers.length,
        dateRange,
        missingHeaders,
        extraHeaders
    };
}

/**
 * Detect duplicate files — same table type, different content.
 */
function detectDuplicates(results) {
    const byType = {};
    for (const r of results) {
        if (!r.parserType) continue;
        if (!byType[r.parserType]) byType[r.parserType] = [];
        byType[r.parserType].push(r);
    }

    const duplicates = [];
    for (const [type, files] of Object.entries(byType)) {
        if (files.length > 1) {
            const allSameMd5 = files.every(f => f.md5 === files[0].md5);
            duplicates.push({
                type,
                files: files.map(f => ({
                    name: f.fileName,
                    rows: f.rowCount,
                    md5: f.md5
                })),
                areIdentical: allSameMd5,
                recommendation: allSameMd5
                    ? 'Files are identical — remove one to avoid redundant processing.'
                    : `Files differ (${files.map(f => `${f.rowCount} rows`).join(' vs ')}). The last file processed alphabetically will overwrite shared records.`
            });
        }
    }
    return duplicates;
}

// ── Main ─────────────────────────────────────────────────────────────────
function main() {
    const args = process.argv.slice(2);
    const jsonMode = args.includes('--json');
    const targetDirArg = args.find(a => !a.startsWith('--'));

    if (!targetDirArg || args.includes('--help') || args.includes('-h')) {
        console.log(`
Pre-Import Data Analyzer
========================
Usage: node server/scripts/analyzeImportData.js <dir> [options]

Arguments:
  <dir>        Path to directory containing CSV files (e.g. ./new_data)

Options:
  --json       Output results as JSON (for scripting)
  --help       Show this help
`);
        process.exit(0);
    }

    const targetDir = path.resolve(process.cwd(), targetDirArg);

    if (!fs.existsSync(targetDir)) {
        console.error(`Error: Directory does not exist: ${targetDir}`);
        process.exit(1);
    }

    // Scan for CSV files (ignore helper scripts like .py, .txt)
    const csvFiles = fs.readdirSync(targetDir)
        .filter(f => f.toLowerCase().endsWith('.csv'))
        .sort();

    if (csvFiles.length === 0) {
        console.error(`No CSV files found in ${targetDir}`);
        process.exit(1);
    }

    // ── Analyze each file ────────────────────────────────────────────────
    const startTime = Date.now();
    const results = [];

    if (!jsonMode) {
        console.log(`\n${c.bold('══════════════════════════════════════════════════')}`);
        console.log(`${c.bold(' PRE-IMPORT DATA ANALYSIS')}`);
        console.log(`${c.bold('══════════════════════════════════════════════════')}`);
        console.log(` Directory : ${targetDir}`);
        console.log(` CSV Files : ${csvFiles.length}`);
        console.log(` Timestamp : ${new Date().toISOString()}`);
        console.log(`${c.bold('══════════════════════════════════════════════════')}\n`);
    }

    for (const file of csvFiles) {
        const filePath = path.join(targetDir, file);

        if (!jsonMode) {
            console.log(`${c.dim('Analyzing:')} ${file}...`);
        }

        const result = analyzeFile(filePath);
        results.push(result);

        if (!jsonMode) {
            if (result.error) {
                console.log(`  ${c.red(c.cross)} ERROR: ${result.error}`);
            } else if (result.parserType) {
                console.log(`  ${c.green(c.check)} Detected: ${c.cyan(result.parserType)}`);
                console.log(`    Rows: ${result.rowCount.toLocaleString()} | Columns: ${result.columnCount} | Size: ${result.fileSizeMB} MB`);

                if (result.missingHeaders.length > 0) {
                    console.log(`    ${c.red(c.cross)} Missing required headers: ${result.missingHeaders.join(', ')}`);
                } else {
                    console.log(`    ${c.green(c.check)} All required headers present`);
                }

                if (result.dateRange) {
                    console.log(`    ${c.cyan('📅')} Date range: ${result.dateRange.earliest} → ${result.dateRange.latest} (${result.dateRange.daysSpanned} days)`);
                }
            } else {
                console.log(`  ${c.yellow(c.warn)} UNRECOGNIZED — headers don't match any registered parser`);
                console.log(`    Headers: ${result.headers.slice(0, 5).join(', ')}...`);
            }
            console.log();
        }
    }

    // ── Duplicate detection ──────────────────────────────────────────────
    const duplicates = detectDuplicates(results);

    if (!jsonMode && duplicates.length > 0) {
        console.log(`${c.bold('──────────────────────────────────────────────────')}`);
        console.log(`${c.yellow(c.warn)} DUPLICATE FILE WARNINGS`);
        console.log(`${c.bold('──────────────────────────────────────────────────')}`);
        for (const dup of duplicates) {
            console.log(`\n  Table: ${c.cyan(dup.type)}`);
            for (const f of dup.files) {
                console.log(`    • ${f.name} (${f.rows.toLocaleString()} rows, MD5: ${f.md5.substring(0, 8)}…)`);
            }
            console.log(`    ${dup.areIdentical ? c.yellow('Identical content') : c.yellow('Different content')}`);
            console.log(`    ${c.dim('→')} ${dup.recommendation}`);
        }
        console.log();
    }

    // ── Coverage summary ─────────────────────────────────────────────────
    const expectedTables = ['dealer_information', 'dealer_communication', 'main_application'];
    const foundTypes = new Set(results.filter(r => r.parserType).map(r => r.parserType));
    const missingTables = expectedTables.filter(t => !foundTypes.has(t));
    const unrecognized = results.filter(r => !r.parserType && !r.error);
    const errored = results.filter(r => r.error);

    const analysisTimeMs = Date.now() - startTime;

    if (!jsonMode) {
        console.log(`${c.bold('══════════════════════════════════════════════════')}`);
        console.log(`${c.bold(' SUMMARY')}`);
        console.log(`${c.bold('══════════════════════════════════════════════════')}`);

        // Table coverage
        for (const table of expectedTables) {
            const tableFiles = results.filter(r => r.parserType === table);
            if (tableFiles.length === 0) {
                console.log(`  ${c.yellow(c.warn)} ${table}: ${c.yellow('NOT FOUND')}`);
            } else if (tableFiles.length === 1) {
                const f = tableFiles[0];
                const dateInfo = f.dateRange
                    ? ` | ${f.dateRange.earliest} → ${f.dateRange.latest} (${f.dateRange.daysSpanned}d)`
                    : '';
                console.log(`  ${c.green(c.check)} ${table}: ${f.rowCount.toLocaleString()} rows${dateInfo}`);
            } else {
                console.log(`  ${c.yellow(c.warn)} ${table}: ${tableFiles.length} files (${tableFiles.map(f => `${f.rowCount.toLocaleString()}`).join(' + ')} rows)`);
            }
        }

        if (unrecognized.length > 0) {
            console.log(`  ${c.yellow(c.warn)} ${unrecognized.length} unrecognized file(s) will be skipped`);
        }
        if (errored.length > 0) {
            console.log(`  ${c.red(c.cross)} ${errored.length} file(s) had parse errors`);
        }

        console.log(`\n  Analysis completed in ${analysisTimeMs}ms`);

        // Overall verdict
        const hasErrors = errored.length > 0 || results.some(r => r.missingHeaders.length > 0);
        const hasWarnings = duplicates.length > 0 || missingTables.length > 0;

        if (hasErrors) {
            console.log(`\n  ${c.red('▸ ISSUES FOUND — review errors above before importing')}`);
        } else if (hasWarnings) {
            console.log(`\n  ${c.yellow('▸ WARNINGS — review notes above, but safe to import')}`);
        } else {
            console.log(`\n  ${c.green('▸ ALL CLEAR — ready for import')}`);
        }

        console.log(`\n  ${c.dim('Next step:')}`);
        console.log(`  ${c.dim('  node server/scripts/importOmniData.js ' + targetDirArg + ' --dry-run')}`);
        console.log(`  ${c.dim('  node server/scripts/importOmniData.js ' + targetDirArg)}`);

        console.log(`${c.bold('══════════════════════════════════════════════════')}\n`);
    }

    // ── JSON output mode ─────────────────────────────────────────────────
    if (jsonMode) {
        const output = {
            directory: targetDir,
            analyzedAt: new Date().toISOString(),
            analysisTimeMs,
            files: results.map(r => ({
                fileName: r.fileName,
                parserType: r.parserType,
                rowCount: r.rowCount,
                columnCount: r.columnCount,
                fileSizeMB: r.fileSizeMB,
                md5: r.md5,
                dateRange: r.dateRange,
                missingHeaders: r.missingHeaders,
                error: r.error
            })),
            duplicates,
            missingTables,
            hasErrors: errored.length > 0 || results.some(r => r.missingHeaders.length > 0),
            hasWarnings: duplicates.length > 0 || missingTables.length > 0
        };
        console.log(JSON.stringify(output, null, 2));
    }

    // Exit with appropriate code
    const hasBlockingErrors = errored.length > 0 || results.some(r => r.missingHeaders.length > 0);
    process.exit(hasBlockingErrors ? 1 : 0);
}

main();
