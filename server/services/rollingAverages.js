/**
 * Rolling Averages Service
 *
 * Computes 7-day and 30-day rolling averages from DailyDealerSnapshot data.
 * Windows are based on the N most recent distinct report dates (not calendar
 * days) to handle data gaps gracefully.
 *
 * Three core functions:
 *   - computeNetworkRollingAvg  — company-wide or state-filtered averages
 *   - computeRepScorecard       — per-rep breakdown with dealer counts + churn
 *   - computeStatusFlows        — churn velocity (gained/lost/reactivated per day)
 *
 * @module services/rollingAverages
 */

const DailyDealerSnapshot = require('../models/DailyDealerSnapshot');
const DealerLocation = require('../models/DealerLocation');
const SalesBudget = require('../models/SalesBudget');
const { computeHeatScores } = require('./heatIndex');

// ── Helpers ──

/**
 * Get the N most recent distinct report dates, plus the N dates before that
 * (the "previous window") for period-over-period delta computation.
 *
 * @param {number} windowSize - Number of dates in each window
 * @returns {Promise<{ currentDates: Date[], previousDates: Date[] }>}
 */
async function getWindowDates(windowSize) {
    // Fetch 2x the window to get both current + previous
    const allDates = await DailyDealerSnapshot.aggregate([
        { $group: { _id: '$reportDate' } },
        { $sort: { _id: -1 } },
        { $limit: windowSize * 2 },
    ]);

    const sorted = allDates.map(d => d._id).sort((a, b) => b - a);
    const currentDates = sorted.slice(0, windowSize);
    const previousDates = sorted.slice(windowSize, windowSize * 2);

    return { currentDates, previousDates };
}

/**
 * Build a match stage that optionally filters by state prefixes.
 * Joins through DealerLocation to get location IDs for the given states.
 *
 * @param {string[]|null} states - Optional state prefix filter (e.g. ['TX', 'FL'])
 * @returns {Promise<Object|null>} dealerLocation $in filter or null
 */
async function buildStateFilter(states) {
    if (!states || states.length === 0) return null;
    const locations = await DealerLocation.find(
        { statePrefix: { $in: states } }
    ).select('_id').lean();
    return { $in: locations.map(l => l._id) };
}

/**
 * Aggregate the 5 core rolling avg metrics from snapshots matching a date set.
 *
 * @param {Date[]} dates - Report dates to include
 * @param {Object|null} locationFilter - Optional { $in: [...ids] } filter
 * @param {string[]|null} statusFilter - Optional activity status filter (e.g. ['active'])
 * @param {string} activityMode - 'application' | 'approval' | 'booking' — which field drives status
 * @returns {Promise<Object>} Raw aggregated metrics
 */
async function aggregateMetrics(dates, locationFilter, statusFilter = null, activityMode = 'application') {
    if (dates.length === 0) {
        return {
            avgDaysSinceApp: null,
            avgDaysSinceApproval: null,
            avgDaysSinceBooking: null,
            avgContactDays: null,
            avgVisitResponse: null,
        };
    }

    const match = { reportDate: { $in: dates } };
    if (locationFilter) match.dealerLocation = locationFilter;

    // For 'application' mode, use the pre-stored activityStatus field (fastest path)
    // For 'approval'/'booking', compute status dynamically from the "days since" field
    if (statusFilter && statusFilter.length > 0) {
        if (activityMode === 'application') {
            match.activityStatus = { $in: statusFilter };
        }
        // For other modes, we add a computed filter stage after $match (see pipeline below)
    }

    // Build pipeline stages
    const pipeline = [{ $match: match }];

    // For non-application modes with a status filter, compute status dynamically
    const MODE_DAYS_FIELD = {
        application: '$daysSinceLastApplication',
        approval: '$daysSinceLastApproval',
        booking: '$daysSinceLastBooking',
    };

    if (statusFilter && statusFilter.length > 0 && activityMode !== 'application') {
        const daysField = MODE_DAYS_FIELD[activityMode] || MODE_DAYS_FIELD.application;
        // Compute a dynamic status from the relevant field
        pipeline.push({
            $addFields: {
                _dynStatus: {
                    $switch: {
                        branches: [
                            { case: { $eq: [daysField, null] }, then: 'never_active' },
                            { case: { $lte: [daysField, 30] }, then: 'active' },
                            { case: { $lte: [daysField, 60] }, then: '30d_inactive' },
                            { case: { $lte: [daysField, 90] }, then: '60d_inactive' },
                        ],
                        default: 'long_inactive',
                    },
                },
            },
        });
        pipeline.push({ $match: { _dynStatus: { $in: statusFilter } } });
    }

    pipeline.push({
        $group: {
            _id: null,
            avgDaysSinceApp: { $avg: '$daysSinceLastApplication' },
            avgDaysSinceApproval: { $avg: '$daysSinceLastApproval' },
            avgDaysSinceBooking: { $avg: '$daysSinceLastBooking' },
            avgVisitResponse: { $avg: '$daysFromVisitToNextApp' },
            // Contact days: compute from datetime field
            _commDates: { $push: '$latestCommunicationDatetime' },
        },
    });

    const result = await DailyDealerSnapshot.aggregate(pipeline);

    if (result.length === 0) {
        return {
            avgDaysSinceApp: null,
            avgDaysSinceApproval: null,
            avgDaysSinceBooking: null,
            avgContactDays: null,
            avgVisitResponse: null,
        };
    }

    const r = result[0];
    // Compute avg contact days from communication datetimes
    const now = Date.now();
    const commDays = r._commDates
        .filter(d => d != null)
        .map(d => Math.floor((now - new Date(d).getTime()) / (1000 * 60 * 60 * 24)));
    const avgContactDays = commDays.length > 0
        ? commDays.reduce((a, b) => a + b, 0) / commDays.length
        : null;

    return {
        avgDaysSinceApp: r.avgDaysSinceApp != null ? Math.round(r.avgDaysSinceApp * 100) / 100 : null,
        avgDaysSinceApproval: r.avgDaysSinceApproval != null ? Math.round(r.avgDaysSinceApproval * 100) / 100 : null,
        avgDaysSinceBooking: r.avgDaysSinceBooking != null ? Math.round(r.avgDaysSinceBooking * 100) / 100 : null,
        avgContactDays: avgContactDays != null ? Math.round(avgContactDays * 100) / 100 : null,
        avgVisitResponse: r.avgVisitResponse != null ? Math.round(r.avgVisitResponse * 100) / 100 : null,
    };
}

/**
 * Compute deltas between current and previous metrics.
 * Negative delta on "days since" metrics = improvement.
 */
function computeDeltas(current, previous) {
    const delta = (c, p) => {
        if (c == null || p == null) return null;
        return Math.round((c - p) * 100) / 100;
    };
    return {
        avgDaysSinceApp: delta(current.avgDaysSinceApp, previous.avgDaysSinceApp),
        avgDaysSinceApproval: delta(current.avgDaysSinceApproval, previous.avgDaysSinceApproval),
        avgDaysSinceBooking: delta(current.avgDaysSinceBooking, previous.avgDaysSinceBooking),
        avgContactDays: delta(current.avgContactDays, previous.avgContactDays),
        avgVisitResponse: delta(current.avgVisitResponse, previous.avgVisitResponse),
    };
}

// ── Core Functions ──

/**
 * Compute network-level rolling averages (company-wide or state-filtered).
 * Returns both current and previous window metrics in one call.
 *
 * @param {number} windowSize - 7 or 30 (clamped to max 60)
 * @param {string[]|null} states - Optional state prefix filter
 * @param {string[]|null} statusFilter - Optional activity status filter (e.g. ['active'])
 * @param {string} activityMode - 'application' | 'approval' | 'booking'
 * @returns {Promise<Object>} NetworkRollingAvgResponse shape
 */
async function computeNetworkRollingAvg(windowSize, states = null, statusFilter = null, activityMode = 'application') {
    const clampedWindow = Math.min(Math.max(windowSize, 1), 60);
    const { currentDates, previousDates } = await getWindowDates(clampedWindow);

    // Edge case: insufficient data
    if (currentDates.length < 2) {
        const nullMetrics = {
            avgDaysSinceApp: null, avgDaysSinceApproval: null,
            avgDaysSinceBooking: null, avgContactDays: null, avgVisitResponse: null,
        };
        return {
            current: nullMetrics,
            previous: nullMetrics,
            deltas: nullMetrics,
            statusFlows: { avgGainedActive: 0, avgLostActive: 0, avgReactivated: 0, netDelta: 0 },
            reportDateRange: {
                first: currentDates.length > 0 ? currentDates[currentDates.length - 1].toISOString() : null,
                last: currentDates.length > 0 ? currentDates[0].toISOString() : null,
                count: currentDates.length,
            },
            insufficientData: true,
            windowSize: clampedWindow,
        };
    }

    const locationFilter = await buildStateFilter(states);

    // Derive target status for churn flow tracking
    const targetStatus = (statusFilter && statusFilter.length === 1) ? statusFilter[0] : 'active';

    const [current, previous, statusFlows] = await Promise.all([
        aggregateMetrics(currentDates, locationFilter, statusFilter, activityMode),
        aggregateMetrics(previousDates, locationFilter, statusFilter, activityMode),
        computeStatusFlows(currentDates, locationFilter, targetStatus),
    ]);

    const deltas = computeDeltas(current, previous);

    return {
        current,
        previous,
        deltas,
        statusFlows,
        reportDateRange: {
            first: currentDates[currentDates.length - 1].toISOString(),
            last: currentDates[0].toISOString(),
            count: currentDates.length,
        },
        insufficientData: false,
        windowSize: clampedWindow,
    };
}

/**
 * Compute churn velocity: daily avg of status transitions across the window.
 *
 * @param {Date[]} dates - Sorted (desc) report dates
 * @param {Object|null} locationFilter - Optional location filter
 * @returns {Promise<Object>} StatusFlowData shape
 */
async function computeStatusFlows(dates, locationFilter = null, targetStatus = 'active') {
    if (dates.length < 2) {
        return { avgGainedActive: 0, avgLostActive: 0, avgReactivated: 0, netDelta: 0 };
    }

    // Sort ascending for consecutive pair iteration
    const sortedDates = [...dates].sort((a, b) => a - b);
    let totalGained = 0;
    let totalLost = 0;
    let totalReactivated = 0;

    // For each consecutive date pair, count transitions into/out of targetStatus
    for (let i = 0; i < sortedDates.length - 1; i++) {
        const prevDate = sortedDates[i];
        const currDate = sortedDates[i + 1];

        const matchStage = { reportDate: currDate };
        if (locationFilter) matchStage.dealerLocation = locationFilter;

        const transitions = await DailyDealerSnapshot.aggregate([
            { $match: matchStage },
            {
                $lookup: {
                    from: 'dailydealersnapshots',
                    let: { locId: '$dealerLocation' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$dealerLocation', '$$locId'] },
                                        { $eq: ['$reportDate', prevDate] },
                                    ],
                                },
                            },
                        },
                        { $limit: 1 },
                    ],
                    as: 'prev',
                },
            },
            { $addFields: { prevSnap: { $arrayElemAt: ['$prev', 0] } } },
            { $match: { prevSnap: { $ne: null } } },
            {
                $group: {
                    _id: null,
                    gained: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ['$activityStatus', targetStatus] },
                                        { $ne: ['$prevSnap.activityStatus', targetStatus] },
                                    ],
                                },
                                1, 0,
                            ],
                        },
                    },
                    lost: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $ne: ['$activityStatus', targetStatus] },
                                        { $eq: ['$prevSnap.activityStatus', targetStatus] },
                                    ],
                                },
                                1, 0,
                            ],
                        },
                    },
                    reactivated: {
                        $sum: { $cond: [{ $eq: ['$reactivatedAfterVisit', true] }, 1, 0] },
                    },
                },
            },
        ]);

        if (transitions.length > 0) {
            totalGained += transitions[0].gained;
            totalLost += transitions[0].lost;
            totalReactivated += transitions[0].reactivated;
        }
    }

    const pairs = sortedDates.length - 1;
    return {
        avgGainedActive: Math.round((totalGained / pairs) * 100) / 100,
        avgLostActive: Math.round((totalLost / pairs) * 100) / 100,
        avgReactivated: Math.round((totalReactivated / pairs) * 100) / 100,
        netDelta: Math.round(((totalGained - totalLost) / pairs) * 100) / 100,
    };
}

/**
 * Compute per-rep scorecard with rolling avgs, dealer counts, and churn.
 *
 * @param {number} windowSize - 7 or 30 (clamped to max 60)
 * @param {string[]|null} statusFilter - Optional activity status filter (e.g. ['active'])
 * @param {string} activityMode - 'application' | 'approval' | 'booking'
 * @returns {Promise<Object>} RepScorecardResponse shape
 */
async function computeRepScorecard(windowSize, statusFilter = null, activityMode = 'application') {
    const clampedWindow = Math.min(Math.max(windowSize, 1), 60);
    const { currentDates, previousDates } = await getWindowDates(clampedWindow);

    // Build state → rep lookup
    const year = new Date().getFullYear();
    const budgetDocs = await SalesBudget.find({ year }).select('state rep').lean();
    const stateRepMap = {};
    for (const b of budgetDocs) {
        stateRepMap[b.state] = b.rep;
    }

    // Get all locations with their state prefix
    const allLocations = await DealerLocation.find({}).select('_id statePrefix').lean();
    const locationRepMap = {}; // locationId → rep
    const locationStateMap = {}; // locationId → statePrefix
    for (const loc of allLocations) {
        const locStr = loc._id.toString();
        locationRepMap[locStr] = stateRepMap[loc.statePrefix] || null;
        locationStateMap[locStr] = loc.statePrefix;
    }

    // Edge case: insufficient data
    if (currentDates.length < 2) {
        return {
            reps: [],
            networkAvgDealersPerRep: 0,
            reportDateRange: {
                first: currentDates.length > 0 ? currentDates[currentDates.length - 1].toISOString() : null,
                last: currentDates.length > 0 ? currentDates[0].toISOString() : null,
                count: currentDates.length,
            },
            insufficientData: true,
            windowSize: clampedWindow,
        };
    }

    // Get latest date for dealer counts / status breakdown
    const latestDate = currentDates[0];

    // Aggregate latest-date snapshots grouped by location (for status counts per rep)
    const latestSnapshots = await DailyDealerSnapshot.find({ reportDate: latestDate })
        .select('dealerLocation activityStatus reactivatedAfterVisit')
        .lean();

    // Build per-rep accumulators
    const repData = {};
    const repsSet = new Set(Object.values(stateRepMap));

    for (const rep of repsSet) {
        repData[rep] = {
            rep,
            totalDealers: 0,
            activeCount: 0,
            inactive30Count: 0,
            inactive60Count: 0,
            longInactiveCount: 0,
            reactivatedCount: 0,
            locationIds: [],
            // Per-state tracking
            stateData: {}, // statePrefix → { totalDealers, activeCount, ..., locationIds }
        };
    }

    // Count dealer stats per rep from latest snapshot
    for (const snap of latestSnapshots) {
        const locStr = snap.dealerLocation.toString();
        const rep = locationRepMap[locStr];
        if (!rep || !repData[rep]) continue;
        const st = locationStateMap[locStr] || 'XX';

        repData[rep].totalDealers++;
        switch (snap.activityStatus) {
            case 'active': repData[rep].activeCount++; break;
            case '30d_inactive': repData[rep].inactive30Count++; break;
            case '60d_inactive': repData[rep].inactive60Count++; break;
            case 'long_inactive': repData[rep].longInactiveCount++; break;
        }
        if (snap.reactivatedAfterVisit) repData[rep].reactivatedCount++;
        repData[rep].locationIds.push(snap.dealerLocation);

        // Per-state accumulator
        if (!repData[rep].stateData[st]) {
            repData[rep].stateData[st] = {
                state: st, totalDealers: 0, activeCount: 0,
                inactive30Count: 0, inactive60Count: 0, longInactiveCount: 0,
                reactivatedCount: 0, locationIds: [],
            };
        }
        const sd = repData[rep].stateData[st];
        sd.totalDealers++;
        switch (snap.activityStatus) {
            case 'active': sd.activeCount++; break;
            case '30d_inactive': sd.inactive30Count++; break;
            case '60d_inactive': sd.inactive60Count++; break;
            case 'long_inactive': sd.longInactiveCount++; break;
        }
        if (snap.reactivatedAfterVisit) sd.reactivatedCount++;
        sd.locationIds.push(snap.dealerLocation);
    }

    // Compute rolling avgs + churn per rep (parallel)
    const repNames = Object.keys(repData);
    const totalReps = repNames.length;
    const totalDealers = latestSnapshots.length;
    const networkAvgDealersPerRep = totalReps > 0 ? Math.round((totalDealers / totalReps) * 10) / 10 : 0;

    const repResults = await Promise.all(
        repNames.map(async (rep) => {
            const locIds = repData[rep].locationIds;
            if (locIds.length === 0) {
                const nullMetrics = {
                    avgDaysSinceApp: null, avgDaysSinceApproval: null,
                    avgDaysSinceBooking: null, avgContactDays: null, avgVisitResponse: null,
                };
                return {
                    ...repData[rep],
                    rollingAvg: nullMetrics,
                    deltas: nullMetrics,
                    statusFlows: { avgGainedActive: 0, avgLostActive: 0, avgReactivated: 0, netDelta: 0 },
                    heatIndex: null,
                    heatClass: null,
                    capacityRatio: networkAvgDealersPerRep > 0
                        ? Math.round((repData[rep].totalDealers / networkAvgDealersPerRep) * 100) / 100 : null,
                    capacityFlag: null,
                };
            }

            const locFilter = { $in: locIds };
            const targetStatus = (statusFilter && statusFilter.length === 1) ? statusFilter[0] : 'active';
            const [current, previous, flows] = await Promise.all([
                aggregateMetrics(currentDates, locFilter, statusFilter, activityMode),
                aggregateMetrics(previousDates, locFilter, statusFilter, activityMode),
                computeStatusFlows(currentDates, locFilter, targetStatus),
            ]);

            const deltas = computeDeltas(current, previous);
            const capacityRatio = networkAvgDealersPerRep > 0
                ? Math.round((repData[rep].totalDealers / networkAvgDealersPerRep) * 100) / 100 : null;

            // Per-state breakdown (parallel)
            const stateEntries = Object.values(repData[rep].stateData);
            const stateBreakdown = await Promise.all(
                stateEntries.map(async (sd) => {
                    if (sd.locationIds.length === 0) return null;
                    const stateLocFilter = { $in: sd.locationIds };
                    const [sCurrent, sFlows] = await Promise.all([
                        aggregateMetrics(currentDates, stateLocFilter, statusFilter, activityMode),
                        computeStatusFlows(currentDates, stateLocFilter, targetStatus),
                    ]);
                    return {
                        state: sd.state,
                        totalDealers: sd.totalDealers,
                        activeCount: sd.activeCount,
                        inactive30Count: sd.inactive30Count,
                        inactive60Count: sd.inactive60Count,
                        longInactiveCount: sd.longInactiveCount,
                        reactivatedCount: sd.reactivatedCount,
                        rollingAvg: sCurrent,
                        statusFlows: sFlows,
                    };
                })
            );

            return {
                rep: repData[rep].rep,
                totalDealers: repData[rep].totalDealers,
                activeCount: repData[rep].activeCount,
                inactive30Count: repData[rep].inactive30Count,
                inactive60Count: repData[rep].inactive60Count,
                longInactiveCount: repData[rep].longInactiveCount,
                reactivatedCount: repData[rep].reactivatedCount,
                rollingAvg: current,
                deltas,
                statusFlows: flows,
                stateBreakdown: stateBreakdown.filter(Boolean).sort((a, b) => a.state.localeCompare(b.state)),
                // Heat Index — populated by computeHeatScores after all reps are built
                heatIndex: null,
                heatClass: null,
                capacityRatio,
                capacityFlag: null,
            };
        })
    );

    // Compute Heat Index scores across all reps
    computeHeatScores(repResults, networkAvgDealersPerRep);

    return {
        reps: repResults.sort((a, b) => a.rep.localeCompare(b.rep)),
        networkAvgDealersPerRep,
        reportDateRange: {
            first: currentDates[currentDates.length - 1].toISOString(),
            last: currentDates[0].toISOString(),
            count: currentDates.length,
        },
        insufficientData: false,
        windowSize: clampedWindow,
    };
}

module.exports = {
    computeNetworkRollingAvg,
    computeRepScorecard,
    computeStatusFlows,
};
