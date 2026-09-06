/**
 * Audit: Compare Joseph's Excel list vs our DB to find discrepancies
 * 
 * Joseph's criteria (from email):
 *   Tab 2: onboarded more than 6 months ago
 *   Tab 1: subset of Tab 2 with at least 1 deal funded in past 6 months
 *   Dark = Tab 2 - Tab 1
 * 
 * Our DB replication:
 *   enrollmentDate <= 6 months ago (from DealerLocation)
 *   lastBookedDate from latest DailyDealerSnapshot
 *   daysSinceLastBooking >= 180 OR never booked → dark
 * 
 * Usage: cd server && node scripts/audit_dark_dealers.js
 */

const mongoose = require('mongoose');
const xlsx = require('xlsx');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DealerLocation = require('../models/DealerLocation');
const DailyDealerSnapshot = require('../models/DailyDealerSnapshot');

function extractDealerId(str) {
  if (!str) return null;
  const parts = str.split(/\s*-\s*/);
  for (let i = parts.length - 1; i >= 0; i--) {
    const c = parts[i].trim().toUpperCase();
    if (/^[A-Z]+\d+$/.test(c)) return c;
  }
  return null;
}

function fmtDate(d) {
  if (!d) return 'N/A';
  const dt = d instanceof Date ? d : new Date(d);
  return isNaN(dt) ? 'N/A' : dt.toISOString().split('T')[0];
}

async function main() {
  // ── 1. Read Excel ──
  const xlsxPath = path.join(__dirname, '..', 'The Streak Sales Incentive 2026 (1) (2) (1).xlsx');
  const wb = xlsx.readFile(xlsxPath);

  const activeRows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  const allRows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[1]]);

  const excelActiveIds = new Set(activeRows.map(r => extractDealerId(r['Dealername'])).filter(Boolean));
  const excelAllIds = new Set(allRows.map(r => extractDealerId(r['Dealername'])).filter(Boolean));
  const excelDarkIds = new Set([...excelAllIds].filter(id => !excelActiveIds.has(id)));

  console.log('=== JOSEPH\'S EXCEL ===');
  console.log(`Tab 1 (active): ${excelActiveIds.size}`);
  console.log(`Tab 2 (all onboarded 6mo+): ${excelAllIds.size}`);
  console.log(`Dark (Tab2 - Tab1): ${excelDarkIds.size}`);

  // ── 2. Connect & replicate from our DB ──
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('\nConnected to MongoDB');

  // His cutoff: "onboarded more than 6 months" → enrolled before ~March 2, 2026
  // His email was Sept 2, 2026, so 6 months back = March 2, 2026
  const sixMonthsAgo = new Date('2026-03-02');
  console.log(`Cutoff date (6mo before Sept 2): ${fmtDate(sixMonthsAgo)}`);

  // All dealers enrolled before cutoff
  const allLocations = await DealerLocation.find({}).lean();
  console.log(`\nTotal dealers in DB: ${allLocations.length}`);

  const enrolledBefore = allLocations.filter(l => {
    if (!l.enrollmentDate) return false;
    return new Date(l.enrollmentDate) <= sixMonthsAgo;
  });
  console.log(`Enrolled 6+ months ago (before ${fmtDate(sixMonthsAgo)}): ${enrolledBefore.length}`);

  const noEnrollment = allLocations.filter(l => !l.enrollmentDate);
  console.log(`Missing enrollment date: ${noEnrollment.length}`);

  // Get latest snapshot for all enrolled-before dealers
  const enrolledIds = enrolledBefore.map(l => l._id);
  const snapshots = await DailyDealerSnapshot.aggregate([
    { $match: { dealerLocation: { $in: enrolledIds } } },
    { $sort: { dealerLocation: 1, reportDate: -1 } },
    { $group: {
        _id: '$dealerLocation',
        lastBookedDate: { $first: '$lastBookedDate' },
        daysSinceLastBooking: { $first: '$daysSinceLastBooking' },
        reportDate: { $first: '$reportDate' },
    }}
  ]).allowDiskUse(true);

  const snapByLocId = new Map(snapshots.map(s => [s._id.toString(), s]));
  const locById = new Map(allLocations.map(l => [l._id.toString(), l]));

  // Split into active (booked in last 6mo) vs dark (not booked in 6mo+)
  const dbActiveIds = new Set();
  const dbDarkIds = new Set();

  for (const loc of enrolledBefore) {
    const snap = snapByLocId.get(loc._id.toString());
    if (snap && snap.daysSinceLastBooking !== null && snap.daysSinceLastBooking < 180) {
      dbActiveIds.add(loc.dealerId);
    } else {
      dbDarkIds.add(loc.dealerId);
    }
  }

  console.log(`\n=== OUR DB (same criteria) ===`);
  console.log(`Active (booked in last 180d): ${dbActiveIds.size}`);
  console.log(`Dark (no booking in 180d+): ${dbDarkIds.size}`);

  // ── 3. Compare ──
  console.log(`\n=== COMPARISON ===`);

  // In Joseph's dark list but NOT in our dark list
  const inExcelNotDB = [...excelDarkIds].filter(id => !dbDarkIds.has(id));
  console.log(`\nIn Joseph's dark list but NOT in ours: ${inExcelNotDB.length}`);
  if (inExcelNotDB.length > 0 && inExcelNotDB.length <= 30) {
    for (const id of inExcelNotDB) {
      const loc = allLocations.find(l => l.dealerId === id);
      const snap = loc ? snapByLocId.get(loc._id.toString()) : null;
      console.log(`  ${id} | enrolled: ${fmtDate(loc?.enrollmentDate)} | lastBooked: ${fmtDate(snap?.lastBookedDate)} | daysSinceBooking: ${snap?.daysSinceLastBooking ?? 'N/A'} | reason: ${!loc ? 'NOT IN DB' : !loc.enrollmentDate ? 'NO ENROLLMENT DATE' : new Date(loc.enrollmentDate) > sixMonthsAgo ? 'ENROLLED < 6MO' : snap?.daysSinceLastBooking < 180 ? 'BOOKED RECENTLY' : '???'}`);
    }
  }

  // In our dark list but NOT in Joseph's dark list
  const inDBNotExcel = [...dbDarkIds].filter(id => !excelDarkIds.has(id));
  console.log(`\nIn OUR dark list but NOT in Joseph's: ${inDBNotExcel.length}`);
  if (inDBNotExcel.length > 0) {
    // Categorize
    const notInExcelAtAll = inDBNotExcel.filter(id => !excelAllIds.has(id));
    const inExcelActive = inDBNotExcel.filter(id => excelActiveIds.has(id));
    const other = inDBNotExcel.filter(id => excelAllIds.has(id) && !excelActiveIds.has(id));
    console.log(`  Not in Excel at all: ${notInExcelAtAll.length}`);
    console.log(`  In Excel Tab 1 (active): ${inExcelActive.length}`);
    console.log(`  In Excel Tab 2 but somehow missed: ${other.length}`);

    if (notInExcelAtAll.length <= 50) {
      console.log(`\n  --- Missing from Excel entirely (first 20) ---`);
      for (const id of notInExcelAtAll.slice(0, 20)) {
        const loc = allLocations.find(l => l.dealerId === id);
        const snap = loc ? snapByLocId.get(loc._id.toString()) : null;
        console.log(`  ${id} | ${loc?.dealerName || '??'} | enrolled: ${fmtDate(loc?.enrollmentDate)} | lastBooked: ${fmtDate(snap?.lastBookedDate)} | daysSinceBooking: ${snap?.daysSinceLastBooking ?? 'N/A'} | status: ${loc?.systemStatus || ''}`);
      }
    }

    if (inExcelActive.length > 0 && inExcelActive.length <= 20) {
      console.log(`\n  --- Joseph says active, we say dark ---`);
      for (const id of inExcelActive) {
        const loc = allLocations.find(l => l.dealerId === id);
        const snap = loc ? snapByLocId.get(loc._id.toString()) : null;
        console.log(`  ${id} | ${loc?.dealerName || '??'} | lastBooked: ${fmtDate(snap?.lastBookedDate)} | daysSinceBooking: ${snap?.daysSinceLastBooking ?? 'N/A'}`);
      }
    }
  }

  // In Joseph's ACTIVE list but our DB says dark
  const excelActiveWeThinkDark = [...excelActiveIds].filter(id => dbDarkIds.has(id));
  console.log(`\nJoseph says ACTIVE but our DB says DARK: ${excelActiveWeThinkDark.length}`);
  if (excelActiveWeThinkDark.length > 0 && excelActiveWeThinkDark.length <= 20) {
    for (const id of excelActiveWeThinkDark) {
      const loc = allLocations.find(l => l.dealerId === id);
      const snap = loc ? snapByLocId.get(loc._id.toString()) : null;
      console.log(`  ${id} | ${loc?.dealerName || '??'} | lastBooked: ${fmtDate(snap?.lastBookedDate)} | daysSinceBooking: ${snap?.daysSinceLastBooking ?? 'N/A'}`);
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Joseph's dark list: ${excelDarkIds.size}`);
  console.log(`Our DB dark list:   ${dbDarkIds.size}`);
  console.log(`Overlap:            ${[...excelDarkIds].filter(id => dbDarkIds.has(id)).length}`);
  console.log(`Only in Excel:      ${inExcelNotDB.length}`);
  console.log(`Only in our DB:     ${inDBNotExcel.length}`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
