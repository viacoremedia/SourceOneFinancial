/**
 * Rollup Service
 * 
 * Computes pre-aggregated monthly statistics from DailyDealerSnapshot documents.
 * Detects "new event" counts by comparing consecutive snapshots within a month.
 * 
 * @module services/rollupService
 */

const DailyDealerSnapshot = require('../models/DailyDealerSnapshot');
const MonthlyDealerRollup = require('../models/MonthlyDealerRollup');

/**
 * Build (or rebuild) a monthly rollup for a single dealer location.
 * 
 * @param {string} dealerLocationId - ObjectId of the DealerLocation
 * @param {number} year - e.g. 2026
 * @param {number} month - 1-12
 * @returns {Promise<Object|null>} The upserted MonthlyDealerRollup doc, or null if no snapshots
 */
async function buildMonthlyRollup(dealerLocationId, year, month) {
    // Date range for this month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1); // first day of NEXT month

    // Fetch all snapshots for this dealer in this month, sorted by date
    const snapshots = await DailyDealerSnapshot.find({
        dealerLocation: dealerLocationId,
        reportDate: { $gte: startDate, $lt: endDate }
    }).sort({ reportDate: 1 }).lean();

    if (snapshots.length === 0) return null;

    // Compute metrics
    let daysActive = 0;
    let daysInactive30 = 0;
    let daysInactive60 = 0;
    let daysLongInactive = 0;
    let reactivationEvents = 0;
    let applicationDatesChanged = 0;
    let approvalDatesChanged = 0;
    let bookingDatesChanged = 0;

    const daysSinceAppValues = [];
    const daysSinceApprovalValues = [];
    const daysSinceBookingValues = [];

    for (let i = 0; i < snapshots.length; i++) {
        const snap = snapshots[i];
        const prev = i > 0 ? snapshots[i - 1] : null;

        // Activity status counts
        switch (snap.activityStatus) {
            case 'active': daysActive++; break;
            case '30d_inactive': daysInactive30++; break;
            case '60d_inactive': daysInactive60++; break;
            case 'long_inactive': daysLongInactive++; break;
        }

        // Reactivation events
        if (snap.reactivatedAfterVisit) {
            reactivationEvents++;
        }

        // Detect date changes by comparing with previous snapshot
        if (prev) {
            if (snap.lastApplicationDate && prev.lastApplicationDate &&
                snap.lastApplicationDate.getTime() !== prev.lastApplicationDate.getTime()) {
                applicationDatesChanged++;
            }
            if (snap.lastApprovalDate && prev.lastApprovalDate &&
                snap.lastApprovalDate.getTime() !== prev.lastApprovalDate.getTime()) {
                approvalDatesChanged++;
            }
            if (snap.lastBookedDate && prev.lastBookedDate &&
                snap.lastBookedDate.getTime() !== prev.lastBookedDate.getTime()) {
                bookingDatesChanged++;
            }
        }

        // Collect numeric values for averages
        if (snap.daysSinceLastApplication != null) {
            daysSinceAppValues.push(snap.daysSinceLastApplication);
        }
        if (snap.daysSinceLastApproval != null) {
            daysSinceApprovalValues.push(snap.daysSinceLastApproval);
        }
        if (snap.daysSinceLastBooking != null) {
            daysSinceBookingValues.push(snap.daysSinceLastBooking);
        }
    }

    const avg = arr => arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100 : null;
    const min = arr => arr.length > 0 ? Math.min(...arr) : null;
    const max = arr => arr.length > 0 ? Math.max(...arr) : null;

    const metrics = {
        daysActive,
        daysInactive30,
        daysInactive60,
        daysLongInactive,
        totalSnapshotDays: snapshots.length,
        applicationDatesChanged,
        approvalDatesChanged,
        bookingDatesChanged,
        reactivationEvents,
        avgDaysSinceLastApp: avg(daysSinceAppValues),
        minDaysSinceLastApp: min(daysSinceAppValues),
        maxDaysSinceLastApp: max(daysSinceAppValues),
        avgDaysSinceLastApproval: avg(daysSinceApprovalValues),
        avgDaysSinceLastBooking: avg(daysSinceBookingValues)
    };

    // Upsert the rollup
    const rollup = await MonthlyDealerRollup.findOneAndUpdate(
        { dealerLocation: dealerLocationId, year, month },
        {
            $set: {
                dealerGroup: snapshots[0].dealerGroup || null,
                metrics,
                updatedAt: new Date()
            }
        },
        { upsert: true, returnDocument: 'after', lean: true }
    );

    return rollup;
}

/**
 * High-speed in-memory rebuild of all monthly rollups for a specific month.
 * Fetches all snapshots in 1 query, groups in-memory, and writes in bulk.
 * 
 * @param {number} year - e.g. 2026
 * @param {number} month - 1-12
 * @returns {Promise<{ rebuilt: number, errors: number }>}
 */
async function buildMonthlyRollupsForMonth(year, month) {
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 1));

    console.log(`  rollup: fast-rebuilding rollups for ${year}-${String(month).padStart(2, '0')}...`);

    const snapshots = await DailyDealerSnapshot.find({
        reportDate: { $gte: startDate, $lt: endDate }
    }).sort({ dealerLocation: 1, reportDate: 1 }).lean();

    if (snapshots.length === 0) {
        console.log(`  rollup: no snapshots found for ${year}-${String(month).padStart(2, '0')}`);
        return { rebuilt: 0, errors: 0 };
    }

    // Group snapshots by dealerLocation
    const dealerMap = new Map();
    for (const snap of snapshots) {
        const dlId = snap.dealerLocation.toString();
        if (!dealerMap.has(dlId)) {
            dealerMap.set(dlId, []);
        }
        dealerMap.get(dlId).push(snap);
    }

    const avg = arr => arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100 : null;
    const min = arr => arr.length > 0 ? Math.min(...arr) : null;
    const max = arr => arr.length > 0 ? Math.max(...arr) : null;

    const bulkOps = [];
    for (const [dlId, snaps] of dealerMap.entries()) {
        let daysActive = 0;
        let daysInactive30 = 0;
        let daysInactive60 = 0;
        let daysLongInactive = 0;
        let reactivationEvents = 0;
        let applicationDatesChanged = 0;
        let approvalDatesChanged = 0;
        let bookingDatesChanged = 0;

        const daysSinceAppValues = [];
        const daysSinceApprovalValues = [];
        const daysSinceBookingValues = [];

        for (let i = 0; i < snaps.length; i++) {
            const snap = snaps[i];
            const prev = i > 0 ? snaps[i - 1] : null;

            switch (snap.activityStatus) {
                case 'active': daysActive++; break;
                case '30d_inactive': daysInactive30++; break;
                case '60d_inactive': daysInactive60++; break;
                case 'long_inactive': daysLongInactive++; break;
            }

            if (snap.reactivatedAfterVisit) {
                reactivationEvents++;
            }

            if (prev) {
                if (snap.lastApplicationDate && prev.lastApplicationDate &&
                    snap.lastApplicationDate.getTime() !== prev.lastApplicationDate.getTime()) {
                    applicationDatesChanged++;
                }
                if (snap.lastApprovalDate && prev.lastApprovalDate &&
                    snap.lastApprovalDate.getTime() !== prev.lastApprovalDate.getTime()) {
                    approvalDatesChanged++;
                }
                if (snap.lastBookedDate && prev.lastBookedDate &&
                    snap.lastBookedDate.getTime() !== prev.lastBookedDate.getTime()) {
                    bookingDatesChanged++;
                }
            }

            if (snap.daysSinceLastApplication != null) daysSinceAppValues.push(snap.daysSinceLastApplication);
            if (snap.daysSinceLastApproval != null) daysSinceApprovalValues.push(snap.daysSinceLastApproval);
            if (snap.daysSinceLastBooking != null) daysSinceBookingValues.push(snap.daysSinceLastBooking);
        }

        const metrics = {
            daysActive,
            daysInactive30,
            daysInactive60,
            daysLongInactive,
            totalSnapshotDays: snaps.length,
            applicationDatesChanged,
            approvalDatesChanged,
            bookingDatesChanged,
            reactivationEvents,
            avgDaysSinceLastApp: avg(daysSinceAppValues),
            minDaysSinceLastApp: min(daysSinceAppValues),
            maxDaysSinceLastApp: max(daysSinceAppValues),
            avgDaysSinceLastApproval: avg(daysSinceApprovalValues),
            avgDaysSinceLastBooking: avg(daysSinceBookingValues)
        };

        bulkOps.push({
            updateOne: {
                filter: { dealerLocation: dlId, year, month },
                update: {
                    $set: {
                        dealerGroup: snaps[0].dealerGroup || null,
                        metrics,
                        updatedAt: new Date()
                    }
                },
                upsert: true
            }
        });
    }

    // Execute in batches of 2000
    const BATCH_SIZE = 2000;
    let rebuilt = 0;
    let errors = 0;
    for (let i = 0; i < bulkOps.length; i += BATCH_SIZE) {
        try {
            const batch = bulkOps.slice(i, i + BATCH_SIZE);
            const res = await MonthlyDealerRollup.bulkWrite(batch, { ordered: false });
            rebuilt += (res.upsertedCount || 0) + (res.modifiedCount || 0);
        } catch (err) {
            errors++;
            console.error(`  rollup: batch write error for ${year}-${month}: ${err.message}`);
        }
    }

    console.log(`  rollup: completed ${year}-${String(month).padStart(2, '0')} — ${rebuilt} rebuilt, ${errors} errors`);
    return { rebuilt, errors };
}

/**
 * Rebuild monthly rollups for all dealers that have a snapshot on a given date.
 * Called after ingesting a new CSV file.
 * 
 * @param {Date} reportDate - The date to rebuild rollups for
 * @returns {Promise<{ rebuilt: number, errors: number }>}
 */
async function rebuildRollupsForDate(reportDate) {
    const d = new Date(reportDate);
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    return buildMonthlyRollupsForMonth(year, month);
}

/**
 * Rebuild monthly rollups for all months spanned by a date range.
 * 
 * @param {Date|string} fromDate - Range start
 * @param {Date|string} toDate - Range end
 * @returns {Promise<{ totalRebuilt: number, monthsProcessed: number, details: Array }>}
 */
async function rebuildRollupsForRange(fromDate, toDate) {
    const start = new Date(fromDate);
    const end = new Date(toDate);

    const startYear = start.getUTCFullYear();
    const startMonth = start.getUTCMonth() + 1;
    const endYear = end.getUTCFullYear();
    const endMonth = end.getUTCMonth() + 1;

    console.log(`\n=== ROLLUP RANGE REBUILD: ${startYear}-${String(startMonth).padStart(2, '0')} to ${endYear}-${String(endMonth).padStart(2, '0')} ===`);

    const monthsToProcess = [];
    let curr = new Date(Date.UTC(startYear, startMonth - 1, 1));
    const last = new Date(Date.UTC(endYear, endMonth - 1, 1));

    while (curr <= last) {
        monthsToProcess.push({
            year: curr.getUTCFullYear(),
            month: curr.getUTCMonth() + 1
        });
        curr.setUTCMonth(curr.getUTCMonth() + 1);
    }

    let totalRebuilt = 0;
    let totalErrors = 0;
    const details = [];

    for (const { year, month } of monthsToProcess) {
        const res = await buildMonthlyRollupsForMonth(year, month);
        totalRebuilt += res.rebuilt;
        totalErrors += res.errors;
        details.push({ year, month, ...res });
    }

    console.log(`✓ ROLLUP RANGE REBUILD COMPLETE: ${totalRebuilt} rollups across ${monthsToProcess.length} month(s)\n`);
    return { totalRebuilt, totalErrors, monthsProcessed: monthsToProcess.length, details };
}

/**
 * Rebuild ALL rollups from scratch — for backfill or corrections.
 * Gets all distinct (dealerLocation, year, month) combos and rebuilds each.
 * 
 * @returns {Promise<{ rebuilt: number, errors: number }>}
 */
async function rebuildAllRollups() {
    console.log('  rollup: starting full rebuild using monthly aggregations...');

    // Get all distinct year-month combinations
    const pipeline = [
        {
            $group: {
                _id: {
                    year: { $year: '$reportDate' },
                    month: { $month: '$reportDate' }
                }
            }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
    ];

    const months = await DailyDealerSnapshot.aggregate(pipeline);
    console.log(`  rollup: found ${months.length} distinct year/month periods`);

    let totalRebuilt = 0;
    let totalErrors = 0;

    for (const m of months) {
        const res = await buildMonthlyRollupsForMonth(m._id.year, m._id.month);
        totalRebuilt += res.rebuilt;
        totalErrors += res.errors;
    }

    console.log(`  rollup: full rebuild complete — ${totalRebuilt} rebuilt, ${totalErrors} errors`);
    return { rebuilt: totalRebuilt, errors: totalErrors };
}

module.exports = {
    buildMonthlyRollup,
    buildMonthlyRollupsForMonth,
    rebuildRollupsForDate,
    rebuildRollupsForRange,
    rebuildAllRollups
};
