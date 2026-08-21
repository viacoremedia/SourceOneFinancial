const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
const Application = require('../models/Application');

async function testWithCap() {
  await mongoose.connect(process.env.MONGODB_URI);
  const endD = new Date('2026-07-21T23:59:59.999Z');
  const res = await Application.aggregate([
    { $match: { applicationDate: { $gte: new Date('2026-07-01'), $lte: endD } } },
    {
      $group: {
        _id: null,
        totalApps: { $sum: 1 },
        allBookedCount: { $sum: { $cond: [{ $eq: ['$status', 'Booked'] }, 1, 0] } },
        allBookedVolume: { $sum: { $cond: [{ $eq: ['$status', 'Booked'] }, { $ifNull: ['$amountFinanced', 0] }, 0] } },
        cappedBookedCount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$status', 'Booked'] },
                  { $or: [{ $eq: ['$bookedDate', null] }, { $lte: ['$bookedDate', endD] }] }
                ]
              },
              1,
              0
            ]
          }
        },
        cappedBookedVolume: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$status', 'Booked'] },
                  { $or: [{ $eq: ['$bookedDate', null] }, { $lte: ['$bookedDate', endD] }] }
                ]
              },
              { $ifNull: ['$amountFinanced', 0] },
              0
            ]
          }
        }
      }
    }
  ]);
  console.log('JULY 1-21 APPS MATURITY COMPARISON:');
  console.log(JSON.stringify(res[0], null, 2));

  // Now let's see August 1-21
  const augEndD = new Date('2026-08-21T23:59:59.999Z');
  const augRes = await Application.aggregate([
    { $match: { applicationDate: { $gte: new Date('2026-08-01'), $lte: augEndD } } },
    {
      $group: {
        _id: null,
        totalApps: { $sum: 1 },
        bookedCount: { $sum: { $cond: [{ $eq: ['$status', 'Booked'] }, 1, 0] } },
        bookedVolume: { $sum: { $cond: [{ $eq: ['$status', 'Booked'] }, { $ifNull: ['$amountFinanced', 0] }, 0] } }
      }
    }
  ]);
  console.log('\nAUG 1-21 APPS:');
  console.log(JSON.stringify(augRes[0], null, 2));

  const oldTrendVol = ((augRes[0].bookedVolume - res[0].allBookedVolume) / res[0].allBookedVolume * 100).toFixed(1) + '%';
  const newTrendVol = ((augRes[0].bookedVolume - res[0].cappedBookedVolume) / res[0].cappedBookedVolume * 100).toFixed(1) + '%';

  console.log('\n=== TREND COMPARISON ===');
  console.log('Uncapped (Flawed) Trend:', oldTrendVol);
  console.log('Capped (Apples-to-Apples) Trend:', newTrendVol);

  await mongoose.disconnect();
}
testWithCap().catch(e => { console.error(e); process.exit(1); });
