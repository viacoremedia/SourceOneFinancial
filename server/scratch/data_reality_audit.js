const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const DealerCommunication = require('../models/DealerCommunication');

async function checkDataReality() {
  await mongoose.connect(process.env.MONGODB_URI);

  // 1. Comms by YEAR to understand the Jeriko vs Badger Maps split
  const commsByYearType = await DealerCommunication.aggregate([
    { $addFields: { year: { $year: '$communicationEventDatetime' } } },
    { $group: {
      _id: { year: '$year', type: '$communicationType' },
      count: { $sum: 1 }
    }},
    { $sort: { '_id.year': 1, count: -1 } }
  ]);
  console.log('=== COMMS BY YEAR × TYPE ===');
  const yearMap = {};
  for (const r of commsByYearType) {
    const y = r._id.year || 'null_date';
    if (!yearMap[y]) yearMap[y] = {};
    yearMap[y][r._id.type || 'NULL'] = r.count;
  }
  console.table(yearMap);

  // 2. For null-type comms, what are their results?
  const nullTypeResults = await DealerCommunication.aggregate([
    { $match: { communicationType: null } },
    { $group: { _id: '$communicationResult1', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 20 }
  ]);
  console.log('\n=== NULL-TYPE COMMS: WHAT ARE THEIR RESULTS? ===');
  console.table(nullTypeResults);

  // 3. Date range of comms
  const dateRange = await DealerCommunication.aggregate([
    { $group: {
      _id: null,
      earliest: { $min: '$communicationEventDatetime' },
      latest: { $max: '$communicationEventDatetime' },
      total: { $sum: 1 }
    }}
  ]);
  console.log('\n=== COMMS DATE RANGE ===');
  console.log(dateRange[0]);

  // 4. Typed visits only
  const visitTypedDealers = await DealerCommunication.aggregate([
    { $match: { communicationType: { $in: ['Visit', 'Meeting'] } } },
    { $group: { _id: '$internalRelationshipId2', visitCount: { $sum: 1 } } },
    { $group: {
      _id: null,
      totalDealersWithVisits: { $sum: 1 },
      with2Plus: { $sum: { $cond: [{ $gte: ['$visitCount', 2] }, 1, 0] } },
      with3Plus: { $sum: { $cond: [{ $gte: ['$visitCount', 3] }, 1, 0] } },
      with5Plus: { $sum: { $cond: [{ $gte: ['$visitCount', 5] }, 1, 0] } },
      with10Plus: { $sum: { $cond: [{ $gte: ['$visitCount', 10] }, 1, 0] } },
      avgVisits: { $avg: '$visitCount' }
    }}
  ]);
  console.log('\n=== DEALERS WITH TYPED VISITS ONLY (Visit/Meeting) ===');
  console.log(visitTypedDealers[0]);

  // 5. Expanded visit definition (typed + inferable from results)
  const visitLikeResults = ['Met with existing contact', 'Met with new contact', 'Training completed', 'Sign up completed'];
  const expandedVisitDealers = await DealerCommunication.aggregate([
    { $match: {
      $or: [
        { communicationType: { $in: ['Visit', 'Meeting'] } },
        { communicationType: null, communicationResult1: { $in: visitLikeResults } }
      ]
    }},
    { $group: { _id: '$internalRelationshipId2', visitCount: { $sum: 1 } } },
    { $group: {
      _id: null,
      totalDealersWithVisits: { $sum: 1 },
      with2Plus: { $sum: { $cond: [{ $gte: ['$visitCount', 2] }, 1, 0] } },
      with3Plus: { $sum: { $cond: [{ $gte: ['$visitCount', 3] }, 1, 0] } },
      with5Plus: { $sum: { $cond: [{ $gte: ['$visitCount', 5] }, 1, 0] } },
      with10Plus: { $sum: { $cond: [{ $gte: ['$visitCount', 10] }, 1, 0] } },
      avgVisits: { $avg: '$visitCount' }
    }}
  ]);
  console.log('\n=== DEALERS WITH EXPANDED VISITS (typed + "Met with" results) ===');
  console.log(expandedVisitDealers[0]);

  // 6. Source system breakdown
  const sourceSystems = await DealerCommunication.aggregate([
    { $group: { _id: '$sourceSystem', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);
  console.log('\n=== SOURCE SYSTEMS ===');
  console.table(sourceSystems);

  // 7. 2025 vs 2026 type distributions side by side
  const y2025 = await DealerCommunication.aggregate([
    { $match: { communicationEventDatetime: { $gte: new Date('2025-01-01'), $lt: new Date('2026-01-01') } } },
    { $group: { _id: '$communicationType', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);
  const y2026 = await DealerCommunication.aggregate([
    { $match: { communicationEventDatetime: { $gte: new Date('2026-01-01') } } },
    { $group: { _id: '$communicationType', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);
  console.log('\n=== 2025 COMMS BY TYPE (Jeriko era) ===');
  console.table(y2025);
  console.log('\n=== 2026 COMMS BY TYPE (Badger Maps era) ===');
  console.table(y2026);

  // 8. Monthly comms volume to see coverage density
  const monthlyVol = await DealerCommunication.aggregate([
    { $addFields: { ym: { $dateToString: { format: '%Y-%m', date: '$communicationEventDatetime' } } } },
    { $group: { _id: '$ym', total: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);
  console.log('\n=== MONTHLY COMMS VOLUME ===');
  console.table(monthlyVol);

  await mongoose.disconnect();
}

checkDataReality().catch(e => { console.error(e); process.exit(1); });
