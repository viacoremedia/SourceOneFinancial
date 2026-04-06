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
 * Rebuild monthly rollups for all dealers that have a snapshot on a given date.
 * Called after ingesting a new CSV file.
 * 
 * @param {Date} reportDate - The date to rebuild rollups for
 * @returns {Promise<{ rebuilt: number, errors: number }>}
 */
async function rebuildRollupsForDate(reportDate) {
    const year = reportDate.getFullYear();
    const month = reportDate.getMonth() + 1;

    // Find all distinct dealer locations with snapshots on this date
    const dealerIds = await DailyDealerSnapshot.distinct('dealerLocation', {
        reportDate: {
            $gte: new Date(year, month - 1, 1),
            $lt: new Date(year, month, 1)
        }
    });

    console.log(`  rollup: rebuilding ${dealerIds.length} rollups for ${year}-${String(month).padStart(2, '0')}`);

    let rebuilt = 0;
    let errors = 0;

    // Process in batches to avoid memory issues
    const BATCH_SIZE = 100;
    for (let i = 0; i < dealerIds.length; i += BATCH_SIZE) {
        const batch = dealerIds.slice(i, i + BATCH_SIZE);
        const promises = batch.map(async (dlId) => {
            try {
                await buildMonthlyRollup(dlId, year, month);
                rebuilt++;
            } catch (err) {
                errors++;
                console.error(`  rollup: error for dealer ${dlId}: ${err.message}`);
            }
        });
        await Promise.all(promises);
    }

    console.log(`  rollup: completed — ${rebuilt} rebuilt, ${errors} errors`);
    return { rebuilt, errors };
}

/**
 * Rebuild ALL rollups from scratch — for backfill or corrections.
 * Gets all distinct (dealerLocation, year, month) combos and rebuilds each.
 * 
 * @returns {Promise<{ rebuilt: number, errors: number }>}
 */
async function rebuildAllRollups() {
    console.log('  rollup: starting full rebuild...');

    // Get all distinct year-month combinations
    const pipeline = [
        {
            $group: {
                _id: {
                    dealerLocation: '$dealerLocation',
                    year: { $year: '$reportDate' },
                    month: { $month: '$reportDate' }
                }
            }
        }
    ];

    const combos = await DailyDealerSnapshot.aggregate(pipeline);
    console.log(`  rollup: found ${combos.length} (dealer, year, month) combinations`);

    let rebuilt = 0;
    let errors = 0;

    const BATCH_SIZE = 100;
    for (let i = 0; i < combos.length; i += BATCH_SIZE) {
        const batch = combos.slice(i, i + BATCH_SIZE);
        const promises = batch.map(async (combo) => {
            try {
                await buildMonthlyRollup(
                    combo._id.dealerLocation,
                    combo._id.year,
                    combo._id.month
                );
                rebuilt++;
            } catch (err) {
                errors++;
            }
        });
        await Promise.all(promises);

        if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= combos.length) {
            console.log(`  rollup: progress ${Math.min(i + BATCH_SIZE, combos.length)}/${combos.length}`);
        }
    }

    console.log(`  rollup: full rebuild complete — ${rebuilt} rebuilt, ${errors} errors`);
    return { rebuilt, errors };
}

module.exports = {
    buildMonthlyRollup,
    rebuildRollupsForDate,
    rebuildAllRollups
};
