/**
 * Deep dive: Where is the missing ~$18M?
 * Check S1House, all statuses, all reps, and alternative dollar fields.
 */
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const Application = require('../models/Application');

async function run() {
    const uri = (process.env.MONGODB_URI || '').trim();
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000 });
    console.log('Connected\n');

    const julyStart = new Date('2026-07-01T00:00:00.000Z');
    const julyEnd = new Date('2026-07-31T23:59:59.999Z');
    const fmt = (v) => `$${(v / 1_000_000).toFixed(2)}M`;

    // ── 1. Breakdown by Rep (bookedDate in July) ──
    console.log('=== BOOKED VOLUME BY REP (bookedDate in July) ===');
    const byRep = await Application.aggregate([
        { $match: { bookedDate: { $gte: julyStart, $lte: julyEnd }, status: 'Booked' } },
        { $group: {
            _id: { $ifNull: ['$dealerRepresentative', 'NULL/MISSING'] },
            count: { $sum: 1 },
            dollars: { $sum: { $ifNull: ['$amountFinanced', 0] } }
        }},
        { $sort: { dollars: -1 } }
    ]);
    let repTotal = 0;
    for (const r of byRep) {
        console.log(`   ${(r._id || 'NULL').padEnd(20)} ${String(r.count).padStart(5)} deals  ${fmt(r.dollars).padStart(10)}`);
        repTotal += r.dollars;
    }
    console.log(`   ${'TOTAL'.padEnd(20)} ${String(byRep.reduce((a,b)=>a+b.count,0)).padStart(5)} deals  ${fmt(repTotal).padStart(10)}\n`);

    // ── 2. Breakdown by STATUS (bookedDate in July — are there non-"Booked" funded deals?) ──
    console.log('=== ALL STATUSES with bookedDate in July (including non-Booked) ===');
    const byStatus = await Application.aggregate([
        { $match: { bookedDate: { $gte: julyStart, $lte: julyEnd } } },
        { $group: {
            _id: '$status',
            count: { $sum: 1 },
            dollars: { $sum: { $ifNull: ['$amountFinanced', 0] } }
        }},
        { $sort: { dollars: -1 } }
    ]);
    for (const s of byStatus) {
        console.log(`   ${(s._id || 'NULL').padEnd(25)} ${String(s.count).padStart(5)} deals  ${fmt(s.dollars).padStart(10)}`);
    }
    console.log();

    // ── 3. All unique statuses across the entire collection ──
    console.log('=== ALL UNIQUE STATUSES IN DATABASE ===');
    const allStatuses = await Application.distinct('status');
    console.log(`   ${allStatuses.join(', ')}\n`);

    // ── 4. Check if there are deals with amountFinanced=0 or null for Booked ──
    console.log('=== DATA QUALITY: Booked deals with no amountFinanced (bookedDate in July) ===');
    const zeroAmt = await Application.countDocuments({
        bookedDate: { $gte: julyStart, $lte: julyEnd },
        status: 'Booked',
        $or: [{ amountFinanced: null }, { amountFinanced: 0 }, { amountFinanced: { $exists: false } }]
    });
    console.log(`   Booked deals with $0 or null amountFinanced: ${zeroAmt}\n`);

    // ── 5. Check alternative dollar fields that might contribute ──
    console.log('=== ALTERNATIVE DOLLAR FIELDS (Booked, bookedDate in July) ===');
    const altFields = await Application.aggregate([
        { $match: { bookedDate: { $gte: julyStart, $lte: julyEnd }, status: 'Booked' } },
        { $group: {
            _id: null,
            amountFinanced: { $sum: { $ifNull: ['$amountFinanced', 0] } },
            invoice: { $sum: { $ifNull: ['$invoice', 0] } },
            backend: { $sum: { $ifNull: ['$backend', 0] } },
            dealerReserveAmount: { $sum: { $ifNull: ['$dealerReserveAmount', 0] } },
            cashDown: { $sum: { $ifNull: ['$cashDown', 0] } },
            totalDown: { $sum: { $ifNull: ['$totalDown', 0] } },
        }}
    ]);
    if (altFields[0]) {
        const a = altFields[0];
        console.log(`   amountFinanced:     ${fmt(a.amountFinanced)}  (what we use)`);
        console.log(`   invoice:            ${fmt(a.invoice)}`);
        console.log(`   backend:            ${fmt(a.backend)}`);
        console.log(`   dealerReserveAmt:   ${fmt(a.dealerReserveAmount)}`);
        console.log(`   cashDown:           ${fmt(a.cashDown)}`);
        console.log(`   totalDown:          ${fmt(a.totalDown)}`);
        console.log(`   invoice + backend:  ${fmt(a.invoice + a.backend)}  (possible OMNI "total deal" value)`);
    }
    console.log();

    // ── 6. Check if S1House is excluded from dashboard dealer table but NOT from exec summary ──
    console.log('=== S1HOUSE SPECIFIC (bookedDate in July) ===');
    const s1house = await Application.aggregate([
        { $match: {
            bookedDate: { $gte: julyStart, $lte: julyEnd },
            status: 'Booked',
            dealerRepresentative: { $regex: /^s1house$/i }
        }},
        { $group: {
            _id: null,
            count: { $sum: 1 },
            dollars: { $sum: { $ifNull: ['$amountFinanced', 0] } }
        }}
    ]);
    if (s1house[0]) {
        console.log(`   S1House Booked Deals: ${s1house[0].count}`);
        console.log(`   S1House Booked Volume: ${fmt(s1house[0].dollars)}`);
    } else {
        console.log('   No S1House deals found with bookedDate in July');
    }
    console.log();

    // ── 7. Deals with no rep assigned at all ──
    console.log('=== UNASSIGNED/ORPHAN DEALS (bookedDate in July, status=Booked) ===');
    const orphans = await Application.aggregate([
        { $match: {
            bookedDate: { $gte: julyStart, $lte: julyEnd },
            status: 'Booked',
            $or: [
                { dealerRepresentative: null },
                { dealerRepresentative: '' },
                { dealerRepresentative: { $exists: false } }
            ]
        }},
        { $group: {
            _id: null,
            count: { $sum: 1 },
            dollars: { $sum: { $ifNull: ['$amountFinanced', 0] } }
        }}
    ]);
    if (orphans[0]) {
        console.log(`   Orphan Booked Deals: ${orphans[0].count}`);
        console.log(`   Orphan Booked Volume: ${fmt(orphans[0].dollars)}`);
    } else {
        console.log('   No orphan deals found');
    }
    console.log();

    // ── 8. Grand total — ALL booked deals touching July by any date ──
    console.log('=== GRAND TOTAL: Every Booked deal with ANY July date ===');
    const grandTotal = await Application.aggregate([
        { $match: {
            status: 'Booked',
            $or: [
                { applicationDate: { $gte: julyStart, $lte: julyEnd } },
                { bookedDate: { $gte: julyStart, $lte: julyEnd } },
                { approvalDate: { $gte: julyStart, $lte: julyEnd } }
            ]
        }},
        { $group: {
            _id: null,
            count: { $sum: 1 },
            amountFinanced: { $sum: { $ifNull: ['$amountFinanced', 0] } },
            invoice: { $sum: { $ifNull: ['$invoice', 0] } }
        }}
    ]);
    if (grandTotal[0]) {
        console.log(`   Deals: ${grandTotal[0].count}`);
        console.log(`   amountFinanced: ${fmt(grandTotal[0].amountFinanced)}`);
        console.log(`   invoice: ${fmt(grandTotal[0].invoice)}`);
    }

    await mongoose.disconnect();
    process.exit(0);
}

run().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
