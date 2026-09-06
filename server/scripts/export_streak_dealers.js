/**
 * Export True Streak Dark Dealers CSV (The 506 Tab 0 Dealers)
 * 
 * Source: "The Streak Sales Incentive 2026" Excel - Tab 1 ("The Streak Eligible Dealers All")
 * Enriched with: DealerLocation, DealerProfile, latest DailyDealerSnapshot
 * 
 * Usage: cd server && node scripts/export_streak_dealers.js
 */

const mongoose = require('mongoose');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DealerLocation = require('../models/DealerLocation');
const DealerProfile = require('../models/DealerProfile');
const DailyDealerSnapshot = require('../models/DailyDealerSnapshot');

// ── Helpers ──

function excelDateToJS(serial) {
  if (!serial || typeof serial !== 'number') return null;
  return new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
}

function fmtDate(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  return isNaN(dt) ? '' : dt.toISOString().split('T')[0];
}

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const str = String(val).replace(/\r?\n/g, ' ').trim();
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function extractDealerId(dealerNameStr) {
  if (!dealerNameStr) return null;
  if (dealerNameStr.includes('Wheelen R-V Center')) return 'MO170';
  if (dealerNameStr.includes('Intercoastal Financial Group - IFG')) return 'IFG';
  
  const match = String(dealerNameStr).match(/[- ]+([A-Za-z]{2,4}\d{2,6})\s*$/);
  if (match) return match[1].toUpperCase();

  const parts = dealerNameStr.split(/[-–—]+/);
  for (let i = parts.length - 1; i >= 0; i--) {
    const c = parts[i].trim().toUpperCase().replace(/\s+/g, '');
    if (/^[A-Z]{1,5}\d+$/.test(c)) return c;
  }
  return null;
}

function extractDealerName(dealerNameStr) {
  if (!dealerNameStr) return '';
  const id = extractDealerId(dealerNameStr);
  if (!id) return dealerNameStr.trim();
  const idx = dealerNameStr.toUpperCase().lastIndexOf(id);
  return idx > 0 ? dealerNameStr.substring(0, idx).replace(/[\s-]+$/, '').trim() : dealerNameStr.trim();
}

async function main() {
  console.log('── Step 1: Reading Tab 0 ("The Streak Eligible Dealers All") ──');
  const xlsxPath = path.join(__dirname, '..', 'The Streak Sales Incentive 2026 (1) (2) (1).xlsx');
  const wb = xlsx.readFile(xlsxPath);

  const streakSheetName = wb.SheetNames[0];
  const streakRows = xlsx.utils.sheet_to_json(wb.Sheets[streakSheetName]);
  console.log(`Sheet "${streakSheetName}": ${streakRows.length} rows`);

  const streakMap = new Map();
  let missingIds = 0;

  for (const row of streakRows) {
    const rawName = row['Dealername'];
    const id = extractDealerId(rawName);
    if (!id) {
      console.warn(`Could not extract ID from "${rawName}"`);
      missingIds++;
      continue;
    }

    streakMap.set(id, {
      rawName: rawName,
      excelName: extractDealerName(rawName),
      rep: row['Dealerrepresentative'] || '',
      enrollmentSerial: row['Enrollmentdate Date'],
      lastBookedSerial: row['Bookeddate Max'],
      totalApps: row['Applicationid Count Distinct'] || 0,
      totalApproved: row['Wasapprovedsum'] || 0,
      totalDeclined: row['Wasdeclinedsum'] || 0,
      totalContracted: row['Wascontractedsum'] || 0,
      totalBooked: row['Wasbookedsum'] || 0,
      totalApprovedNotBooked: row['Wasapprovednotbookedsum'] || 0,
    });
  }

  console.log(`Unique Streak Dark Dealers identified: ${streakMap.size} (missing: ${missingIds})`);

  console.log('\n── Step 2: Connecting to MongoDB and fetching database records ──');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const streakIds = [...streakMap.keys()];

  // Indexed query on DealerLocation
  console.time('DealerLocation fetch');
  const locations = await DealerLocation.find({ dealerId: { $in: streakIds } }).lean();
  console.timeEnd('DealerLocation fetch');
  const locByDealerId = new Map(locations.map(l => [l.dealerId, l]));
  console.log(`DealerLocation matched: ${locations.length}/${streakIds.length}`);

  // Query DealerProfile
  console.time('DealerProfile fetch');
  const profiles = await DealerProfile.find({ clientDealerId: { $in: streakIds } }).lean();
  console.timeEnd('DealerProfile fetch');
  const profByDealerId = new Map(profiles.map(p => [p.clientDealerId, p]));
  console.log(`DealerProfile matched: ${profiles.length}/${streakIds.length}`);

  // Latest snapshot per dealer location
  const locObjectIds = locations.map(l => l._id);
  console.time('DailyDealerSnapshot aggregate');
  const snapshots = await DailyDealerSnapshot.aggregate([
    { $match: { dealerLocation: { $in: locObjectIds } } },
    { $sort: { dealerLocation: 1, reportDate: -1 } },
    { $group: {
        _id: '$dealerLocation',
        reportDate: { $first: '$reportDate' },
        lastBookedDate: { $first: '$lastBookedDate' },
        daysSinceLastBooking: { $first: '$daysSinceLastBooking' },
        lastApplicationDate: { $first: '$lastApplicationDate' },
        daysSinceLastApplication: { $first: '$daysSinceLastApplication' },
        activityStatus: { $first: '$activityStatus' },
    }}
  ]).allowDiskUse(true);
  console.timeEnd('DailyDealerSnapshot aggregate');
  const snapByLocId = new Map(snapshots.map(s => [s._id.toString(), s]));
  console.log(`Latest Snapshots matched: ${snapshots.length}`);

  // ── Step 3: Build enriched dealer records ──
  console.log('\n── Step 3: Merging CRM, Badger, and snapshot data ──');
  const now = new Date();
  const results = [];

  for (const [dealerId, excel] of streakMap) {
    const loc = locByDealerId.get(dealerId);
    const prof = profByDealerId.get(dealerId);
    const snap = loc ? snapByLocId.get(loc._id.toString()) : null;

    const allContacts = [];
    if (loc?.contacts?.length) allContacts.push(...loc.contacts);
    if (prof?.contacts?.length) {
      for (const pc of prof.contacts) {
        const isDupe = allContacts.some(c =>
          (c.name && pc.name && c.name.toLowerCase() === pc.name.toLowerCase()) ||
          (c.email && pc.email && c.email.toLowerCase() === pc.email.toLowerCase())
        );
        if (!isDupe) allContacts.push(pc);
      }
    }

    const dbLastBooked = snap?.lastBookedDate || null;
    const excelLastBooked = excelDateToJS(excel.lastBookedSerial);
    const effectiveLastBooked = excelLastBooked || dbLastBooked;
    const daysSinceBooking = effectiveLastBooked
      ? Math.floor((now - new Date(effectiveLastBooked)) / 86400000)
      : (snap?.daysSinceLastBooking ?? 9999);

    results.push({
      dealer_id: dealerId,
      dealer_name: loc?.dealerName || excel.excelName,
      dba: loc?.dba || '',
      dealer_group: loc?.dealerGroupName || '',
      assigned_rep: prof?.assignedRep || excel.rep,
      address: loc?.dealerAddress || '',
      city: loc?.dealerCity || '',
      state: loc?.dealerState || loc?.statePrefix || '',
      zip: loc?.dealerPostalCode || '',
      dealer_phone: loc?.dealerPhoneNumber || '',
      dealer_fax: loc?.dealerFaxNumber || '',
      contact_names: allContacts.map(c => c.name).filter(Boolean).join(' | '),
      contact_titles: allContacts.map(c => c.title).filter(Boolean).join(' | '),
      contact_phones: allContacts.map(c => c.phone).filter(Boolean).join(' | '),
      contact_emails: allContacts.map(c => c.email).filter(Boolean).join(' | '),
      badger_account_owner: loc?.badgerData?.accountOwner || prof?.badgerData?.accountOwner || '',
      badger_notes: loc?.badgerData?.notes || prof?.badgerData?.notes || '',
      badger_last_checkin: fmtDate(loc?.badgerData?.lastCheckinDate || prof?.badgerData?.lastCheckinDate),
      enrollment_date: fmtDate(loc?.enrollmentDate || excelDateToJS(excel.enrollmentSerial)),
      activated_date: fmtDate(loc?.activatedDate),
      deactivated_date: fmtDate(loc?.deactivatedDate),
      system_status: loc?.systemStatus || '',
      system_status_reason: loc?.systemStatusReason || '',
      snapshot_activity_status: snap?.activityStatus || '',
      snapshot_date: fmtDate(snap?.reportDate),
      total_apps_excel: excel.totalApps,
      total_approved_excel: excel.totalApproved,
      total_booked_excel: excel.totalBooked,
      last_booked_date: fmtDate(effectiveLastBooked),
      days_since_last_booking: daysSinceBooking,
      last_app_date: fmtDate(snap?.lastApplicationDate),
      days_since_last_app: snap?.daysSinceLastApplication ?? '',
      relationship_demand: prof?.relationshipDemand || '',
      urgency_status: prof?.urgencyStatus || '',
      last_visit_date: fmtDate(prof?.lastVisitDate),
      days_since_last_visit: prof?.daysSinceLastVisit ?? '',
      last_touch_date: fmtDate(prof?.lastTouchDate),
      last_touch_type: prof?.lastTouchType || '',
      is_active_dealertrack: loc?.isActiveForDealerTrack ?? '',
      is_active_routeone: loc?.isActiveForRouteOne ?? '',
      collateral_type: loc?.collateralType || '',
      region: loc?.region || '',
    });
  }

  // Sort by days_since_last_booking descending (longest dark first)
  results.sort((a, b) => b.days_since_last_booking - a.days_since_last_booking);

  // ── Step 4: Write CSV output ──
  const headers = Object.keys(results[0] || {});
  const csvLines = [headers.map(csvEscape).join(',')];
  for (const row of results) {
    csvLines.push(headers.map(h => csvEscape(row[h])).join(','));
  }
  const csvContent = csvLines.join('\n');

  const dataDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  // 1. Backup old dark_dealers_for_scrubbing.csv if it exists
  const targetPath = path.join(dataDir, 'dark_dealers_for_scrubbing.csv');
  const backupPath = path.join(dataDir, 'dark_dealers_for_scrubbing_905_backup.csv');
  if (fs.existsSync(targetPath) && !fs.existsSync(backupPath)) {
    fs.copyFileSync(targetPath, backupPath);
    console.log(`\nBacked up previous 905 list to: ${backupPath}`);
  }

  // 2. Write dedicated streak_dealers_for_scrubbing_506.csv
  const dedicatedPath = path.join(dataDir, 'streak_dealers_for_scrubbing_506.csv');
  fs.writeFileSync(dedicatedPath, csvContent, 'utf8');
  console.log(`Saved dedicated file: ${dedicatedPath}`);

  // 3. Update dark_dealers_for_scrubbing.csv so pipeline runs seamlessly
  fs.writeFileSync(targetPath, csvContent, 'utf8');
  console.log(`Updated active scrubbing file: ${targetPath}`);

  console.log(`\n✅ Successfully exported ${results.length} Streak Dark Dealers ready for enrichment!`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
