/**
 * Export ALL dark dealers from DB — no Excel dependency
 * 
 * All dealers who haven't booked in 6+ months (180 days), including never-booked.
 * Includes "ever_booked" column to distinguish.
 * 
 * Usage: cd server && node scripts/export_all_dark_dealers_db.js
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DealerLocation = require('../models/DealerLocation');
const DealerProfile = require('../models/DealerProfile');
const DailyDealerSnapshot = require('../models/DailyDealerSnapshot');

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

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected');

  console.log('Aggregating snapshots...');
  const snaps = await DailyDealerSnapshot.aggregate([
    { $sort: { dealerLocation: 1, reportDate: -1 } },
    { $group: {
        _id: '$dealerLocation',
        reportDate: { $first: '$reportDate' },
        lastBookedDate: { $first: '$lastBookedDate' },
        daysSinceLastBooking: { $first: '$daysSinceLastBooking' },
        lastApplicationDate: { $first: '$lastApplicationDate' },
        daysSinceLastApplication: { $first: '$daysSinceLastApplication' },
        activityStatus: { $first: '$activityStatus' },
    }},
    { $match: { $or: [
        { daysSinceLastBooking: { $gte: 180 } },
        { lastBookedDate: null }
    ]}}
  ]).allowDiskUse(true);
  console.log('Dark snapshots:', snaps.length);

  const locIds = snaps.map(s => s._id);
  const locations = await DealerLocation.find({ _id: { $in: locIds } }).lean();
  const locById = new Map(locations.map(l => [l._id.toString(), l]));
  console.log('Locations:', locations.length);

  const dealerIds = locations.map(l => l.dealerId);
  const profiles = await DealerProfile.find({ clientDealerId: { $in: dealerIds } }).lean();
  const profByDealerId = new Map(profiles.map(p => [p.clientDealerId, p]));
  console.log('Profiles:', profiles.length);

  const results = [];
  for (const snap of snaps) {
    const loc = locById.get(snap._id.toString());
    if (!loc) continue;
    const prof = profByDealerId.get(loc.dealerId);

    const allContacts = [];
    if (loc.contacts?.length) allContacts.push(...loc.contacts);
    if (prof?.contacts?.length) {
      for (const pc of prof.contacts) {
        const isDupe = allContacts.some(c =>
          (c.name && pc.name && c.name.toLowerCase() === pc.name.toLowerCase()) ||
          (c.email && pc.email && c.email.toLowerCase() === pc.email.toLowerCase())
        );
        if (!isDupe) allContacts.push(pc);
      }
    }

    results.push({
      dealer_id: loc.dealerId,
      dealer_name: loc.dealerName,
      dba: loc.dba || '',
      dealer_group: loc.dealerGroupName || '',
      assigned_rep: prof?.assignedRep || loc.dealerRepresentative || '',
      address: loc.dealerAddress || '',
      city: loc.dealerCity || '',
      state: loc.dealerState || loc.statePrefix || '',
      zip: loc.dealerPostalCode || '',
      dealer_phone: loc.dealerPhoneNumber || '',
      dealer_fax: loc.dealerFaxNumber || '',
      contact_names: allContacts.map(c => c.name).filter(Boolean).join(' | '),
      contact_titles: allContacts.map(c => c.title).filter(Boolean).join(' | '),
      contact_phones: allContacts.map(c => c.phone).filter(Boolean).join(' | '),
      contact_emails: allContacts.map(c => c.email).filter(Boolean).join(' | '),
      badger_account_owner: loc.badgerData?.accountOwner || prof?.badgerData?.accountOwner || '',
      badger_notes: loc.badgerData?.notes || prof?.badgerData?.notes || '',
      badger_last_checkin: fmtDate(loc.badgerData?.lastCheckinDate || prof?.badgerData?.lastCheckinDate),
      enrollment_date: fmtDate(loc.enrollmentDate),
      activated_date: fmtDate(loc.activatedDate),
      deactivated_date: fmtDate(loc.deactivatedDate),
      system_status: loc.systemStatus || '',
      system_status_reason: loc.systemStatusReason || '',
      snapshot_activity_status: snap.activityStatus || '',
      snapshot_date: fmtDate(snap.reportDate),
      last_booked_date: fmtDate(snap.lastBookedDate),
      days_since_last_booking: snap.daysSinceLastBooking ?? 9999,
      ever_booked: snap.lastBookedDate ? 'yes' : 'no',
      last_app_date: fmtDate(snap.lastApplicationDate),
      days_since_last_app: snap.daysSinceLastApplication ?? '',
      relationship_demand: prof?.relationshipDemand || '',
      urgency_status: prof?.urgencyStatus || '',
      last_visit_date: fmtDate(prof?.lastVisitDate),
      days_since_last_visit: prof?.daysSinceLastVisit ?? '',
      last_touch_date: fmtDate(prof?.lastTouchDate),
      last_touch_type: prof?.lastTouchType || '',
      is_active_dealertrack: loc.isActiveForDealerTrack ?? '',
      is_active_routeone: loc.isActiveForRouteOne ?? '',
      collateral_type: loc.collateralType || '',
      region: loc.region || '',
    });
  }

  results.sort((a, b) => b.days_since_last_booking - a.days_since_last_booking);

  const headers = Object.keys(results[0] || {});
  const csvLines = [headers.map(csvEscape).join(',')];
  for (const row of results) csvLines.push(headers.map(h => csvEscape(row[h])).join(','));

  const outPath = path.join(__dirname, '..', 'data', 'all_dark_dealers_db.csv');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, csvLines.join('\n'), 'utf8');

  const everBooked = results.filter(r => r.ever_booked === 'yes').length;
  const neverBooked = results.filter(r => r.ever_booked === 'no').length;
  console.log('\n✅ Done! ' + results.length + ' dark dealers');
  console.log('  Previously booked: ' + everBooked);
  console.log('  Never booked: ' + neverBooked);
  console.log('  CSV: ' + outPath);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
