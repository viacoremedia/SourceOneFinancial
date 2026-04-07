/**
 * Analytics API Routes
 * 
 * Query endpoints for dealer performance trends, monthly rollups,
 * group-level aggregations, and overview dashboards.
 * 
 * @module routes/analytics
 */

const express = require('express');
const router = express.Router();
const DailyDealerSnapshot = require('../../models/DailyDealerSnapshot');
const MonthlyDealerRollup = require('../../models/MonthlyDealerRollup');
const DealerGroup = require('../../models/DealerGroup');
const DealerLocation = require('../../models/DealerLocation');
const budgetRoutes = require('./budget');

// Mount budget sub-routes
router.use('/budget', budgetRoutes);

// ==========================================
// GET /analytics/dealers/:dealerId/trend
// Daily snapshots for a dealer over a date range
// ==========================================
router.get('/dealers/:dealerId/trend', async (req, res) => {
    try {
        // Find the dealer location by dealerId (e.g. "TX400")
        const location = await DealerLocation.findOne({
            dealerId: req.params.dealerId.toUpperCase()
        }).lean();

        if (!location) {
            return res.status(404).json({ success: false, message: 'Dealer not found' });
        }

        // Date range (default last 30 days)
        const end = req.query.end ? new Date(req.query.end) : new Date();
        const start = req.query.start
            ? new Date(req.query.start)
            : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

        const snapshots = await DailyDealerSnapshot.find({
            dealerLocation: location._id,
            reportDate: { $gte: start, $lte: end }
        }).sort({ reportDate: 1 }).lean();

        // Optional: compute moving average
        const movingAvgDays = parseInt(req.query.movingAvg);
        if (movingAvgDays && [30, 60, 90].includes(movingAvgDays)) {
            // Fetch extra historical data for the moving average window
            const windowStart = new Date(start.getTime() - movingAvgDays * 24 * 60 * 60 * 1000);
            const allSnapshots = await DailyDealerSnapshot.find({
                dealerLocation: location._id,
                reportDate: { $gte: windowStart, $lte: end }
            }).sort({ reportDate: 1 }).lean();

            // Compute sliding window average of daysSinceLastApplication
            for (const snap of snapshots) {
                const windowEnd = snap.reportDate;
                const windowBegin = new Date(windowEnd.getTime() - movingAvgDays * 24 * 60 * 60 * 1000);

                const windowSnaps = allSnapshots.filter(s =>
                    s.reportDate >= windowBegin && s.reportDate <= windowEnd &&
                    s.daysSinceLastApplication != null
                );

                if (windowSnaps.length > 0) {
                    const sum = windowSnaps.reduce((a, s) => a + s.daysSinceLastApplication, 0);
                    snap.movingAvgDaysSinceApp = Math.round((sum / windowSnaps.length) * 100) / 100;
                }
            }
        }

        res.status(200).json({
            success: true,
            dealerId: location.dealerId,
            dealerName: location.dealerName,
            dateRange: { start, end },
            count: snapshots.length,
            snapshots
        });
    } catch (error) {
        console.error('Error fetching dealer trend:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// GET /analytics/dealers/:dealerId/monthly
// Monthly rollups for a dealer
// ==========================================
router.get('/dealers/:dealerId/monthly', async (req, res) => {
    try {
        const location = await DealerLocation.findOne({
            dealerId: req.params.dealerId.toUpperCase()
        }).lean();

        if (!location) {
            return res.status(404).json({ success: false, message: 'Dealer not found' });
        }

        const year = parseInt(req.query.year) || new Date().getFullYear();

        const rollups = await MonthlyDealerRollup.find({
            dealerLocation: location._id,
            year
        }).sort({ month: 1 }).lean();

        res.status(200).json({
            success: true,
            dealerId: location.dealerId,
            dealerName: location.dealerName,
            year,
            count: rollups.length,
            rollups
        });
    } catch (error) {
        console.error('Error fetching dealer monthly:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// GET /analytics/groups/:groupSlug/monthly
// Aggregated monthly rollups for a dealer group
// ==========================================
router.get('/groups/:groupSlug/monthly', async (req, res) => {
    try {
        const group = await DealerGroup.findOne({
            slug: req.params.groupSlug.toLowerCase()
        }).lean();

        if (!group) {
            return res.status(404).json({ success: false, message: 'Dealer group not found' });
        }

        const year = parseInt(req.query.year) || new Date().getFullYear();

        const rollups = await MonthlyDealerRollup.find({
            dealerGroup: group._id,
            year
        }).sort({ month: 1 }).lean();

        // Aggregate across all locations per month
        const monthlyAggregated = {};
        for (const r of rollups) {
            if (!monthlyAggregated[r.month]) {
                monthlyAggregated[r.month] = {
                    month: r.month,
                    year: r.year,
                    locationCount: 0,
                    metrics: {
                        daysActive: 0,
                        daysInactive30: 0,
                        daysInactive60: 0,
                        daysLongInactive: 0,
                        totalSnapshotDays: 0,
                        applicationDatesChanged: 0,
                        approvalDatesChanged: 0,
                        bookingDatesChanged: 0,
                        reactivationEvents: 0,
                        avgDaysSinceLastApp: [],
                        avgDaysSinceLastApproval: [],
                        avgDaysSinceLastBooking: []
                    }
                };
            }

            const agg = monthlyAggregated[r.month];
            agg.locationCount++;
            const m = r.metrics || {};

            agg.metrics.daysActive += m.daysActive || 0;
            agg.metrics.daysInactive30 += m.daysInactive30 || 0;
            agg.metrics.daysInactive60 += m.daysInactive60 || 0;
            agg.metrics.daysLongInactive += m.daysLongInactive || 0;
            agg.metrics.totalSnapshotDays += m.totalSnapshotDays || 0;
            agg.metrics.applicationDatesChanged += m.applicationDatesChanged || 0;
            agg.metrics.approvalDatesChanged += m.approvalDatesChanged || 0;
            agg.metrics.bookingDatesChanged += m.bookingDatesChanged || 0;
            agg.metrics.reactivationEvents += m.reactivationEvents || 0;

            if (m.avgDaysSinceLastApp != null) agg.metrics.avgDaysSinceLastApp.push(m.avgDaysSinceLastApp);
            if (m.avgDaysSinceLastApproval != null) agg.metrics.avgDaysSinceLastApproval.push(m.avgDaysSinceLastApproval);
            if (m.avgDaysSinceLastBooking != null) agg.metrics.avgDaysSinceLastBooking.push(m.avgDaysSinceLastBooking);
        }

        // Convert arrays to averages
        const result = Object.values(monthlyAggregated).map(m => {
            const avg = arr => arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100 : null;
            m.metrics.avgDaysSinceLastApp = avg(m.metrics.avgDaysSinceLastApp);
            m.metrics.avgDaysSinceLastApproval = avg(m.metrics.avgDaysSinceLastApproval);
            m.metrics.avgDaysSinceLastBooking = avg(m.metrics.avgDaysSinceLastBooking);
            return m;
        });

        res.status(200).json({
            success: true,
            group: { name: group.name, slug: group.slug, dealerCount: group.dealerCount },
            year,
            months: result
        });
    } catch (error) {
        console.error('Error fetching group monthly:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// GET /analytics/groups/:groupSlug/locations
// All locations in a group with latest snapshot
// ==========================================
router.get('/groups/:groupSlug/locations', async (req, res) => {
    try {
        const group = await DealerGroup.findOne({
            slug: req.params.groupSlug.toLowerCase()
        }).lean();

        if (!group) {
            return res.status(404).json({ success: false, message: 'Dealer group not found' });
        }

        const locations = await DealerLocation.find({
            dealerGroup: group._id
        }).lean();

        // Get latest snapshot for each location
        const locationsWithSnapshot = await Promise.all(
            locations.map(async (loc) => {
                const latestSnapshot = await DailyDealerSnapshot.findOne({
                    dealerLocation: loc._id
                }).sort({ reportDate: -1 }).lean();

                return {
                    ...loc,
                    latestSnapshot: latestSnapshot || null
                };
            })
        );

        res.status(200).json({
            success: true,
            group: { name: group.name, slug: group.slug, dealerCount: group.dealerCount },
            count: locationsWithSnapshot.length,
            locations: locationsWithSnapshot
        });
    } catch (error) {
        console.error('Error fetching group locations:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});
// ==========================================
// GET /analytics/groups
// List all dealer groups with summary stats
// ==========================================
router.get('/groups', async (req, res) => {
    try {
        // Optional state filter: ?states=TX,FL
        const statesParam = req.query.states;
        const targetStates = statesParam
            ? String(statesParam).split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
            : null;

        // If filtering by states, get matching location IDs
        let filteredLocationIds = null;
        if (targetStates && targetStates.length > 0) {
            const matchingLocations = await DealerLocation.find(
                { statePrefix: { $in: targetStates }, dealerGroup: { $ne: null } }
            ).select('_id').lean();
            filteredLocationIds = matchingLocations.map(l => l._id);
        }

        const groups = await DealerGroup.find({})
            .sort({ dealerCount: -1 })
            .lean();

        // Get the latest report date to query the most recent snapshots
        const latestSnapshot = await DailyDealerSnapshot.findOne({})
            .sort({ reportDate: -1 }).lean();

        if (!latestSnapshot) {
            // No snapshot data yet — return groups without summaries
            return res.status(200).json({
                success: true,
                count: groups.length,
                groups: groups.map(g => ({ ...g, summary: null }))
            });
        }

        const latestDate = latestSnapshot.reportDate;

        // Build match stage — optionally filter by location IDs
        const matchStage = { reportDate: latestDate, dealerGroup: { $ne: null } };
        if (filteredLocationIds) {
            matchStage.dealerLocation = { $in: filteredLocationIds };
        }

        // Aggregate latest snapshots per group
        const groupSummaries = await DailyDealerSnapshot.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: '$dealerGroup',
                    locationCount: { $sum: 1 },
                    activeCount: {
                        $sum: { $cond: [{ $eq: ['$activityStatus', 'active'] }, 1, 0] }
                    },
                    inactive30Count: {
                        $sum: { $cond: [{ $eq: ['$activityStatus', '30d_inactive'] }, 1, 0] }
                    },
                    inactive60Count: {
                        $sum: { $cond: [{ $eq: ['$activityStatus', '60d_inactive'] }, 1, 0] }
                    },
                    longInactiveCount: {
                        $sum: { $cond: [{ $eq: ['$activityStatus', 'long_inactive'] }, 1, 0] }
                    },
                    reactivatedCount: {
                        $sum: { $cond: [{ $eq: ['$reactivatedAfterVisit', true] }, 1, 0] }
                    },
                    minDaysSinceApp: {
                        $min: { $cond: [{ $ne: ['$daysSinceLastApplication', null] }, '$daysSinceLastApplication', 99999] }
                    },
                    maxDaysSinceApp: {
                        $max: { $cond: [{ $ne: ['$daysSinceLastApplication', null] }, '$daysSinceLastApplication', null] }
                    },
                    minDaysSinceApproval: {
                        $min: { $cond: [{ $ne: ['$daysSinceLastApproval', null] }, '$daysSinceLastApproval', 99999] }
                    },
                    maxDaysSinceApproval: {
                        $max: { $cond: [{ $ne: ['$daysSinceLastApproval', null] }, '$daysSinceLastApproval', null] }
                    },
                    minDaysSinceBooking: {
                        $min: { $cond: [{ $ne: ['$daysSinceLastBooking', null] }, '$daysSinceLastBooking', 99999] }
                    },
                    maxDaysSinceBooking: {
                        $max: { $cond: [{ $ne: ['$daysSinceLastBooking', null] }, '$daysSinceLastBooking', null] }
                    },
                    // Visit-to-app response
                    minVisitToApp: {
                        $min: { $cond: [{ $ne: ['$daysFromVisitToNextApp', null] }, '$daysFromVisitToNextApp', 99999] }
                    },
                    maxVisitToApp: {
                        $max: { $cond: [{ $ne: ['$daysFromVisitToNextApp', null] }, '$daysFromVisitToNextApp', null] }
                    },
                    avgVisitToApp: { $avg: '$daysFromVisitToNextApp' },
                    // Communication recency (dates — client computes days)
                    latestComm: { $max: '$latestCommunicationDatetime' },
                    oldestComm: { $min: { $cond: [{ $ne: ['$latestCommunicationDatetime', null] }, '$latestCommunicationDatetime', null] } },
                }
            }
        ]);

        // Map summaries by group ID for fast lookup
        const summaryMap = {};
        for (const s of groupSummaries) {
            summaryMap[s._id.toString()] = {
                locationCount: s.locationCount,
                activeCount: s.activeCount,
                inactive30Count: s.inactive30Count,
                inactive60Count: s.inactive60Count,
                longInactiveCount: s.longInactiveCount,
                reactivatedCount: s.reactivatedCount,
                daysSinceApp: {
                    best: s.minDaysSinceApp === 99999 ? null : s.minDaysSinceApp,
                    worst: s.maxDaysSinceApp,
                },
                daysSinceApproval: {
                    best: s.minDaysSinceApproval === 99999 ? null : s.minDaysSinceApproval,
                    worst: s.maxDaysSinceApproval,
                },
                daysSinceBooking: {
                    best: s.minDaysSinceBooking === 99999 ? null : s.minDaysSinceBooking,
                    worst: s.maxDaysSinceBooking,
                },
                visitToApp: {
                    best: s.minVisitToApp === 99999 ? null : s.minVisitToApp,
                    worst: s.maxVisitToApp,
                },
                avgVisitToApp: s.avgVisitToApp != null ? Math.round(s.avgVisitToApp * 10) / 10 : null,
                latestComm: s.latestComm || null,
                oldestComm: s.oldestComm || null,
            };
        }

        // Aggregate distinct states per group from DealerLocation
        const groupStates = await DealerLocation.aggregate([
            { $match: { dealerGroup: { $ne: null }, statePrefix: { $ne: null } } },
            { $group: { _id: '$dealerGroup', states: { $addToSet: '$statePrefix' } } },
        ]);
        const statesMap = {};
        for (const gs of groupStates) {
            statesMap[gs._id.toString()] = gs.states.sort();
        }

        // Merge summaries + states into groups
        const enrichedGroups = groups.map(g => ({
            ...g,
            states: statesMap[g._id.toString()] || [],
            summary: summaryMap[g._id.toString()] || null,
        }));

        res.status(200).json({
            success: true,
            count: enrichedGroups.length,
            groups: enrichedGroups
        });
    } catch (error) {
        console.error('Error fetching groups:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// GET /analytics/dealers/small
// Dealer locations with server-side sort + pagination
// Query: ?sort=daysSinceLastApplication&dir=asc&page=1&limit=50&scope=ungrouped|all
// scope=ungrouped (default) → independent dealers only
// scope=all → every dealer location
// ==========================================
router.get('/dealers/small', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
        const skip = (page - 1) * limit;
        // Multi-column sort: sort=col1,col2&dir=asc,desc
        const sortFields = (req.query.sort || 'dealerName').split(',').map(s => s.trim());
        const sortDirs = (req.query.dir || 'asc').split(',').map(s => s.trim());

        // Get latest report date
        const latestSnapshot = await DailyDealerSnapshot.findOne({})
            .sort({ reportDate: -1 }).lean();
        const latestDate = latestSnapshot?.reportDate;

        // Map frontend sort keys to snapshot fields
        const SORT_FIELD_MAP = {
            'name': 'dealerName',
            'dealerName': 'dealerName',
            'daysSinceLastApplication': 'latestSnapshot.daysSinceLastApplication',
            'daysSinceLastApproval': 'latestSnapshot.daysSinceLastApproval',
            'daysSinceLastBooking': 'latestSnapshot.daysSinceLastBooking',
            'activityStatus': 'latestSnapshot.activityStatus',
            'commDays': '_commDaysNum',
            'visitToApp': 'latestSnapshot.daysFromVisitToNextApp',
        };

        // Build resolved sort columns
        const sortColumns = sortFields.map((field, i) => {
            const resolved = SORT_FIELD_MAP[field] || 'dealerName';
            const dir = (sortDirs[i] || sortDirs[0] || 'asc') === 'desc' ? -1 : 1;
            return { resolved, dir, key: `_sv${i}` };
        });
        const statusParam = req.query.status || null;
        const scope = req.query.scope || 'ungrouped'; // 'ungrouped' or 'all'
        const statesParam = req.query.states ? req.query.states.split(',').map(s => s.trim().toUpperCase()) : null;

        const baseMatch = scope === 'all' ? {} : { dealerGroup: null };
        if (statesParam && statesParam.length > 0) {
            baseMatch.statePrefix = { $in: statesParam };
        }

        // Build aggregation pipeline
        const pipeline = [
            // 1. Match locations by scope + state
            { $match: baseMatch },

            // 2. Lookup latest snapshot (single doc per location)
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
            }] : []),

            // 3. Flatten snapshot
            {
                $addFields: {
                    latestSnapshot: latestDate
                        ? { $arrayElemAt: ['$snapshotArr', 0] }
                        : null
                }
            },
            { $project: { snapshotArr: 0 } },

            // 3b. Status filter (server-side)
            ...(statusParam ? [
                statusParam === 'reactivated'
                    ? { $match: { 'latestSnapshot.reactivatedAfterVisit': true } }
                    : { $match: { 'latestSnapshot.activityStatus': statusParam } }
            ] : []),

            // 3c. Compute days-since-contact as a numeric value
            {
                $addFields: {
                    _commDaysNum: {
                        $cond: {
                            if: { $ne: ['$latestSnapshot.latestCommunicationDatetime', null] },
                            then: {
                                $divide: [
                                    { $subtract: [new Date(), '$latestSnapshot.latestCommunicationDatetime'] },
                                    1000 * 60 * 60 * 24
                                ]
                            },
                            else: null
                        }
                    }
                }
            },

            // 4. Multi-column sort with null handling (nulls go to end)
            {
                $addFields: Object.fromEntries(
                    sortColumns.map(sc => [
                        sc.key,
                        (sc.resolved.startsWith('latestSnapshot.') || sc.resolved === '_commDaysNum')
                            ? { $ifNull: [`$${sc.resolved}`, sc.dir === 1 ? 99999 : -1] }
                            : `$${sc.resolved}`
                    ])
                )
            },
            { $sort: Object.fromEntries(sortColumns.map(sc => [sc.key, sc.dir])) },
            { $project: { ...Object.fromEntries(sortColumns.map(sc => [sc.key, 0])), _commDaysNum: 0 } },
        ];

        // Get filtered total count via the same pipeline (without skip/limit)
        const countResult = await DealerLocation.aggregate([
            ...pipeline,
            { $count: 'total' },
        ]);
        const totalCount = countResult.length > 0 ? countResult[0].total : 0;

        // Execute with pagination
        const dealers = await DealerLocation.aggregate([
            ...pipeline,
            { $skip: skip },
            { $limit: limit },
        ]);

        // Status breakdown for dealers in this scope (not just this page)
        let statusBreakdown = null;
        if (latestDate) {
            // Always scope breakdown by baseMatch (respects state filter + scope)
            const hasFilters = Object.keys(baseMatch).length > 0;
            let breakdownMatch = { reportDate: latestDate };
            if (hasFilters) {
                const scopedIds = await DealerLocation.find(baseMatch).select('_id').lean();
                breakdownMatch.dealerLocation = { $in: scopedIds.map(l => l._id) };
            }

            const breakdown = await DailyDealerSnapshot.aggregate([
                { $match: breakdownMatch },
                {
                    $group: {
                        _id: null,
                        total: { $sum: 1 },
                        active: { $sum: { $cond: [{ $eq: ['$activityStatus', 'active'] }, 1, 0] } },
                        inactive30: { $sum: { $cond: [{ $eq: ['$activityStatus', '30d_inactive'] }, 1, 0] } },
                        inactive60: { $sum: { $cond: [{ $eq: ['$activityStatus', '60d_inactive'] }, 1, 0] } },
                        longInactive: { $sum: { $cond: [{ $eq: ['$activityStatus', 'long_inactive'] }, 1, 0] } },
                        reactivated: { $sum: { $cond: [{ $eq: ['$reactivatedAfterVisit', true] }, 1, 0] } },
                    }
                }
            ]);

            if (breakdown.length > 0) {
                const b = breakdown[0];
                statusBreakdown = {
                    total: b.total,
                    active: b.active,
                    inactive30: b.inactive30,
                    inactive60: b.inactive60,
                    longInactive: b.longInactive,
                    reactivated: b.reactivated,
                };
            }
        }

        res.status(200).json({
            success: true,
            dealers,
            statusBreakdown,
            pagination: {
                page,
                limit,
                totalCount,
                totalPages: Math.ceil(totalCount / limit),
                hasMore: skip + dealers.length < totalCount,
            }
        });
    } catch (error) {
        console.error('Error fetching small dealers:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// GET /analytics/overview
// High-level dashboard stats
// ==========================================
router.get('/overview', async (req, res) => {
    try {
        const now = new Date();
        const year = parseInt(req.query.year) || now.getFullYear();
        const month = parseInt(req.query.month) || (now.getMonth() + 1);

        // Get the latest snapshot date
        const latestSnapshot = await DailyDealerSnapshot.findOne({})
            .sort({ reportDate: -1 }).lean();
        const latestDate = latestSnapshot ? latestSnapshot.reportDate : now;

        // Activity status breakdown on the latest date
        const statusBreakdown = await DailyDealerSnapshot.aggregate([
            { $match: { reportDate: latestDate } },
            { $group: { _id: '$activityStatus', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        // Total dealers
        const totalDealers = await DealerLocation.countDocuments();
        const totalGroups = await DealerGroup.countDocuments();

        // Reactivation events this month vs last month
        const thisMonthStart = new Date(year, month - 1, 1);
        const thisMonthEnd = new Date(year, month, 1);
        const lastMonthStart = new Date(year, month - 2, 1);

        const reactivationsThisMonth = await DailyDealerSnapshot.countDocuments({
            reportDate: { $gte: thisMonthStart, $lt: thisMonthEnd },
            reactivatedAfterVisit: true
        });

        const reactivationsLastMonth = await DailyDealerSnapshot.countDocuments({
            reportDate: { $gte: lastMonthStart, $lt: thisMonthStart },
            reactivatedAfterVisit: true
        });

        // Average days since last application (active dealers only, latest date)
        const avgResult = await DailyDealerSnapshot.aggregate([
            {
                $match: {
                    reportDate: latestDate,
                    activityStatus: 'active',
                    daysSinceLastApplication: { $ne: null }
                }
            },
            {
                $group: {
                    _id: null,
                    avgDaysSinceApp: { $avg: '$daysSinceLastApplication' },
                    count: { $sum: 1 }
                }
            }
        ]);

        res.status(200).json({
            success: true,
            overview: {
                latestReportDate: latestDate,
                totalDealers,
                totalGroups,
                statusBreakdown: statusBreakdown.map(s => ({
                    status: s._id,
                    count: s.count
                })),
                reactivations: {
                    thisMonth: reactivationsThisMonth,
                    lastMonth: reactivationsLastMonth,
                    change: reactivationsThisMonth - reactivationsLastMonth
                },
                activeDealerAvg: avgResult.length > 0 ? {
                    avgDaysSinceLastApp: Math.round(avgResult[0].avgDaysSinceApp * 100) / 100,
                    activeDealerCount: avgResult[0].count
                } : null,
                period: { year, month }
            }
        });
    } catch (error) {
        console.error('Error fetching overview:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
