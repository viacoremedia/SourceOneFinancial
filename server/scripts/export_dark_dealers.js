/**
 * Export Dark Dealers CSV — Joseph's Excel list enriched with our DB
 * 
 * Source: "The Streak Sales Incentive 2026" Excel
 *   Tab 2 (1421 all dealers) minus Tab 1 (506 active) = 905 dark dealers
 * Enriched with: DealerLocation, DealerProfile, latest DailyDealerSnapshot
 * 
 * Usage: cd server && node scripts/export_dark_dealers.js
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
  const parts = dealerNameStr.split(/\s*-\s*/);
  for (let i = parts.length - 1; i >= 0; i--) {
    const c = parts[i].trim().toUpperCase();
    if (/^[A-Z]+\d+$/.test(c)) return c;
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
  // ── 1. Read Excel → dark dealer IDs ──
  const xlsxPath = path.join(__dirname, '..', 'The Streak Sales Incentive 2026 (1) (2) (1).xlsx');
  const wb = xlsx.readFile(xlsxPath);

  const activeRows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  const allRows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[1]]);
  console.log(`Tab 1 (active): ${activeRows.length} | Tab 2 (all): ${allRows.length}`);

  const activeDealerIds = new Set(activeRows.map(r => extractDealerId(r['Dealername'])).filter(Boolean));

  const darkMap = new Map();
  for (const row of allRows) {
    const id = extractDealerId(row['Dealername']);
    if (id && !activeDealerIds.has(id)) {
      darkMap.set(id, {
        excelName: extractDealerName(row['Dealername']),
        rep: row['Dealerrepresentative'] || '',
        enrollmentSerial: row['Enrollmentdate Date'],
        lastBookedSerial: row['Bookeddate Max'],
        totalApps: row['Applicationid Count Distinct'] || 0,
        totalApproved: row['Wasapprovedsum'] || 0,
        totalBooked: row['Wasbookedsum'] || 0,
      });
    }
  }
  console.log(`Dark dealers: ${darkMap.size}`);

  // ── 2. Connect & bulk-fetch ──
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const darkIds = [...darkMap.keys()];

  const locations = await DealerLocation.find({ dealerId: { $in: darkIds } }).lean();
  const locByDealerId = new Map(locations.map(l => [l.dealerId, l]));
  console.log(`Locations: ${locations.length}/${darkIds.length}`);

  const profiles = await DealerProfile.find({ clientDealerId: { $in: darkIds } }).lean();
  const profByDealerId = new Map(profiles.map(p => [p.clientDealerId, p]));
  console.log(`Profiles: ${profiles.length}/${darkIds.length}`);

  // Latest snapshot per dealer
  const locObjectIds = locations.map(l => l._id);
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
  const snapByLocId = new Map(snapshots.map(s => [s._id.toString(), s]));
  console.log(`Snapshots: ${snapshots.length}`);

  // ── 3. Build results ──
  const now = new Date();
  const results = [];

  for (const [dealerId, excel] of darkMap) {
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
    const effectiveLastBooked = dbLastBooked || excelLastBooked;
    const daysSinceBooking = effectiveLastBooked
      ? Math.floor((now - new Date(effectiveLastBooked)) / 86400000)
      : 9999;

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

  results.sort((a, b) => b.days_since_last_booking - a.days_since_last_booking);

  const headers = Object.keys(results[0] || {});
  const csvLines = [headers.map(csvEscape).join(',')];
  for (const row of results) {
    csvLines.push(headers.map(h => csvEscape(row[h])).join(','));
  }

  const outPath = path.join(__dirname, '..', 'data', 'dark_dealers_for_scrubbing.csv');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, csvLines.join('\n'), 'utf8');

  console.log(`\n✅ Done! ${results.length} dark dealers → ${outPath}`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
