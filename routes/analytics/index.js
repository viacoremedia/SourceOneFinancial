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
// List all dealer groups with basic stats
// ==========================================
router.get('/groups', async (req, res) => {
    try {
        const groups = await DealerGroup.find({})
            .sort({ dealerCount: -1 })
            .lean();

        res.status(200).json({
            success: true,
            count: groups.length,
            groups
        });
    } catch (error) {
        console.error('Error fetching groups:', error);
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
