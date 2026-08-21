const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });

const DealerLocation = require('../models/DealerLocation');
const Application = require('../models/Application');
const DealerCommunication = require('../models/DealerCommunication');
const DealerProfile = require('../models/DealerProfile');

function escapeCsv(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

async function exportFullAuditCsv() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB. Generating 3,940 Dealer Audit Master CSV...\n');

  const now = new Date('2026-08-21T00:00:00.000Z');
  const nowMs = now.getTime();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const START_2025 = new Date('2025-01-01T00:00:00.000Z');

  // 1. Fetch all data
  const dealers = await DealerLocation.find({ omniDealerId: { $exists: true, $ne: null } }).lean();
  const profiles = await DealerProfile.find({}).lean();
  const apps = await Application.find({ applicationDate: { $ne: null } })
    .select('clientDealerId applicationDate bookedDate status amountFinanced lender')
    .lean();
  const comms = await DealerCommunication.find({ communicationEventDatetime: { $ne: null } })
    .select('internalRelationshipId2 communicationEventDatetime communicationType')
    .lean();

  const profileMap = new Map();
  for (const p of profiles) {
    if (p.clientDealerId) profileMap.set(p.clientDealerId.trim().toUpperCase(), p);
  }

  const appsByDealer = new Map();
  for (const a of apps) {
    if (!a.clientDealerId) continue;
    const k = a.clientDealerId.trim().toUpperCase();
    if (!appsByDealer.has(k)) appsByDealer.set(k, []);
    appsByDealer.get(k).push(a);
  }

  const commsByDealer = new Map();
  for (const c of comms) {
    if (!c.internalRelationshipId2) continue;
    const k = c.internalRelationshipId2.trim().toUpperCase();
    if (!commsByDealer.has(k)) commsByDealer.set(k, []);
    commsByDealer.get(k).push(c);
  }

  const headers = [
    'Client Dealer ID',
    'Dealer Name',
    'State',
    'Assigned Rep',
    'Current Demand Bucket',
    'Pattern Type',
    'Urgency Status',
    'Confidence Score %',
    'Post-Visit Lift %',
    'Organic Ratio %',
    '2025+ Visits',
    '2025+ Applications',
    '2025+ Approvals',
    '2025+ Approval Rate %',
    '2025+ Booked Loans',
    '2025+ Booked Volume ($)',
    '2025+ Look-To-Book %',
    '2025+ Yield Per Visit ($)',
    'Last Visit Date',
    'Days Since Last Visit',
    'Last App Date',
    'Days Since Last App',
    'Last Booked Date',
    'Days Since Last Booked',
    'Last 90D Apps (Summer 2026)',
    'Last 90D Bookings',
    'Last 90D Booked Volume ($)',
    'Last 180D Apps (2026 YTD)',
    'Last 180D Bookings',
    'Last 180D Booked Volume ($)',
    'Current Activity Recency Status',
    'Decision Rationale & Flags'
  ];

  const rows = [];
  rows.push(headers.map(escapeCsv).join(','));

  let count = 0;

  for (const d of dealers) {
    const id = (d.clientDealerId || d.dealerId || '').trim().toUpperCase();
    if (!id) continue;
    count++;

    const p = profileMap.get(id);
    const dApps = appsByDealer.get(id) || [];
    const dComms = commsByDealer.get(id) || [];

    // Filter 2025+ apps & comms
    const apps2025 = dApps.filter(a => new Date(a.applicationDate) >= START_2025);
    const comms2025 = dComms.filter(c => new Date(c.communicationEventDatetime) >= START_2025);

    // Count visits
    const visits2025 = comms2025.filter(c => {
      const t = (c.communicationType || '').toLowerCase();
      return t.includes('in-person') || t.includes('visit') || t.includes('meeting');
    }).length;

    // Applications & Bookings 2025+
    const totalApps2025 = apps2025.length;
    const approvals2025 = apps2025.filter(a => a.status === 'Approved' || a.status === 'Booked').length;
    const booked2025 = apps2025.filter(a => a.status === 'Booked');
    const totalBooked2025 = booked2025.length;
    const totalVol2025 = booked2025.reduce((sum, a) => sum + (Number(a.amountFinanced) || 0), 0);

    const approvalRate2025 = totalApps2025 > 0 ? Math.round((approvals2025 / totalApps2025) * 100) : 0;
    const lookToBook2025 = totalApps2025 > 0 ? Math.round((totalBooked2025 / totalApps2025) * 100) : 0;
    const yieldPerVisit2025 = visits2025 > 0 ? Math.round(totalVol2025 / visits2025) : 0;

    // Recency calculations (All time latest)
    let lastVisitDate = null;
    for (const c of dComms) {
      const t = (c.communicationType || '').toLowerCase();
      if (t.includes('in-person') || t.includes('visit') || t.includes('meeting')) {
        const cd = new Date(c.communicationEventDatetime);
        if (!lastVisitDate || cd > lastVisitDate) lastVisitDate = cd;
      }
    }

    let lastAppDate = null;
    let lastBookedDate = null;
    for (const a of dApps) {
      const ad = new Date(a.applicationDate);
      if (!lastAppDate || ad > lastAppDate) lastAppDate = ad;
      if (a.status === 'Booked' || a.bookedDate) {
        const bd = a.bookedDate ? new Date(a.bookedDate) : ad;
        if (!lastBookedDate || bd > lastBookedDate) lastBookedDate = bd;
      }
    }

    const daysSinceLastVisit = lastVisitDate ? Math.max(0, Math.floor((nowMs - lastVisitDate.getTime()) / DAY_MS)) : 'Never';
    const daysSinceLastApp = lastAppDate ? Math.max(0, Math.floor((nowMs - lastAppDate.getTime()) / DAY_MS)) : 'Never';
    const daysSinceLastBooked = lastBookedDate ? Math.max(0, Math.floor((nowMs - lastBookedDate.getTime()) / DAY_MS)) : 'Never';

    // 90-Day & 180-Day Recency Windows (from Aug 21, 2026)
    const d90Ago = new Date(nowMs - (90 * DAY_MS));
    const d180Ago = new Date(nowMs - (180 * DAY_MS));

    const apps90D = dApps.filter(a => new Date(a.applicationDate) >= d90Ago);
    const booked90D = apps90D.filter(a => a.status === 'Booked');
    const vol90D = booked90D.reduce((sum, a) => sum + (Number(a.amountFinanced) || 0), 0);

    const apps180D = dApps.filter(a => new Date(a.applicationDate) >= d180Ago);
    const booked180D = apps180D.filter(a => a.status === 'Booked');
    const vol180D = booked180D.reduce((sum, a) => sum + (Number(a.amountFinanced) || 0), 0);

    let recencyStatus = 'Active (Last 90D)';
    if (daysSinceLastApp === 'Never') {
      recencyStatus = 'No Application History';
    } else if (typeof daysSinceLastApp === 'number') {
      if (daysSinceLastApp <= 90) {
        recencyStatus = 'Active (Last 90D)';
      } else if (daysSinceLastApp <= 180) {
        recencyStatus = 'Cooling (90-180D Silent)';
      } else if (daysSinceLastApp <= 365) {
        recencyStatus = 'Lapsed (180-365D Silent)';
      } else {
        recencyStatus = 'Dormant (>365D Silent)';
      }
    }

    const row = [
      id,
      d.dealerName || p?.dealerName || '',
      d.statePrefix || p?.statePrefix || '',
      p?.assignedRep || d.dealerRepresentative || 'House',
      (p?.relationshipDemand || 'insufficient_data').toUpperCase(),
      p?.patternType || 'unexplored',
      p?.urgencyStatus || 'not_monitored',
      p ? Math.round((p.confidenceScore || 0) * 100) : 0,
      p?.postVisitBookedLiftPct !== null && p?.postVisitBookedLiftPct !== undefined ? p.postVisitBookedLiftPct : 'N/A',
      p?.organicBookedRatio !== null && p?.organicBookedRatio !== undefined ? p.organicBookedRatio : 'N/A',
      visits2025,
      totalApps2025,
      approvals2025,
      approvalRate2025,
      totalBooked2025,
      totalVol2025,
      lookToBook2025,
      yieldPerVisit2025,
      lastVisitDate ? lastVisitDate.toISOString().slice(0, 10) : 'Never',
      daysSinceLastVisit,
      lastAppDate ? lastAppDate.toISOString().slice(0, 10) : 'Never',
      daysSinceLastApp,
      lastBookedDate ? lastBookedDate.toISOString().slice(0, 10) : 'Never',
      daysSinceLastBooked,
      apps90D.length,
      booked90D.length,
      vol90D,
      apps180D.length,
      booked180D.length,
      vol180D,
      recencyStatus,
      p?.decisionRationale ? p.decisionRationale.join(' | ') : 'No rationale computed'
    ];

    rows.push(row.map(escapeCsv).join(','));
  }

  const outputPath = path.join(__dirname, '../scratch/dealer_relationship_audit_3940.csv');
  fs.writeFileSync(outputPath, rows.join('\n'), 'utf8');

  console.log(`\n✅ SUCCESSFULLY EXPORTED ${count} DEALER ROWS TO:`);
  console.log(`   ${outputPath}`);
  console.log(`   File size: ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} MB\n`);

  await mongoose.disconnect();
}
exportFullAuditCsv().catch(e => { console.error(e); process.exit(1); });
