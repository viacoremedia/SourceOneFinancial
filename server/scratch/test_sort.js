require('dotenv').config();
const mongoose = require('mongoose');
const DealerLocation = require('../models/DealerLocation');
const DealerProfile = require('../models/DealerProfile');
const DailyDealerSnapshot = require('../models/DailyDealerSnapshot');

async function test() {
  const start = Date.now();
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB in', Date.now() - start, 'ms');

  const t1 = Date.now();
  const latestDatesAgg = await DailyDealerSnapshot.aggregate([
    { $group: { _id: '$reportDate' } },
    { $sort: { _id: -1 } },
    { $limit: 1 },
  ]);
  const latestDate = latestDatesAgg.length > 0 ? latestDatesAgg[0]._id : null;

  const locationPipeline = [
    { $match: { dealerGroup: null } },
    ...(latestDate ? [{
      $lookup: {
        from: 'dailydealersnapshots',
        let: { locId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$dealerLocation', '$$locId'] },
                  { $eq: ['$reportDate', latestDate] }
                ]
              }
            }
          },
          { $limit: 1 }
        ],
        as: 'snapshotArr'
      }
    },
    { $addFields: { latestSnapshot: { $arrayElemAt: ['$snapshotArr', 0] } } },
    { $project: { snapshotArr: 0 } }] : [])
  ];

  const matchingLocations = await DealerLocation.aggregate(locationPipeline);
  console.log(`Fetched ${matchingLocations.length} locations in`, Date.now() - t1, 'ms');

  const t2 = Date.now();
  const allLocIds = matchingLocations.map(l => l._id);
  const allClientIds = matchingLocations.map(l => (l.clientDealerId || l.dealerId || '').trim().toUpperCase()).filter(Boolean);
  const drdProfiles = await DealerProfile.find({
    $or: [
      { dealerLocation: { $in: allLocIds } },
      { clientDealerId: { $in: allClientIds } }
    ]
  }).select('dealerLocation clientDealerId lastVisitDate daysSinceLastVisit postVisitBookedLiftPct lifetimeYieldPerVisit lifetimeStats').lean();

  const drdMap = new Map();
  for (const p of drdProfiles) {
    if (p.dealerLocation) drdMap.set(p.dealerLocation.toString(), p);
    if (p.clientDealerId) drdMap.set(p.clientDealerId.trim().toUpperCase(), p);
  }

  for (const loc of matchingLocations) {
    const key = (loc.clientDealerId || loc.dealerId || '').trim().toUpperCase();
    const p = drdMap.get(loc._id.toString()) || (key ? drdMap.get(key) : null);
    loc.drd = p ? {
      lastVisitDate: p.lastVisitDate || null,
      daysSinceLastVisit: p.daysSinceLastVisit != null ? p.daysSinceLastVisit : null,
      postVisitLiftPct: p.postVisitBookedLiftPct != null ? p.postVisitBookedLiftPct : null,
      yieldPerVisit: p.lifetimeYieldPerVisit != null ? p.lifetimeYieldPerVisit : null,
      totalVisits: p.lifetimeStats?.totalVisits || 0
    } : null;
  }
  console.log(`Attached DRD profiles to ${matchingLocations.length} locations in`, Date.now() - t2, 'ms');

  // Test sorting by postVisitLift desc
  matchingLocations.sort((a, b) => {
    const aVal = a.drd?.postVisitLiftPct ?? -99999999;
    const bVal = b.drd?.postVisitLiftPct ?? -99999999;
    if (aVal !== bVal) return bVal - aVal;
    return (a.dealerName || '').localeCompare(b.dealerName || '');
  });

  console.log('Top 5 dealers by Visit Lift (desc):');
  for (const d of matchingLocations.slice(0, 5)) {
    console.log(`- ${d.dealerName}: lift=${d.drd?.postVisitLiftPct}%, yield=$${d.drd?.yieldPerVisit}, lastVisit=${d.drd?.lastVisitDate}`);
  }

  // Test sorting by lastVisit asc
  matchingLocations.sort((a, b) => {
    const aVal = a.drd?.daysSinceLastVisit ?? 99999999;
    const bVal = b.drd?.daysSinceLastVisit ?? 99999999;
    if (aVal !== bVal) return aVal - bVal;
    return (a.dealerName || '').localeCompare(b.dealerName || '');
  });

  console.log('\nTop 5 dealers by Last Visit (asc = most recent):');
  for (const d of matchingLocations.slice(0, 5)) {
    console.log(`- ${d.dealerName}: daysSince=${d.drd?.daysSinceLastVisit}d, lastVisit=${d.drd?.lastVisitDate}`);
  }

  // Test sorting by yieldPerVisit desc
  matchingLocations.sort((a, b) => {
    const aVal = a.drd?.yieldPerVisit ?? -99999999;
    const bVal = b.drd?.yieldPerVisit ?? -99999999;
    if (aVal !== bVal) return bVal - aVal;
    return (a.dealerName || '').localeCompare(b.dealerName || '');
  });

  console.log('\nTop 5 dealers by Yield/Visit (desc):');
  for (const d of matchingLocations.slice(0, 5)) {
    console.log(`- ${d.dealerName}: yield=$${d.drd?.yieldPerVisit}, lift=${d.drd?.postVisitLiftPct}%`);
  }

  process.exit(0);
}

test().catch(e => { console.error(e); process.exit(1); });
