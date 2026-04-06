/**
 * Import 2026 Sales Budget CSV into MongoDB.
 * 
 * Parses both sections:
 *   Section 1 (lines 7-61): State/Rep budget → SalesBudget collection
 *   Section 2 (lines 64+): Large Dealer/FSP/Silver → LargeDealerBudget collection
 * 
 * Usage: node scripts/importBudget.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const SalesBudget = require('../models/SalesBudget');
const LargeDealerBudget = require('../models/LargeDealerBudget');

const CSV_PATH = path.join(__dirname, '..', 'data', '2026 Sales Budget.xlsx - Sheet1.csv');
const YEAR = 2026;

/** Parse a dollar string like '"189,792"' or '- ' to a number */
function parseDollar(val) {
    if (!val) return 0;
    const cleaned = val.replace(/"/g, '').replace(/,/g, '').replace(/\$/g, '').trim();
    if (!cleaned || cleaned === '-' || cleaned === '- ' || cleaned === '-   ') return 0;
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
}

/** Parse a percentage string like '12.80%' or '#DIV/0!' to a decimal */
function parsePercent(val) {
    if (!val) return null;
    const cleaned = val.replace(/"/g, '').replace(/%/g, '').trim();
    if (!cleaned || cleaned.includes('DIV')) return null;
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num / 100;
}

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const raw = fs.readFileSync(CSV_PATH, 'utf-8');
    const lines = raw.split('\n').map(l => l.replace(/\r/g, ''));

    // ── Section 1: State/Rep Budget (lines 7-61 in 1-indexed = index 6-60) ──
    console.log('\n=== Parsing State/Rep Budget ===');
    const repBudgets = [];

    for (let i = 6; i <= 60; i++) {
        const line = lines[i];
        if (!line || !line.trim()) continue;

        // Split by comma, but respect quoted fields
        const cols = parseCSVLine(line);

        // Data rows have rep in col 2 (index 2) and state in col 3 (index 3)
        const rep = cols[2]?.trim();
        const state = cols[3]?.trim();

        // Skip empty/separator rows
        if (!rep || !state || state.length !== 2) continue;

        const growthTarget = parsePercent(cols[0]);
        const marketShare = parsePercent(cols[1]);

        const monthlyBudgets = {};
        let annualTotal = 0;
        for (let m = 1; m <= 12; m++) {
            const val = parseDollar(cols[3 + m]); // cols 4-15 = Jan-Dec
            monthlyBudgets[m] = val;
            annualTotal += val;
        }

        repBudgets.push({
            year: YEAR,
            rep,
            state,
            growthTarget,
            marketShare,
            monthlyBudgets,
            annualTotal,
        });

        console.log(`  ${rep} / ${state}: $${annualTotal.toLocaleString()} (growth: ${growthTarget ? (growthTarget * 100).toFixed(1) + '%' : 'N/A'})`);
    }

    // Upsert state/rep budgets
    for (const budget of repBudgets) {
        await SalesBudget.findOneAndUpdate(
            { year: budget.year, rep: budget.rep, state: budget.state },
            budget,
            { upsert: true, new: true }
        );
    }
    console.log(`\n✓ Upserted ${repBudgets.length} state/rep budget rows`);

    // ── Section 2: Large Dealer Budget (lines 64+ = index 63+) ──
    console.log('\n=== Parsing Large Dealer Budget ===');
    const largeBudgets = [];

    // Parse the structured blocks
    const groupBlocks = [
        { name: 'Fun Town (Core)', startLine: 65, category: 'large_dealer' },
        { name: 'Silver', startLine: 73, category: 'silver' },
        { name: 'EPIC', startLine: 81, category: 'large_dealer' },
        { name: 'IFG', startLine: 89, category: 'large_dealer' },
        { name: 'Large Dealer Groups', startLine: 97, category: 'large_dealer' },
        { name: 'FSPs', startLine: 105, category: 'fsp' },
    ];

    for (const block of groupBlocks) {
        const idx = block.startLine - 1; // 0-indexed

        // Each block has: name row, lender row, source1 row, originations row
        const lenderLine = lines[idx + 1];
        const source1Line = lines[idx + 2];
        const origLine = lines[idx + 3];

        const lenderCols = parseCSVLine(lenderLine);
        const source1Cols = parseCSVLine(source1Line);
        const origCols = parseCSVLine(origLine);

        const lenderOrig = {};
        const sourceOneOrig = {};
        const totalOrig = {};
        let annualTotal = 0;

        // Check for EPIC percentage
        let epicPercentage = null;
        if (block.name === 'EPIC') {
            const epicLine = lines[idx];
            const epicCols = parseCSVLine(epicLine);
            epicPercentage = parsePercent(epicCols[4]); // 95% in col E
        }

        for (let m = 1; m <= 12; m++) {
            lenderOrig[m] = parseDollar(lenderCols[3 + m]);
            sourceOneOrig[m] = parseDollar(source1Cols[3 + m]);
            totalOrig[m] = parseDollar(origCols[3 + m]);
            annualTotal += totalOrig[m];
        }

        largeBudgets.push({
            year: YEAR,
            groupName: block.name,
            category: block.category,
            epicPercentage,
            lenderOriginations: lenderOrig,
            sourceOneOriginations: sourceOneOrig,
            totalOriginations: totalOrig,
            annualTotal,
        });

        console.log(`  ${block.name}: $${annualTotal.toLocaleString()} (${block.category})`);
    }

    // Upsert large dealer budgets
    for (const budget of largeBudgets) {
        await LargeDealerBudget.findOneAndUpdate(
            { year: budget.year, groupName: budget.groupName },
            budget,
            { upsert: true, new: true }
        );
    }
    console.log(`\n✓ Upserted ${largeBudgets.length} large dealer budget rows`);

    await mongoose.disconnect();
    console.log('\nDone!');
}

/**
 * Parse a CSV line respecting quoted fields.
 * Handles: "189,792" as a single field.
 */
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    result.push(current);
    return result;
}

run().catch((err) => {
    console.error('Import failed:', err);
    process.exit(1);
});
