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
const mongoose = require('mongoose');
const Application = require('../../models/Application');
const DailyDealerSnapshot = require('../../models/DailyDealerSnapshot');
const MonthlyDealerRollup = require('../../models/MonthlyDealerRollup');
const DealerGroup = require('../../models/DealerGroup');
const DealerLocation = require('../../models/DealerLocation');
const DealerCommunication = require('../../models/DealerCommunication');
const DealerProfile = require('../../models/DealerProfile');
const SalesBudget = require('../../models/SalesBudget');
const LargeDealerBudget = require('../../models/LargeDealerBudget');
const { getDealerStatsMap, getNetworkAggregateStats } = require('../../services/dealerStatsService');
const { getRepAliasMap, getRepDisplayMap, getRepHandles, isInactiveRep, isExcludedRep, resolveRepName } = require('../../config/repConfig');
const { getLatestDataDate } = require('../../utils/dateUtils');
const { getUnderwriterScorecard } = require('../../services/underwriterService');
const budgetRoutes = require('./budget');
const communicationRoutes = require('./communication');
const relationshipDemandRoutes = require('./relationshipDemand');
const pdfScorecardRoutes = require('./pdfScorecard');

// Mount sub-routes
router.use('/budget', budgetRoutes);
router.use('/communication', communicationRoutes);
router.use('/relationship-demand', relationshipDemandRoutes);
router.use('/pdf-scorecard', pdfScorecardRoutes);

// ==========================================
// GET /analytics/underwriters
// Underwriter & Lender Performance Scorecard
// ==========================================
router.get('/underwriters', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const underwriters = await getUnderwriterScorecard({ startDate, endDate });
        res.status(200).json({
            success: true,
            count: underwriters.length,
            underwriters
        });
    } catch (error) {
        console.error('Error fetching underwriter scorecard:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

function formatDateUtcNice(d) {
    if (!d || isNaN(d.getTime())) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

// Helper to compute 2026 monthly budget targets map (month 1..12 -> target $)
async function getMonthlyBudgetsMap2026(stateFilter = null, repFilter = null, groupSlugFilter = null) {
    const sbMatch = { year: 2026 };
    if (stateFilter) sbMatch.state = stateFilter.toUpperCase();
    if (repFilter) sbMatch.rep = repFilter;

    const lbMatch = { year: 2026 };
    if (groupSlugFilter) {
        const grp = await DealerGroup.findOne({ slug: groupSlugFilter }).lean();
        if (grp) lbMatch.groupName = new RegExp(grp.name, 'i');
    }

    const salesBudgets = await SalesBudget.find(sbMatch).lean();
    const largeBudgets = await LargeDealerBudget.find(lbMatch).lean();

    const monthlyMap = {};
    for (let m = 1; m <= 12; m++) monthlyMap[m] = 0;

    for (const sb of salesBudgets) {
        for (let m = 1; m <= 12; m++) {
            monthlyMap[m] += (sb.monthlyBudgets?.[m] || 0);
        }
    }
    for (const lb of largeBudgets) {
        for (let m = 1; m <= 12; m++) {
            monthlyMap[m] += (lb.sourceOneOriginations?.[m] || lb.totalOriginations?.[m] || 0);
        }
    }
    return monthlyMap;
}

// ==========================================
// Rep config — centralized in server/config/repConfig.js
// ==========================================
const REP_ALIAS_MAP_SHARED = getRepAliasMap();

/**
 * Build reverse lookup: handle (lowercase) → display name
 */
function buildHandleToDisplayName() {
    return getRepDisplayMap();
}

// ==========================================
// GET /analytics/rep-mappings
// Derive rep → states[] and rep → groups[] from actual DealerLocation data
// ==========================================
router.get('/rep-mappings', async (req, res) => {
    try {
        const handleToDisplay = buildHandleToDisplayName();

        // Get all dealer locations with a rep assigned
        const locations = await DealerLocation.find({
            dealerRepresentative: { $ne: null, $exists: true }
        }).select('dealerRepresentative statePrefix dealerGroup').lean();

        // Build rep → states and rep → groupIds
        // ONLY include handles that map to known reps in the alias map.
        // Unknown handles (S1House, system accounts, unmapped reps) are excluded.
        const repStatesMap = {};  // displayName → Set<state>
        const repGroupIdMap = {}; // displayName → Set<groupId string>

        for (const loc of locations) {
            const handle = (loc.dealerRepresentative || '').trim().toLowerCase();
            if (!handle) continue;

            if (isInactiveRep(handle) || isExcludedRep(handle)) continue;

            const displayName = handleToDisplay[handle];
            if (!displayName) continue;

            if (isInactiveRep(displayName) || isExcludedRep(displayName)) continue;

            if (!repStatesMap[displayName]) {
                repStatesMap[displayName] = new Set();
                repGroupIdMap[displayName] = new Set();
            }

            if (loc.statePrefix) {
                repStatesMap[displayName].add(loc.statePrefix);
            }
            if (loc.dealerGroup) {
                repGroupIdMap[displayName].add(loc.dealerGroup.toString());
            }
        }

        // Convert Sets to sorted arrays
        const repStates = {};
        for (const [rep, statesSet] of Object.entries(repStatesMap)) {
            repStates[rep] = [...statesSet].sort();
        }

        // Resolve group ObjectIds to names + slugs
        const allGroupIds = new Set();
        for (const ids of Object.values(repGroupIdMap)) {
            for (const id of ids) allGroupIds.add(id);
        }

        const groupDocs = allGroupIds.size > 0
            ? await DealerGroup.find({ _id: { $in: [...allGroupIds] } }).select('name slug').lean()
            : [];
        const groupById = {};
        for (const g of groupDocs) {
            groupById[g._id.toString()] = { name: g.name, slug: g.slug };
        }

        const repGroups = {};
        for (const [rep, groupIds] of Object.entries(repGroupIdMap)) {
            const groups = [];
            for (const id of groupIds) {
                if (groupById[id]) groups.push(groupById[id]);
            }
            repGroups[rep] = groups.sort((a, b) => a.name.localeCompare(b.name));
        }

        // Aggregate all unique values
        const allReps = Object.keys(repStates)
            .filter(rep => {
                // Find any handle for this rep and check if active
                const handleEntry = Object.entries(getRepDisplayMap()).find(([, name]) => name === rep);
                if (!handleEntry) return true; // unknown reps still show
                const handle = handleEntry[0];
                return !isInactiveRep(handle) && !isExcludedRep(handle);
            })
            .sort();

        // allStates: union of rep-derived states + budget states (comprehensive)
        const allStatesSet = new Set();
        for (const states of Object.values(repStates)) {
            for (const s of states) allStatesSet.add(s);
        }
        // Also include states from SalesBudget so no budget states are missing
        const budgetStates = await SalesBudget.distinct('state', { year: 2026 });
        for (const s of budgetStates) allStatesSet.add(s);
        const allStates = [...allStatesSet].sort();

        // All groups from DB (not just rep-linked) so unfiltered dropdown is complete
        const allGroupDocs = await DealerGroup.find({}).select('name slug').sort({ name: 1 }).lean();
        const allGroups = allGroupDocs.map(g => ({ name: g.name, slug: g.slug }));

        res.status(200).json({
            success: true,
            repStates,
            repGroups,
            allReps,
            allStates,
            allGroups,
        });
    } catch (error) {
        console.error('Error fetching rep mappings:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// GET /analytics/executive-summary
// Executive Network Summary Banner KPI Totals, Trends, Budget, & Pacing
// ==========================================
router.get('/executive-summary', async (req, res) => {
    try {
        const startDateStr = req.query.startDate || req.query.start;
        const endDateStr = req.query.endDate || req.query.end;
        const trendPeriod = req.query.trend || 'mom';
        const stateFilter = req.query.state || req.query.states || null;
        const repFilter = req.query.rep || null;
        const groupSlugFilter = req.query.groupSlug || null;

        const maxReportDate = await getMaxReportDate();
        const year = maxReportDate.getUTCFullYear();
        const month = maxReportDate.getUTCMonth(); // 0-indexed (0 = Jan)

        let start = startDateStr ? new Date(startDateStr) : new Date(Date.UTC(year, month, 1));
        let end = endDateStr ? new Date(endDateStr) : new Date(maxReportDate);
        if (isNaN(start.getTime())) start = new Date(Date.UTC(year, month, 1));
        if (isNaN(end.getTime())) end = new Date(maxReportDate);

        if (end > maxReportDate) {
            end = new Date(maxReportDate);
        }

        const formattedStart = formatDateUtcNice(start);
        const formattedEnd = formatDateUtcNice(end);

        const { compStart, compEnd, comparisonLabel } = await getComparisonDateRange(startDateStr, endDateStr, trendPeriod);

        const statusFilter = req.query.status || req.query.statusFilter || null;
        const drdFilter = req.query.drd || req.query.drdSegment || null;

        const REP_ALIAS_MAP = getRepAliasMap();

        let filterDealerIds = null;

        if (statusFilter || stateFilter || repFilter || groupSlugFilter || (drdFilter && drdFilter !== 'all')) {
            const locMatch = {};
            if (groupSlugFilter) {
                const grp = await DealerGroup.findOne({ slug: groupSlugFilter }).lean();
                if (grp) locMatch.dealerGroup = grp._id;
                else locMatch.dealerGroup = new mongoose.Types.ObjectId();
            }
            if (stateFilter) {
                const targetStates = String(stateFilter).split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
                locMatch.statePrefix = { $in: targetStates };
            }
            if (repFilter) {
                const handles = getRepHandles(repFilter);
                const handleRegexes = handles.map(h => new RegExp('^' + h + '$', 'i'));
                locMatch.dealerRepresentative = { $in: handleRegexes };
            }

            let matchingLocs = await DealerLocation.find(locMatch).select('_id clientDealerId dealerId').lean();

            if (statusFilter) {
                const latestSnap = await DailyDealerSnapshot.findOne({}).sort({ reportDate: -1 }).select('reportDate').lean();
                if (latestSnap) {
                    const snapMatch = {
                        reportDate: latestSnap.reportDate,
                        dealerLocation: { $in: matchingLocs.map(l => l._id) }
                    };
                    if (statusFilter === 'active') snapMatch.activityStatus = 'active';
                    else if (statusFilter === '30d_inactive') snapMatch.activityStatus = '30d_inactive';
                    else if (statusFilter === '60d_inactive') snapMatch.activityStatus = '60d_inactive';
                    else if (statusFilter === '90d_inactive') snapMatch.activityStatus = '90d_inactive';
                    else if (statusFilter === 'long_inactive') snapMatch.activityStatus = { $in: ['long_inactive', 'never_active'] };

                    const matchingSnaps = await DailyDealerSnapshot.find(snapMatch).select('dealerLocation').lean();
                    const matchedLocIdSet = new Set(matchingSnaps.map(s => s.dealerLocation.toString()));
                    matchingLocs = matchingLocs.filter(l => matchedLocIdSet.has(l._id.toString()));
                }
            }

            if (drdFilter && drdFilter !== 'all') {
                const drdQuery = drdFilter === 'overridden'
                    ? { 'manualOverride.isOverridden': true }
                    : { relationshipDemand: drdFilter };
                const matchingProfiles = await DealerProfile.find(drdQuery).select('dealerLocation clientDealerId').lean();
                const drdLocIdSet = new Set(matchingProfiles.map(p => p.dealerLocation?.toString()).filter(Boolean));
                const drdClientSet = new Set(matchingProfiles.map(p => (p.clientDealerId || '').trim().toUpperCase()).filter(Boolean));
                matchingLocs = matchingLocs.filter(l => drdLocIdSet.has(l._id.toString()) || drdClientSet.has((l.clientDealerId || l.dealerId || '').trim().toUpperCase()));
            }

            filterDealerIds = matchingLocs.map(l => (l.clientDealerId || l.dealerId || '').trim().toUpperCase()).filter(Boolean);
            if (filterDealerIds.length === 0) {
                filterDealerIds = ['__NO_MATCH__'];
            }
        }

        // Fetch current range network totals & comparison period totals
        const currentStats = await getNetworkAggregateStats({
            startDate: start,
            endDate: end,
            rep: repFilter,
            state: stateFilter,
            groupSlug: groupSlugFilter,
            dealerIds: filterDealerIds
        });

        const compStats = (compStart && compEnd) ? await getNetworkAggregateStats({
            startDate: compStart,
            endDate: compEnd,
            rep: repFilter,
            state: stateFilter,
            groupSlug: groupSlugFilter,
            dealerIds: filterDealerIds
        }) : { apps: 0, approvals: 0, booked: 0, bookedDollars: 0, lookToBook: 0, approvalToBook: 0 };

        const trends = {
            apps: computeMetricTrend(currentStats.apps, compStats.apps),
            approvals: computeMetricTrend(currentStats.approvals, compStats.approvals),
            booked: computeMetricTrend(currentStats.booked, compStats.booked),
            bookedDollars: computeMetricTrend(currentStats.bookedDollars, compStats.bookedDollars),
            leadBooked: computeMetricTrend(currentStats.leadBooked, compStats.leadBooked),
            leadBookedDollars: computeMetricTrend(currentStats.leadBookedDollars, compStats.leadBookedDollars),
            closeBooked: computeMetricTrend(currentStats.closeBooked, compStats.closeBooked),
            closeBookedDollars: computeMetricTrend(currentStats.closeBookedDollars, compStats.closeBookedDollars),
            lookToBook: computeMetricTrend(currentStats.lookToBook, compStats.lookToBook),
            approvalToBook: computeMetricTrend(currentStats.approvalToBook, compStats.approvalToBook),
        };

        // Budget calculation for date range
        const monthlyBudgets2026 = await getMonthlyBudgetsMap2026(stateFilter, repFilter, groupSlugFilter);
        const annual2026Budget = Object.values(monthlyBudgets2026).reduce((a, b) => a + b, 0);

        // Estimate proportional budget for range
        let targetBookedDollars = 0;
        let currPtr = new Date(start);
        while (currPtr <= end) {
            const mNum = currPtr.getUTCMonth() + 1;
            const daysInM = new Date(Date.UTC(currPtr.getUTCFullYear(), mNum, 0)).getUTCDate();
            const monthBudget = monthlyBudgets2026[mNum] || 0;
            targetBookedDollars += (monthBudget / daysInM);
            currPtr.setUTCDate(currPtr.getUTCDate() + 1);
        }
        targetBookedDollars = Math.round(targetBookedDollars);

        const varianceDollars = currentStats.bookedDollars - targetBookedDollars;
        const percentAchieved = targetBookedDollars > 0 ? Number(((currentStats.bookedDollars / targetBookedDollars) * 100).toFixed(1)) : 100;
        const isOverBudget = varianceDollars >= 0;

        // Pacing Run-Rates (MTD and Full Year Pacing)
        const currentMonthNum = month + 1;
        const daysInCurrentMonth = new Date(Date.UTC(year, currentMonthNum, 0)).getUTCDate();
        const daysElapsedCurrentMonth = Math.max(1, maxReportDate.getUTCDate());

        // MTD actuals
        const mtdStart = new Date(Date.UTC(year, month, 1));
        const mtdStats = await getNetworkAggregateStats({
            startDate: mtdStart,
            endDate: maxReportDate,
            rep: repFilter,
            state: stateFilter,
            groupSlug: groupSlugFilter
        });
        const mtdActualBookedDollars = mtdStats.bookedDollars;
        const mtdPace = Math.round((mtdActualBookedDollars / daysElapsedCurrentMonth) * daysInCurrentMonth);

        // YTD actuals (Jan 1, 2026 to present)
        const ytdStart = new Date(Date.UTC(year, 0, 1));
        const ytdStats = await getNetworkAggregateStats({
            startDate: ytdStart,
            endDate: maxReportDate,
            rep: repFilter,
            state: stateFilter,
            groupSlug: groupSlugFilter
        });
        const ytdActualBookedDollars = ytdStats.bookedDollars;

        // Seasonally-weighted full year pace
        let cumulativeBudgetThroughCurrentMonth = 0;
        for (let m = 1; m <= currentMonthNum; m++) {
            cumulativeBudgetThroughCurrentMonth += (monthlyBudgets2026[m] || 0);
        }
        const cumulativeWeight = annual2026Budget > 0 ? (cumulativeBudgetThroughCurrentMonth / annual2026Budget) : (currentMonthNum / 12);
        
        // Jan..(CurrentMonth-1) actuals + MTD Pace
        const janPriorMonthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
        const priorMonthsStats = (month > 0) ? await getNetworkAggregateStats({
            startDate: ytdStart,
            endDate: janPriorMonthEnd,
            rep: repFilter,
            state: stateFilter,
            groupSlug: groupSlugFilter
        }) : { bookedDollars: 0 };

        const yearToDatePacedTotal = priorMonthsStats.bookedDollars + mtdPace;
        const fullYearPace = cumulativeWeight > 0 ? Math.round(yearToDatePacedTotal / cumulativeWeight) : yearToDatePacedTotal;

        res.status(200).json({
            success: true,
            dateRange: {
                startStr: formattedStart,
                endStr: formattedEnd,
                label: `${formattedStart} – ${formattedEnd}`
            },
            comparisonLabel,
            totals: currentStats,
            trends,
            budget: {
                annual2026Budget,
                targetBookedDollars,
                actualBookedDollars: currentStats.bookedDollars,
                varianceDollars,
                percentAchieved,
                isOverBudget
            },
            pacing: {
                mtdActualBookedDollars,
                mtdPace,
                daysElapsedCurrentMonth,
                daysInCurrentMonth,
                ytdActualBookedDollars,
                fullYearPace,
                annualBudget: annual2026Budget,
                ytdTargetBudget: Math.round(cumulativeBudgetThroughCurrentMonth)
            }
        });
    } catch (error) {
        console.error('Error fetching executive summary:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// GET /analytics/historical/mom
// Month-over-Month Analytics Drawer Data (Jan 2025 to Present)
// ==========================================
router.get('/historical/mom', async (req, res) => {
    try {
        const trendMode = req.query.trend === 'yoy' ? 'yoy' : 'mom';
        const stateFilter = req.query.state || null;
        const repFilter = req.query.rep || null;
        const groupSlugFilter = req.query.groupSlug || null;
        const dealerFilter = req.query.dealerId || req.query.dealer || null;
        const now = await getLatestDataDate();
        const currentYear = now.getUTCFullYear();
        const currentMonth = now.getUTCMonth(); // 0-indexed

        const monthlyBudgets2026 = await getMonthlyBudgetsMap2026(stateFilter, repFilter, groupSlugFilter);

        // Pre-resolve matching dealer locations and clientDealerIds ONCE to keep query instant
        const REP_ALIAS_MAP = getRepAliasMap();

        let filterDealerLocationIds = null;
        let filterDealerIds = null;

        if (stateFilter || repFilter || groupSlugFilter || dealerFilter) {
            const locMatch = {};
            if (dealerFilter) {
                const isObjId = mongoose.Types.ObjectId.isValid(dealerFilter);
                const dealerOrConds = [
                    { dealerId: dealerFilter },
                    { clientDealerId: dealerFilter },
                    { omniDealerId: dealerFilter }
                ];
                if (isObjId) dealerOrConds.push({ _id: dealerFilter });
                const singleDealerLoc = await DealerLocation.findOne({ $or: dealerOrConds }).select('_id clientDealerId dealerId').lean();
                if (singleDealerLoc) {
                    locMatch._id = singleDealerLoc._id;
                } else {
                    locMatch._id = new mongoose.Types.ObjectId(); // Mismatch fallback
                }
            }
            if (groupSlugFilter) {
                const grp = await DealerGroup.findOne({ slug: groupSlugFilter }).lean();
                if (grp) locMatch.dealerGroup = grp._id;
                else locMatch.dealerGroup = new mongoose.Types.ObjectId();
            }
            if (stateFilter) {
                locMatch.statePrefix = stateFilter.toUpperCase();
            }
            if (repFilter) {
                const handles = getRepHandles(repFilter);
                const handleRegexes = handles.map(h => new RegExp('^' + h + '$', 'i'));
                locMatch.dealerRepresentative = { $in: handleRegexes };
            }

            const locs = await DealerLocation.find(locMatch).select('_id clientDealerId dealerId').lean();
            filterDealerLocationIds = locs.map(l => l._id);
            filterDealerIds = locs.map(l => (l.clientDealerId || l.dealerId || '').trim().toUpperCase()).filter(Boolean);
        }

        // Build list of months from 2025-01 through current month
        const monthsList = [];
        for (let y = 2025; y <= currentYear; y++) {
            const maxM = y === currentYear ? currentMonth : 11;
            for (let m = 0; m <= maxM; m++) {
                const monthStart = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
                const monthEnd = (y === currentYear && m === currentMonth)
                    ? now
                    : new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
                monthsList.push({ year: y, monthIndex: m, start: monthStart, end: monthEnd });
            }
        }

        // Fetch monthly production stats for all months in parallel
        const monthResults = await Promise.all(
            monthsList.map(async ({ year, monthIndex, start, end }) => {
                const stats = await getNetworkAggregateStats({
                    startDate: start,
                    endDate: end,
                    rep: repFilter,
                    state: stateFilter,
                    groupSlug: groupSlugFilter,
                    dealerIds: filterDealerIds
                });

                // Get dealer status counts on monthEnd reportDate from DailyDealerSnapshot
                const snapMatch = { reportDate: { $lte: end } };
                if (filterDealerLocationIds) {
                    snapMatch.dealerLocation = { $in: filterDealerLocationIds };
                }
                const latestSnap = await DailyDealerSnapshot.findOne(snapMatch).sort({ reportDate: -1 }).select('reportDate').lean();
                
                let cohorts = { active: 0, inactive30: 0, inactive60: 0, inactive90: 0, longInactive: 0, total: 0, activePct: 0 };
                if (latestSnap) {
                    const cohortMatch = { reportDate: latestSnap.reportDate };
                    if (filterDealerLocationIds) {
                        cohortMatch.dealerLocation = { $in: filterDealerLocationIds };
                    }

                    const cohortAgg = await DailyDealerSnapshot.aggregate([
                        { $match: cohortMatch },
                        {
                            $group: {
                                _id: '$activityStatus',
                                count: { $sum: 1 }
                            }
                        }
                    ]);
                    for (const item of cohortAgg) {
                        if (item._id === 'active') cohorts.active = item.count;
                        else if (item._id === '30d_inactive') cohorts.inactive30 = item.count;
                        else if (item._id === '60d_inactive') cohorts.inactive60 = item.count;
                        else if (item._id === '90d_inactive') cohorts.inactive90 = item.count;
                        else if (item._id === 'long_inactive' || item._id === 'never_active') cohorts.longInactive += item.count;
                    }
                    cohorts.total = cohorts.active + cohorts.inactive30 + cohorts.inactive60 + cohorts.inactive90 + cohorts.longInactive;
                    cohorts.activePct = cohorts.total > 0 ? Number(((cohorts.active / cohorts.total) * 100).toFixed(1)) : 0;
                }

                const monthName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][monthIndex];
                const key = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
                const label = `${monthName} ${year}`;

                const budgetTarget = year === 2026 ? (monthlyBudgets2026[monthIndex + 1] || 0) : 0;

                return {
                    key,
                    label,
                    year,
                    monthIndex,
                    stats,
                    cohorts,
                    budgetTarget
                };
            })
        );

        // Compute MoM or YoY trend badges for each month
        for (let i = 0; i < monthResults.length; i++) {
            const curr = monthResults[i];
            let comp = null;
            if (trendMode === 'yoy') {
                comp = monthResults.find(m => m.year === curr.year - 1 && m.monthIndex === curr.monthIndex);
            } else {
                comp = i > 0 ? monthResults[i - 1] : null;
            }

            if (!comp) {
                curr.trends = {
                    apps: null,
                    approvals: null,
                    booked: null,
                    bookedDollars: null,
                    leadBooked: null,
                    leadBookedDollars: null,
                    closeBooked: null,
                    closeBookedDollars: null,
                    lookToBook: null,
                    approvalToBook: null,
                };
            } else {
                const compStats = comp.stats;
                curr.trends = {
                    apps: computeMetricTrend(curr.stats.apps, compStats.apps),
                    approvals: computeMetricTrend(curr.stats.approvals, compStats.approvals),
                    booked: computeMetricTrend(curr.stats.booked, compStats.booked),
                    bookedDollars: computeMetricTrend(curr.stats.bookedDollars, compStats.bookedDollars),
                    leadBooked: computeMetricTrend(curr.stats.leadBooked, compStats.leadBooked),
                    leadBookedDollars: computeMetricTrend(curr.stats.leadBookedDollars, compStats.leadBookedDollars),
                    closeBooked: computeMetricTrend(curr.stats.closeBooked, compStats.closeBooked),
                    closeBookedDollars: computeMetricTrend(curr.stats.closeBookedDollars, compStats.closeBookedDollars),
                    lookToBook: computeMetricTrend(curr.stats.lookToBook, compStats.lookToBook),
                    approvalToBook: computeMetricTrend(curr.stats.approvalToBook, compStats.approvalToBook),
                };
            }
        }

        res.status(200).json({
            success: true,
            trendMode,
            count: monthResults.length,
            months: monthResults
        });
    } catch (error) {
        console.error('Error fetching historical MoM analytics:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

function formatShortDate(d, showYear = false) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (showYear) {
        return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
    }
    return `${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

let cachedMaxReportDate = null;
let lastMaxFetchTime = 0;

async function getMaxReportDate() {
    const now = Date.now();
    if (cachedMaxReportDate && (now - lastMaxFetchTime < 60000)) {
        return cachedMaxReportDate;
    }
    try {
        const snap = await DailyDealerSnapshot.findOne({}).sort({ reportDate: -1 }).select('reportDate').lean();
        if (snap && snap.reportDate) {
            cachedMaxReportDate = new Date(snap.reportDate);
        } else {
            cachedMaxReportDate = new Date();
        }
    } catch (e) {
        cachedMaxReportDate = new Date();
    }
    lastMaxFetchTime = now;
    return cachedMaxReportDate;
}

async function getComparisonDateRange(startDateStr, endDateStr, trendPeriod) {
    if (trendPeriod === 'none' || (!startDateStr && !endDateStr && trendPeriod === 'none')) {
        return { compStart: null, compEnd: null, comparisonLabel: null };
    }

    const maxDate = await getMaxReportDate();
    const year = maxDate.getUTCFullYear();
    const month = maxDate.getUTCMonth();

    let start = startDateStr ? new Date(startDateStr) : new Date(Date.UTC(year, month, 1));
    let end = endDateStr ? new Date(endDateStr) : new Date(maxDate);

    if (isNaN(start.getTime())) start = new Date(Date.UTC(year, month, 1));
    if (isNaN(end.getTime())) end = new Date(maxDate);

    // Hard cap end date to max DB report date
    if (end > maxDate) {
        end = new Date(maxDate);
    }

    const durationMs = Math.max(86400000, end.getTime() - start.getTime() + 86400000);
    const durationDays = Math.round(durationMs / 86400000);

    let compStart = new Date(start);
    let compEnd = new Date(end);

    if (trendPeriod === 'yoy') {
        compStart.setUTCFullYear(compStart.getUTCFullYear() - 1);
        compEnd.setUTCFullYear(compEnd.getUTCFullYear() - 1);
    } else if (trendPeriod === 'mom') {
        const startDay = start.getUTCDate();
        const startMonth = start.getUTCMonth();
        const startYear = start.getUTCFullYear();

        // Check if current range is a full calendar month (e.g. Jun 1 to Jun 30)
        const nextDayAfterEnd = new Date(end.getTime() + 86400000);
        const isFullCalendarMonth = startDay === 1 && nextDayAfterEnd.getUTCDate() === 1;

        const prevMonth = startMonth === 0 ? 11 : startMonth - 1;
        const prevYear = startMonth === 0 ? startYear - 1 : startYear;

        if (isFullCalendarMonth) {
            // Full prior calendar month (e.g. May 1 to May 31 for June 1 to June 30)
            compStart = new Date(Date.UTC(prevYear, prevMonth, 1));
            compEnd = new Date(Date.UTC(prevYear, prevMonth + 1, 0));
        } else {
            // Partial month (e.g. MTD Jul 1-22 vs Jun 1-22)
            compStart = new Date(Date.UTC(prevYear, prevMonth, startDay));
            const endDay = Math.min(end.getUTCDate(), new Date(Date.UTC(prevYear, prevMonth + 1, 0)).getUTCDate());
            compEnd = new Date(Date.UTC(prevYear, prevMonth, endDay));
        }
    } else { // 'prior' or default equal-duration preceding lookback
        compEnd = new Date(start.getTime() - 86400000);
        compStart = new Date(compEnd.getTime() - (durationDays - 1) * 86400000);
    }

    const showYear = start.getUTCFullYear() !== compStart.getUTCFullYear() || start.getUTCFullYear() !== end.getUTCFullYear() || trendPeriod === 'yoy';
    const currLabel = `${formatShortDate(start, showYear)}–${formatShortDate(end, showYear)}`;
    const compLabel = `${formatShortDate(compStart, showYear)}–${formatShortDate(compEnd, showYear)}`;
    const comparisonLabel = `${currLabel} vs ${compLabel} (${durationDays}d)`;

    return { compStart, compEnd, comparisonLabel };
}

function computeMetricTrend(currentVal = 0, baseVal = 0) {
    const curr = currentVal || 0;
    const base = baseVal || 0;
    const diff = curr - base;
    let pct = 0;
    if (base > 0) {
        pct = Number((((curr - base) / base) * 100).toFixed(1));
    } else if (curr > 0) {
        pct = 100;
    }
    return {
        value: curr,
        baseline: base,
        diff,
        pct
    };
}

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

        const startDate = req.query.start || req.query.startDate;
        const endDate = req.query.end || req.query.endDate;
        const trendPeriod = req.query.trend || req.query.trendPeriod || 'mom';

        const { compStart, compEnd } = await getComparisonDateRange(startDate, endDate, trendPeriod);

        const dealerKeys = locations.map(d => (d.clientDealerId || d.dealerId || '').trim().toUpperCase()).filter(Boolean);
        const statsMap = await getDealerStatsMap({
            dealerIds: dealerKeys,
            startDate,
            endDate
        });

        const compStatsMap = (compStart && compEnd) ? await getDealerStatsMap({
            dealerIds: dealerKeys,
            startDate: compStart,
            endDate: compEnd
        }) : new Map();

        // Get latest snapshot for each location
        const locationsWithSnapshot = await Promise.all(
            locations.map(async (loc) => {
                const latestSnapshot = await DailyDealerSnapshot.findOne({
                    dealerLocation: loc._id
                }).sort({ reportDate: -1 }).lean();

                const key = (loc.clientDealerId || loc.dealerId || '').trim().toUpperCase();
                const curr = statsMap.get(key) || {
                    apps: 0, approvals: 0, inHouse: 0, booked: 0, bookedDollars: 0, lookToBook: 0, approvalToBook: 0
                };
                const base = compStatsMap.get(key) || {
                    apps: 0, approvals: 0, inHouse: 0, booked: 0, bookedDollars: 0, lookToBook: 0, approvalToBook: 0
                };

                const stats = {
                    ...curr,
                    trends: (compStart && compEnd) ? {
                        apps: computeMetricTrend(curr.apps, base.apps),
                        approvals: computeMetricTrend(curr.approvals, base.approvals),
                        inHouse: computeMetricTrend(curr.inHouse, base.inHouse),
                        booked: computeMetricTrend(curr.booked, base.booked),
                        bookedDollars: computeMetricTrend(curr.bookedDollars, base.bookedDollars),
                        leadBooked: computeMetricTrend(curr.leadBooked, base.leadBooked),
                        leadBookedDollars: computeMetricTrend(curr.leadBookedDollars, base.leadBookedDollars),
                        closeBooked: computeMetricTrend(curr.closeBooked, base.closeBooked),
                        closeBookedDollars: computeMetricTrend(curr.closeBookedDollars, base.closeBookedDollars),
                        lookToBook: computeMetricTrend(curr.lookToBook, base.lookToBook),
                        approvalToBook: computeMetricTrend(curr.approvalToBook, base.approvalToBook),
                    } : undefined
                };

                return {
                    ...loc,
                    latestSnapshot: latestSnapshot || null,
                    stats
                };
            })
        );

        // Fetch DRD profiles for group locations
        const locIds = locationsWithSnapshot.map(l => l._id);
        const clientIds = locationsWithSnapshot.map(l => l.clientDealerId).filter(Boolean);
        const groupProfiles = await DealerProfile.find({
            $or: [
                { dealerLocation: { $in: locIds } },
                { clientDealerId: { $in: clientIds } }
            ]
        }).select('dealerLocation clientDealerId relationshipDemand urgencyStatus manualOverride').lean();

        const drdMap = new Map();
        for (const p of groupProfiles) {
            if (p.dealerLocation) drdMap.set(p.dealerLocation.toString(), p);
            if (p.clientDealerId) drdMap.set(p.clientDealerId.trim().toUpperCase(), p);
        }

        const locationsWithDrd = locationsWithSnapshot.map(loc => {
            const p = drdMap.get(loc._id.toString()) || (loc.clientDealerId ? drdMap.get(loc.clientDealerId.trim().toUpperCase()) : null);
            return {
                ...loc,
                drd: p ? {
                    segment: p.relationshipDemand,
                    urgencyStatus: p.urgencyStatus,
                    isOverridden: Boolean(p.manualOverride?.isOverridden),
                    overriddenSegment: p.manualOverride?.overriddenSegment,
                    reason: p.manualOverride?.reason,
                    overriddenBy: p.manualOverride?.overriddenBy
                } : null
            };
        });

        res.status(200).json({
            success: true,
            group: { name: group.name, slug: group.slug, dealerCount: group.dealerCount },
            count: locationsWithDrd.length,
            locations: locationsWithDrd
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
        // Optional state/rep filters
        const statesParam = req.query.states;
        const repParam = req.query.rep || req.query.salesRep || null;
        const targetStates = statesParam
            ? String(statesParam).split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
            : null;
        const activityMode = req.query.activityMode || 'application'; // 'application' | 'approval' | 'booking'
        const useCustomMode = activityMode !== 'application';

        const REP_ALIAS_MAP = getRepAliasMap();

        // If filtering by states or rep, get matching location IDs
        let filteredLocationIds = null;
        if ((targetStates && targetStates.length > 0) || repParam) {
            const locMatch = { dealerGroup: { $ne: null } };
            if (targetStates && targetStates.length > 0) {
                locMatch.statePrefix = { $in: targetStates };
            }
            if (repParam) {
                const handles = getRepHandles(repParam);
                const handleRegexes = handles.map(h => new RegExp('^' + h + '$', 'i'));
                locMatch.dealerRepresentative = { $in: handleRegexes };
            }

            const matchingLocations = await DealerLocation.find(locMatch).select('_id').lean();
            filteredLocationIds = matchingLocations.map(l => l._id);
        }

        // Optional DRD segment filter for groups
        const drdParam = req.query.drd || req.query.drdSegment || null;
        if (drdParam && drdParam !== 'all') {
            const drdQuery = drdParam === 'overridden'
                ? { 'manualOverride.isOverridden': true }
                : { relationshipDemand: drdParam };
            const matchingProfiles = await DealerProfile.find(drdQuery).select('dealerLocation clientDealerId').lean();
            const matchingLocIds = matchingProfiles.map(p => p.dealerLocation).filter(Boolean);
            const matchingClientIds = matchingProfiles.map(p => p.clientDealerId).filter(Boolean);
            const drdLocations = await DealerLocation.find({
                $or: [
                    { _id: { $in: matchingLocIds } },
                    { clientDealerId: { $in: matchingClientIds } }
                ],
                dealerGroup: { $ne: null }
            }).select('_id').lean();
            const drdLocationIds = drdLocations.map(l => l._id.toString());
            if (filteredLocationIds) {
                filteredLocationIds = filteredLocationIds.filter(id => drdLocationIds.includes(id.toString()));
            } else {
                filteredLocationIds = drdLocations.map(l => l._id);
            }
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

        // Build status field expressions based on activityMode
        const DAYS_MAP = {
            'application': '$daysSinceLastApplication',
            'approval': '$daysSinceLastApproval',
            'booking': '$daysSinceLastBooking',
        };
        const daysField = DAYS_MAP[activityMode] || DAYS_MAP['application'];

        // For custom modes, derive status inline; for default, use existing field
        const statusExpr = useCustomMode
            ? {
                $switch: {
                    branches: [
                        { case: { $eq: [daysField, null] }, then: 'never_active' },
                        { case: { $lte: [daysField, 30] }, then: 'active' },
                        { case: { $lte: [daysField, 60] }, then: '30d_inactive' },
                        { case: { $lte: [daysField, 90] }, then: '60d_inactive' },
                    ],
                    default: 'long_inactive'
                }
            }
            : '$activityStatus';

        // Aggregate latest snapshots per group
        const groupSummaries = await DailyDealerSnapshot.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: '$dealerGroup',
                    locationCount: { $sum: 1 },
                    activeCount: {
                        $sum: { $cond: [{ $eq: [statusExpr, 'active'] }, 1, 0] }
                    },
                    inactive30Count: {
                        $sum: { $cond: [{ $eq: [statusExpr, '30d_inactive'] }, 1, 0] }
                    },
                    inactive60Count: {
                        $sum: { $cond: [{ $eq: [statusExpr, '60d_inactive'] }, 1, 0] }
                    },
                    longInactiveCount: {
                        $sum: { $cond: [{ $eq: [statusExpr, 'long_inactive'] }, 1, 0] }
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

        const startDate = req.query.start || req.query.startDate;
        const endDate = req.query.end || req.query.endDate;
        const trendPeriod = req.query.trend || req.query.trendPeriod || 'mom';
        const statusParam = req.query.status;

        const { compStart, compEnd } = await getComparisonDateRange(startDate, endDate, trendPeriod);

        // Optional status filter set
        let matchingStatusLocationSet = null;
        if (statusParam) {
            const statusMatch = { reportDate: latestDate, dealerGroup: { $ne: null } };
            if (filteredLocationIds) {
                statusMatch.dealerLocation = { $in: filteredLocationIds };
            }
            if (statusParam === 'reactivated') {
                statusMatch.reactivatedAfterVisit = true;
                const matchingSnaps = await DailyDealerSnapshot.find(statusMatch).select('dealerLocation').lean();
                matchingStatusLocationSet = new Set(matchingSnaps.map(s => s.dealerLocation.toString()));
            } else {
                const snapPipeline = [
                    { $match: statusMatch },
                    {
                        $addFields: {
                            _derivedStatus: {
                                $switch: {
                                    branches: [
                                        { case: { $eq: [daysField, null] }, then: 'never_active' },
                                        { case: { $lte: [daysField, 30] }, then: 'active' },
                                        { case: { $lte: [daysField, 60] }, then: '30d_inactive' },
                                        { case: { $lte: [daysField, 90] }, then: '60d_inactive' },
                                    ],
                                    default: 'long_inactive'
                                }
                            }
                        }
                    },
                    { $match: { _derivedStatus: statusParam } },
                    { $project: { dealerLocation: 1 } }
                ];
                const matchingSnaps = await DailyDealerSnapshot.aggregate(snapPipeline);
                matchingStatusLocationSet = new Set(matchingSnaps.map(s => s.dealerLocation.toString()));
            }
        }

        // Fetch locations belonging to dealer groups (respecting rep/state filters)
        const locMatchQuery = { dealerGroup: { $ne: null } };
        if (filteredLocationIds) {
            locMatchQuery._id = { $in: filteredLocationIds };
        }

        const allGroupLocations = await DealerLocation.find(locMatchQuery)
            .select('_id clientDealerId dealerId dealerGroup').lean();

        const allDealerKeys = allGroupLocations
            .filter(d => !matchingStatusLocationSet || matchingStatusLocationSet.has(d._id.toString()))
            .map(d => (d.clientDealerId || d.dealerId || '').trim().toUpperCase())
            .filter(Boolean);

        const currentStatsMap = await getDealerStatsMap({
            dealerIds: allDealerKeys,
            startDate,
            endDate
        });

        const compStatsMap = (compStart && compEnd) ? await getDealerStatsMap({
            dealerIds: allDealerKeys,
            startDate: compStart,
            endDate: compEnd
        }) : new Map();

        // Aggregate distinct states per group from DealerLocation
        const groupStates = await DealerLocation.aggregate([
            { $match: { dealerGroup: { $ne: null }, statePrefix: { $ne: null } } },
            { $group: { _id: '$dealerGroup', states: { $addToSet: '$statePrefix' } } },
        ]);
        const statesMap = {};
        for (const gs of groupStates) {
            statesMap[gs._id.toString()] = gs.states.sort();
        }

        // Group location keys by group ID (respecting status filter)
        const locationsByGroup = {};
        for (const loc of allGroupLocations) {
            if (matchingStatusLocationSet && !matchingStatusLocationSet.has(loc._id.toString())) {
                continue;
            }
            const gId = loc.dealerGroup.toString();
            if (!locationsByGroup[gId]) locationsByGroup[gId] = [];
            const key = (loc.clientDealerId || loc.dealerId || '').trim().toUpperCase();
            if (key) locationsByGroup[gId].push(key);
        }

        // Merge summaries + states + stats into groups
        const enrichedGroups = groups.map(g => {
            const gId = g._id.toString();
            const keys = locationsByGroup[gId] || [];

            let groupApps = 0;
            let groupApprovals = 0;
            let groupInHouse = 0;
            let groupLeadBooked = 0;
            let groupLeadBookedDollars = 0;
            let groupCloseBooked = 0;
            let groupCloseBookedDollars = 0;
            let groupFicoSum = 0;
            let groupFicoCount = 0;

            let baseApps = 0;
            let baseApprovals = 0;
            let baseInHouse = 0;
            let baseLeadBooked = 0;
            let baseLeadBookedDollars = 0;
            let baseCloseBooked = 0;
            let baseCloseBookedDollars = 0;

            for (const key of keys) {
                const curr = currentStatsMap.get(key);
                if (curr) {
                    groupApps += curr.apps || 0;
                    groupApprovals += curr.approvals || 0;
                    groupInHouse += curr.inHouse || 0;
                    groupLeadBooked += curr.leadBooked || 0;
                    groupLeadBookedDollars += curr.leadBookedDollars || 0;
                    groupCloseBooked += curr.closeBooked ?? curr.booked ?? 0;
                    groupCloseBookedDollars += curr.closeBookedDollars ?? curr.bookedDollars ?? 0;
                    if (curr.avgFico && curr.apps) {
                        groupFicoSum += curr.avgFico * curr.apps;
                        groupFicoCount += curr.apps;
                    }
                }
                const base = compStatsMap.get(key);
                if (base) {
                    baseApps += base.apps || 0;
                    baseApprovals += base.approvals || 0;
                    baseInHouse += base.inHouse || 0;
                    baseLeadBooked += base.leadBooked || 0;
                    baseLeadBookedDollars += base.leadBookedDollars || 0;
                    baseCloseBooked += base.closeBooked ?? base.booked ?? 0;
                    baseCloseBookedDollars += base.closeBookedDollars ?? base.bookedDollars ?? 0;
                }
            }

            const lookToBook = groupApps > 0 ? Number((groupLeadBooked / groupApps).toFixed(4)) : 0;
            const approvalToBook = groupApprovals > 0 ? Number((groupLeadBooked / groupApprovals).toFixed(4)) : 0;
            const avgFico = groupFicoCount > 0 ? Math.round(groupFicoSum / groupFicoCount) : null;

            const baseLookToBook = baseApps > 0 ? Number((baseLeadBooked / baseApps).toFixed(4)) : 0;
            const baseApprovalToBook = baseApprovals > 0 ? Number((baseLeadBooked / baseApprovals).toFixed(4)) : 0;

            const stats = {
                apps: groupApps,
                approvals: groupApprovals,
                inHouse: groupInHouse,
                leadBooked: groupLeadBooked,
                leadBookedDollars: groupLeadBookedDollars,
                closeBooked: groupCloseBooked,
                closeBookedDollars: groupCloseBookedDollars,
                booked: groupCloseBooked,
                bookedDollars: groupCloseBookedDollars,
                lookToBook,
                approvalToBook,
                avgFico,
                trends: (compStart && compEnd) ? {
                    apps: computeMetricTrend(groupApps, baseApps),
                    approvals: computeMetricTrend(groupApprovals, baseApprovals),
                    inHouse: computeMetricTrend(groupInHouse, baseInHouse),
                    leadBooked: computeMetricTrend(groupLeadBooked, baseLeadBooked),
                    leadBookedDollars: computeMetricTrend(groupLeadBookedDollars, baseLeadBookedDollars),
                    closeBooked: computeMetricTrend(groupCloseBooked, baseCloseBooked),
                    closeBookedDollars: computeMetricTrend(groupCloseBookedDollars, baseCloseBookedDollars),
                    booked: computeMetricTrend(groupCloseBooked, baseCloseBooked),
                    bookedDollars: computeMetricTrend(groupCloseBookedDollars, baseCloseBookedDollars),
                    lookToBook: computeMetricTrend(lookToBook, baseLookToBook),
                    approvalToBook: computeMetricTrend(approvalToBook, baseApprovalToBook),
                } : undefined
            };

            return {
                ...g,
                states: statesMap[gId] || [],
                summary: summaryMap[gId] || null,
                stats,
            };
        });

        // If rep or state filter is active, only return groups that have matching locations
        const finalGroups = filteredLocationIds
            ? enrichedGroups.filter(g => {
                const gId = g._id.toString();
                return summaryMap[gId] || (locationsByGroup[gId] && locationsByGroup[gId].length > 0);
            })
            : enrichedGroups;

        res.status(200).json({
            success: true,
            count: finalGroups.length,
            groups: finalGroups
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

        // Get latest 2 report dates (for transition calculation)
        const latestDatesAgg = await DailyDealerSnapshot.aggregate([
            { $group: { _id: '$reportDate' } },
            { $sort: { _id: -1 } },
            { $limit: 2 },
        ]);
        const latestDate = latestDatesAgg.length > 0 ? latestDatesAgg[0]._id : null;
        const previousDate = latestDatesAgg.length > 1 ? latestDatesAgg[1]._id : null;
        const startDate = req.query.start || req.query.startDate || null;
        const endDate = req.query.end || req.query.endDate || null;

        // Map frontend sort keys to snapshot & stat fields
        const STAT_FIELDS = [
            'apps', 'approvals', 'inHouse', 'booked', 'bookedDollars', 
            'lookToBook', 'approvalToBook', 'leadBooked', 'leadBookedDollars', 
            'appBkd', 'appBooked', 'appBookedDollars', 'avgFico'
        ];
        const isSortingByStat = sortFields.some(f => STAT_FIELDS.includes(f));

        const SORT_FIELD_MAP = {
            'name': 'dealerName',
            'dealerName': 'dealerName',
            'daysSinceLastApplication': 'latestSnapshot.daysSinceLastApplication',
            'daysSinceLastApproval': 'latestSnapshot.daysSinceLastApproval',
            'daysSinceLastBooking': 'latestSnapshot.daysSinceLastBooking',
            'activityStatus': 'latestSnapshot.activityStatus',
            'commDays': '_commDaysNum',
            'visitToApp': 'latestSnapshot.daysFromVisitToNextApp',
            'apps': 'stats.apps',
            'approvals': 'stats.approvals',
            'inHouse': 'stats.inHouse',
            'leadBooked': 'stats.leadBooked',
            'appBkd': 'stats.leadBooked',
            'appBooked': 'stats.leadBooked',
            'leadBookedDollars': 'stats.leadBookedDollars',
            'appBookedDollars': 'stats.leadBookedDollars',
            'booked': 'stats.booked',
            'bookedDollars': 'stats.bookedDollars',
            'lookToBook': 'stats.lookToBook',
            'approvalToBook': 'stats.approvalToBook',
            'avgFico': 'stats.avgFico',
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
        const repParam = req.query.rep || req.query.salesRep || null;
        const activityMode = req.query.activityMode || 'application'; // 'application' | 'approval' | 'booking'
        const searchQuery = req.query.search ? String(req.query.search).trim() : '';
        const transitionParam = req.query.transition || null; // e.g. "active→30d_inactive"

        const REP_ALIAS_MAP = getRepAliasMap();

        const baseMatch = scope === 'all' ? {} : { dealerGroup: null };
        if (statesParam && statesParam.length > 0) {
            baseMatch.statePrefix = { $in: statesParam };
        }
        if (repParam) {
            const handles = getRepHandles(repParam);
            const handleRegexes = handles.map(h => new RegExp('^' + h + '$', 'i'));
            baseMatch.dealerRepresentative = { $in: handleRegexes };
        }
        if (searchQuery) {
            baseMatch.dealerName = { $regex: searchQuery, $options: 'i' };
        }

        // Optional DRD segment filter
        const drdParam = req.query.drd || req.query.drdSegment || null;
        if (drdParam && drdParam !== 'all') {
            const drdQuery = drdParam === 'overridden'
                ? { 'manualOverride.isOverridden': true }
                : { relationshipDemand: drdParam };
            const matchingProfiles = await DealerProfile.find(drdQuery).select('dealerLocation clientDealerId').lean();
            const matchingLocIds = matchingProfiles.map(p => p.dealerLocation).filter(Boolean);
            const matchingClientIds = matchingProfiles.map(p => p.clientDealerId).filter(Boolean);
            baseMatch.$or = [
                { _id: { $in: matchingLocIds } },
                { clientDealerId: { $in: matchingClientIds } }
            ];
        }

        // Map activityMode to the daysSince field for derived status
        const DAYS_FIELD_MAP = {
            'application': '$latestSnapshot.daysSinceLastApplication',
            'approval': '$latestSnapshot.daysSinceLastApproval',
            'booking': '$latestSnapshot.daysSinceLastBooking',
        };
        const daysField = DAYS_FIELD_MAP[activityMode] || DAYS_FIELD_MAP['application'];
        const useCustomMode = activityMode !== 'application';

        // ── Status Transitions: compare latest 2 dates ──
        let statusTransitions = [];
        let transitionDealerIds = null;

        if (latestDate && previousDate) {
            // Build scoped location IDs for transition computation
            const transBaseMatch = { ...baseMatch };
            delete transBaseMatch.dealerName; // Don't scope transitions by search query
            const hasScopeFilters = Object.keys(transBaseMatch).length > 0;
            let transitionLocFilter = {};
            if (hasScopeFilters) {
                const scopedLocs = await DealerLocation.find(transBaseMatch).select('_id').lean();
                transitionLocFilter = { dealerLocation: { $in: scopedLocs.map(l => l._id) } };
            }

            // Days field for $switch derivation (snapshot-level)
            const SNAP_DAYS_MAP = {
                'application': '$daysSinceLastApplication',
                'approval': '$daysSinceLastApproval',
                'booking': '$daysSinceLastBooking',
            };
            const snapDaysField = SNAP_DAYS_MAP[activityMode] || SNAP_DAYS_MAP['application'];

            const statusSwitch = {
                $switch: {
                    branches: [
                        { case: { $eq: [snapDaysField, null] }, then: 'never_active' },
                        { case: { $lte: [snapDaysField, 30] }, then: 'active' },
                        { case: { $lte: [snapDaysField, 60] }, then: '30d_inactive' },
                        { case: { $lte: [snapDaysField, 90] }, then: '60d_inactive' },
                        { case: { $lte: [snapDaysField, 120] }, then: '90d_inactive' },
                    ],
                    default: 'long_inactive'
                }
            };

            // Build $switch for previous snapshot's days field
            const prevDaysField = snapDaysField.replace('$', '$_prevSnap.');
            const prevStatusSwitch = {
                $switch: {
                    branches: [
                        { case: { $eq: [prevDaysField, null] }, then: 'never_active' },
                        { case: { $lte: [prevDaysField, 30] }, then: 'active' },
                        { case: { $lte: [prevDaysField, 60] }, then: '30d_inactive' },
                        { case: { $lte: [prevDaysField, 90] }, then: '60d_inactive' },
                        { case: { $lte: [prevDaysField, 120] }, then: '90d_inactive' },
                    ],
                    default: 'long_inactive'
                }
            };

            const latestMatch = { reportDate: latestDate, ...transitionLocFilter };

            const transitionPipeline = [
                { $match: latestMatch },
                { $addFields: { _currentStatus: statusSwitch } },
                {
                    $lookup: {
                        from: 'dailydealersnapshots',
                        let: { locId: '$dealerLocation' },
                        pipeline: [
                            { $match: { $expr: { $and: [
                                { $eq: ['$dealerLocation', '$$locId'] },
                                { $eq: ['$reportDate', previousDate] },
                            ] } } },
                            { $limit: 1 },
                        ],
                        as: '_prevSnap',
                    }
                },
                { $addFields: { _prevSnap: { $arrayElemAt: ['$_prevSnap', 0] } } },
                { $match: { _prevSnap: { $ne: null } } },
                { $addFields: { _previousStatus: prevStatusSwitch } },
                { $match: { $expr: { $ne: ['$_currentStatus', '$_previousStatus'] } } },
            ];

            const transitionSummary = await DailyDealerSnapshot.aggregate([
                ...transitionPipeline,
                { $group: {
                    _id: { from: '$_previousStatus', to: '$_currentStatus' },
                    count: { $sum: 1 },
                    dealerLocations: { $push: '$dealerLocation' },
                } },
                { $sort: { count: -1 } },
            ]);

            statusTransitions = transitionSummary.map(t => ({
                from: t._id.from,
                to: t._id.to,
                count: t.count,
            }));

            // If filtering by a specific transition, extract matching dealer location IDs
            if (transitionParam) {
                const parts = transitionParam.split('\u2192');
                const fromStatus = parts[0];
                const toStatus = parts[1];
                const match = transitionSummary.find(t => t._id.from === fromStatus && t._id.to === toStatus);
                transitionDealerIds = match ? match.dealerLocations : [];
            }
        }

        // If transition filter is active, inject into baseMatch
        if (transitionDealerIds !== null) {
            baseMatch._id = { $in: transitionDealerIds };
        }

        // Prepare application date range criteria for inline stats calculation
        let startD = startDate ? new Date(startDate) : null;
        let endD = endDate ? new Date(endDate) : null;
        if (endD) endD.setUTCHours(23, 59, 59, 999);

        const appMatchExpr = [
            { $eq: ['$clientDealerId', '$$cId'] }
        ];
        if (startD) appMatchExpr.push({ $gte: ['$applicationDate', startD] });
        if (endD) appMatchExpr.push({ $lte: ['$applicationDate', endD] });

        let dealers = [];
        let totalCount = 0;

        if (isSortingByStat) {
            // Fast path for stat sorting:
            // 1. Fetch aggregated stats for all dealers via single indexed $group query
            const statsMap = await getDealerStatsMap({
                startDate,
                endDate
            });

            // 2. Fetch matching locations with latest snapshots
            const locationPipeline = [
                { $match: baseMatch },
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
                { $project: { snapshotArr: 0 } }] : []),
                {
                    $addFields: {
                        'latestSnapshot._derivedStatus': {
                            $switch: {
                                branches: [
                                    { case: { $eq: [daysField, null] }, then: 'never_active' },
                                    { case: { $lte: [daysField, 30] }, then: 'active' },
                                    { case: { $lte: [daysField, 60] }, then: '30d_inactive' },
                                    { case: { $lte: [daysField, 90] }, then: '60d_inactive' },
                                    { case: { $lte: [daysField, 120] }, then: '90d_inactive' },
                                ],
                                default: 'long_inactive'
                            }
                        }
                    }
                },
                ...(statusParam ? [
                    statusParam === 'reactivated'
                        ? { $match: { 'latestSnapshot.reactivatedAfterVisit': true } }
                        : { $match: { 'latestSnapshot._derivedStatus': statusParam } }
                ] : [])
            ];

            const matchingLocations = await DealerLocation.aggregate(locationPipeline);

            // Helper to find stats for a location using exact key lookup
            function getStatsForLoc(loc) {
                const k1 = (loc.clientDealerId || '').trim().toUpperCase();
                if (k1 && statsMap.has(k1)) return statsMap.get(k1);
                const k2 = (loc.dealerId || '').trim().toUpperCase();
                if (k2 && statsMap.has(k2)) return statsMap.get(k2);
                
                return { apps: 0, approvals: 0, inHouse: 0, booked: 0, bookedDollars: 0, lookToBook: 0, approvalToBook: 0 };
            }

            // 3. Attach stats to each matching location
            for (const loc of matchingLocations) {
                loc.stats = getStatsForLoc(loc);
            }

            // 4. Sort matchingLocations in memory by stat columns with dealerName tie-breaker
            matchingLocations.sort((a, b) => {
                for (const sc of sortColumns) {
                    const statKey = sc.resolved.replace('stats.', '');
                    const aVal = a.stats?.[statKey] ?? (sc.dir === 1 ? 99999999 : -1);
                    const bVal = b.stats?.[statKey] ?? (sc.dir === 1 ? 99999999 : -1);
                    if (aVal !== bVal) {
                        return (aVal - bVal) * sc.dir;
                    }
                }
                return (a.dealerName || '').localeCompare(b.dealerName || '');
            });

            totalCount = matchingLocations.length;
            dealers = matchingLocations.slice(skip, skip + limit);
        } else {
            // Standard pipeline for non-stat sort (dealerName, daysSinceLastApp, activityStatus, etc.)
            const pipeline = [
                { $match: baseMatch },
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
                { $project: { snapshotArr: 0 } }] : []),
                {
                    $addFields: {
                        'latestSnapshot._derivedStatus': {
                            $switch: {
                                branches: [
                                    { case: { $eq: [daysField, null] }, then: 'never_active' },
                                    { case: { $lte: [daysField, 30] }, then: 'active' },
                                    { case: { $lte: [daysField, 60] }, then: '30d_inactive' },
                                    { case: { $lte: [daysField, 90] }, then: '60d_inactive' },
                                    { case: { $lte: [daysField, 120] }, then: '90d_inactive' },
                                ],
                                default: 'long_inactive'
                            }
                        }
                    }
                },
                ...(statusParam ? [
                    statusParam === 'reactivated'
                        ? { $match: { 'latestSnapshot.reactivatedAfterVisit': true } }
                        : { $match: { 'latestSnapshot._derivedStatus': statusParam } }
                ] : []),
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
                {
                    $addFields: Object.fromEntries(
                        sortColumns.map(sc => [
                            sc.key,
                            (sc.resolved.startsWith('latestSnapshot.') || sc.resolved === '_commDaysNum')
                                ? { $ifNull: [`$${sc.resolved}`, sc.dir === 1 ? 99999999 : -1] }
                                : `$${sc.resolved}`
                        ])
                    )
                },
                { $sort: Object.fromEntries(sortColumns.map(sc => [sc.key, sc.dir])) },
                { $project: { ...Object.fromEntries(sortColumns.map(sc => [sc.key, 0])), _commDaysNum: 0 } },
            ];

            if (!statusParam) {
                totalCount = await DealerLocation.countDocuments(baseMatch);
            } else {
                const countPipeline = [
                    { $match: baseMatch },
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
                    { $project: { snapshotArr: 0 } }] : []),
                    {
                        $addFields: {
                            'latestSnapshot._derivedStatus': {
                                $switch: {
                                    branches: [
                                        { case: { $eq: [daysField, null] }, then: 'never_active' },
                                        { case: { $lte: [daysField, 30] }, then: 'active' },
                                        { case: { $lte: [daysField, 60] }, then: '30d_inactive' },
                                        { case: { $lte: [daysField, 90] }, then: '60d_inactive' },
                                        { case: { $lte: [daysField, 120] }, then: '90d_inactive' },
                                    ],
                                    default: 'long_inactive'
                                }
                            }
                        }
                    },
                    ...(statusParam === 'reactivated'
                        ? [{ $match: { 'latestSnapshot.reactivatedAfterVisit': true } }]
                        : [{ $match: { 'latestSnapshot._derivedStatus': statusParam } }]),
                    { $count: 'total' }
                ];
                const cRes = await DealerLocation.aggregate(countPipeline);
                totalCount = cRes.length > 0 ? cRes[0].total : 0;
            }

            dealers = await DealerLocation.aggregate([
                ...pipeline,
                { $skip: skip },
                { $limit: limit },
            ]);
        }

        // Status breakdown for dealers in this scope (not just this page)
        let statusBreakdown = null;
        if (latestDate) {
            // Always scope breakdown by baseMatch (respects state filter + scope)
            // Exclude transition _id filter from breakdown to show full counts
            const breakdownBaseMatch = { ...baseMatch };
            delete breakdownBaseMatch._id;
            const hasFilters = Object.keys(breakdownBaseMatch).length > 0;
            let breakdownMatch = { reportDate: latestDate };
            if (hasFilters) {
                const scopedIds = await DealerLocation.find(breakdownBaseMatch).select('_id').lean();
                breakdownMatch.dealerLocation = { $in: scopedIds.map(l => l._id) };
            }

            // Derive status from the days field in breakdown
            const BREAKDOWN_DAYS_MAP = {
                'application': '$daysSinceLastApplication',
                'approval': '$daysSinceLastApproval',
                'booking': '$daysSinceLastBooking',
            };
            const brkDaysField = BREAKDOWN_DAYS_MAP[activityMode] || BREAKDOWN_DAYS_MAP['application'];

            const breakdownPipeline = [
                { $match: breakdownMatch },
                {
                    $addFields: {
                        _derivedStatus: {
                            $switch: {
                                branches: [
                                    { case: { $eq: [brkDaysField, null] }, then: 'never_active' },
                                    { case: { $lte: [brkDaysField, 30] }, then: 'active' },
                                    { case: { $lte: [brkDaysField, 60] }, then: '30d_inactive' },
                                    { case: { $lte: [brkDaysField, 90] }, then: '60d_inactive' },
                                    { case: { $lte: [brkDaysField, 120] }, then: '90d_inactive' },
                                ],
                                default: 'long_inactive'
                            }
                        }
                    }
                },
                {
                    $group: {
                        _id: '$_derivedStatus',
                        count: { $sum: 1 }
                    }
                }
            ];

            const breakdownAgg = await DailyDealerSnapshot.aggregate(breakdownPipeline);

            const b = { active: 0, inactive30d: 0, inactive60d: 0, inactive90d: 0, longInactive: 0 };
            for (const item of breakdownAgg) {
                if (item._id === 'active') b.active = item.count;
                else if (item._id === '30d_inactive') b.inactive30d = item.count;
                else if (item._id === '60d_inactive') b.inactive60d = item.count;
                else if (item._id === '90d_inactive') b.inactive90d = item.count;
                else if (item._id === 'long_inactive' || item._id === 'never_active') b.longInactive += item.count;
            }

            statusBreakdown = {
                total: b.active + b.inactive30d + b.inactive60d + b.inactive90d + b.longInactive,
                active: b.active,
                inactive30: b.inactive30d,
                inactive60: b.inactive60d,
                inactive90: b.inactive90d,
                inactive30d: b.inactive30d,
                inactive60d: b.inactive60d,
                inactive90d: b.inactive90d,
                longInactive: b.longInactive,
            };
        }

        // Trend Comparison Period Calculation
        const trendPeriod = req.query.trend || req.query.trendPeriod || 'mom';
        const { compStart, compEnd, comparisonLabel } = await getComparisonDateRange(startDate, endDate, trendPeriod);

        const pageDealerKeys = dealers.map(d => (d.clientDealerId || d.dealerId || '').trim().toUpperCase()).filter(Boolean);
        
        // Fetch current stats for non-stat sort page dealers
        if (!isSortingByStat) {
            const statsMap = await getDealerStatsMap({
                dealerIds: pageDealerKeys,
                startDate,
                endDate
            });

            for (const dealer of dealers) {
                const key = (dealer.clientDealerId || dealer.dealerId || '').trim().toUpperCase();
                dealer.stats = statsMap.get(key) || {
                    apps: 0,
                    approvals: 0,
                    inHouse: 0,
                    booked: 0,
                    bookedDollars: 0,
                    lookToBook: 0,
                    approvalToBook: 0
                };
            }
        }

        // Fetch baseline comparison stats for trend badges & baseline numbers (if comparison active)
        const compStatsMap = (compStart && compEnd) ? await getDealerStatsMap({
            dealerIds: pageDealerKeys,
            startDate: compStart,
            endDate: compEnd
        }) : new Map();

        for (const dealer of dealers) {
            const key = (dealer.clientDealerId || dealer.dealerId || '').trim().toUpperCase();
            const curr = dealer.stats || { apps: 0, approvals: 0, inHouse: 0, booked: 0, bookedDollars: 0, lookToBook: 0, approvalToBook: 0 };
            const base = compStatsMap.get(key) || { apps: 0, approvals: 0, inHouse: 0, booked: 0, bookedDollars: 0, lookToBook: 0, approvalToBook: 0 };

            dealer.stats = {
                ...curr,
                trends: (compStart && compEnd) ? {
                    apps: computeMetricTrend(curr.apps, base.apps),
                    approvals: computeMetricTrend(curr.approvals, base.approvals),
                    inHouse: computeMetricTrend(curr.inHouse, base.inHouse),
                    booked: computeMetricTrend(curr.booked, base.booked),
                    bookedDollars: computeMetricTrend(curr.bookedDollars, base.bookedDollars),
                    leadBooked: computeMetricTrend(curr.leadBooked, base.leadBooked),
                    leadBookedDollars: computeMetricTrend(curr.leadBookedDollars, base.leadBookedDollars),
                    closeBooked: computeMetricTrend(curr.closeBooked, base.closeBooked),
                    closeBookedDollars: computeMetricTrend(curr.closeBookedDollars, base.closeBookedDollars),
                    lookToBook: computeMetricTrend(curr.lookToBook, base.lookToBook),
                    approvalToBook: computeMetricTrend(curr.approvalToBook, base.approvalToBook),
                } : undefined
            };
        }

        // Attach DRD relationship demand profile to each dealer
        const pageLocIds = dealers.map(d => d._id);
        const drdProfiles = await DealerProfile.find({
            $or: [
                { dealerLocation: { $in: pageLocIds } },
                { clientDealerId: { $in: pageDealerKeys } }
            ]
        }).select('dealerLocation clientDealerId relationshipDemand urgencyStatus manualOverride').lean();

        const drdMap = new Map();
        for (const p of drdProfiles) {
            if (p.dealerLocation) drdMap.set(p.dealerLocation.toString(), p);
            if (p.clientDealerId) drdMap.set(p.clientDealerId.trim().toUpperCase(), p);
        }

        for (const dealer of dealers) {
            const p = drdMap.get(dealer._id.toString()) || (dealer.clientDealerId ? drdMap.get(dealer.clientDealerId.trim().toUpperCase()) : null);
            dealer.drd = p ? {
                segment: p.relationshipDemand,
                urgencyStatus: p.urgencyStatus,
                isOverridden: Boolean(p.manualOverride?.isOverridden),
                overriddenSegment: p.manualOverride?.overriddenSegment,
                reason: p.manualOverride?.reason,
                overriddenBy: p.manualOverride?.overriddenBy
            } : null;
        }

        res.status(200).json({
            success: true,
            dealers,
            statusBreakdown,
            statusTransitions,
            comparisonLabel,
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

// ==========================================
// Rolling Averages — In-Memory Cache (5 min TTL)
// ==========================================
const { computeNetworkRollingAvg, computeRepScorecard } = require('../../services/rollingAverages');

const rollingAvgCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCached(key) {
    const entry = rollingAvgCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL_MS) {
        rollingAvgCache.delete(key);
        return null;
    }
    return entry.data;
}

function setCache(key, data) {
    rollingAvgCache.set(key, { data, ts: Date.now() });
}

// ==========================================
// GET /analytics/rolling-averages
// Network-level rolling averages (company-wide or by state)
// Query: ?window=7|30&states=TX,FL&debug=true
// ==========================================
router.get('/rolling-averages', async (req, res) => {
    try {
        const windowSize = Math.min(60, Math.max(1, parseInt(req.query.window) || 7));
        const statesParam = req.query.states
            ? String(req.query.states).split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
            : null;
        const statusParam = req.query.status
            ? String(req.query.status).split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
            : null;
        const mode = ['application', 'approval', 'booking'].includes(req.query.mode) ? req.query.mode : 'application';
        const debug = req.query.debug === 'true';

        const cacheKey = `ra:${windowSize}:${(statesParam || []).join(',')}:${(statusParam || []).join(',')}:${mode}`;
        let result = getCached(cacheKey);

        if (!result) {
            result = await computeNetworkRollingAvg(windowSize, statesParam, statusParam, mode);
            setCache(cacheKey, result);
        }

        const response = { success: true, ...result };
        if (debug) {
            // Fetch raw dates for debug
            const DailySnap = require('../../models/DailyDealerSnapshot');
            const rawDates = await DailySnap.aggregate([
                { $group: { _id: '$reportDate' } },
                { $sort: { _id: -1 } },
                { $limit: windowSize * 2 },
            ]);
            response._debug = {
                reportDates: rawDates.map(d => d._id.toISOString()),
            };
        }

        res.status(200).json(response);
    } catch (error) {
        console.error('Error computing rolling averages:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// GET /analytics/rep-scorecard
// Per-rep rolling averages + dealer counts + churn flows
// Query: ?window=7|30&debug=true
// ==========================================
router.get('/rep-scorecard', async (req, res) => {
    try {
        const windowSize = Math.min(60, Math.max(1, parseInt(req.query.window) || 7));
        const statusParam = req.query.status
            ? String(req.query.status).split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
            : null;
        const mode = ['application', 'approval', 'booking'].includes(req.query.mode) ? req.query.mode : 'application';
        const finPeriod = ['mtd', '30d', '90d', 'ytd', 'all'].includes(req.query.finPeriod) ? req.query.finPeriod : 'mtd';
        const debug = req.query.debug === 'true';

        const cacheKey = `rs:${windowSize}:${(statusParam || []).join(',')}:${mode}:${finPeriod}`;
        let result = getCached(cacheKey);

        if (!result) {
            result = await computeRepScorecard(windowSize, statusParam, mode, finPeriod);
            setCache(cacheKey, result);
        }

        const response = { success: true, ...result };
        if (debug) {
            const DailySnap = require('../../models/DailyDealerSnapshot');
            const rawDates = await DailySnap.aggregate([
                { $group: { _id: '$reportDate' } },
                { $sort: { _id: -1 } },
                { $limit: windowSize * 2 },
            ]);
            response._debug = {
                reportDates: rawDates.map(d => d._id.toISOString()),
            };
        }

        res.status(200).json(response);
    } catch (error) {
        console.error('Error computing rep scorecard:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// GET /analytics/dealer-stats
// Query application statistics for date ranges, reps, states, or dealer IDs
// ==========================================
router.get('/dealer-stats', async (req, res) => {
    try {
        const startDate = req.query.start || req.query.startDate;
        const endDate = req.query.end || req.query.endDate;
        const rep = req.query.rep;
        const state = req.query.state;
        const dealerIdParam = req.query.dealerId || req.query.dealerIds;

        const dealerIds = dealerIdParam
            ? String(dealerIdParam).split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
            : null;

        const statsMap = await getDealerStatsMap({
            dealerIds,
            startDate,
            endDate,
            rep,
            state
        });

        // Convert Map to plain object for JSON response
        const stats = {};
        for (const [key, val] of statsMap.entries()) {
            stats[key] = val;
        }

        const networkTotals = await getNetworkAggregateStats({
            startDate,
            endDate,
            rep,
            state
        });

        res.status(200).json({
            success: true,
            dateRange: { startDate, endDate },
            networkTotals,
            count: statsMap.size,
            stats
        });
    } catch (error) {
        console.error('Error fetching dealer stats:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// GET /analytics/dealers/search
// Search dealer locations by name, dealerId, or clientDealerId
// ==========================================
router.get('/dealers/search', async (req, res) => {
    try {
        const q = String(req.query.q || req.query.query || '').trim();
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
        let match = {};
        if (q) {
            const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            match = {
                $or: [
                    { dealerName: regex },
                    { dealerId: regex },
                    { clientDealerId: regex }
                ]
            };
        }
        const dealers = await DealerLocation.find(match, '_id dealerName dealerId clientDealerId statePrefix')
            .sort({ dealerName: 1 })
            .limit(limit)
            .lean();

        res.status(200).json({
            success: true,
            count: dealers.length,
            dealers
        });
    } catch (error) {
        console.error('Error searching dealers:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// GET /analytics/dealers/:dealerId/applications
// Bottom-up drawer application history & summary metrics for a dealer or group
// ==========================================
router.get('/dealers/:dealerId/applications', async (req, res) => {
    try {
        const { dealerId } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const skip = (page - 1) * limit;

        // Resolve location document or group to find canonical clientDealerId(s)
        let location = null;
        let headerLocation = null;
        let matchQuery = {};

        if (dealerId === 'all' || dealerId === 'network') {
            headerLocation = null;
            matchQuery = {};
            if (req.query.state) {
                matchQuery.dealerState = req.query.state.toUpperCase();
            }
            if (req.query.rep) {
                const handles = getRepHandles(req.query.rep);
                const handleRegexes = handles.map(h => new RegExp('^' + h + '$', 'i'));
                matchQuery.dealerRepresentative = { $in: handleRegexes };
            }
            if (req.query.group) {
                matchQuery.dealerGroup = new RegExp(req.query.group, 'i');
            }
            if (req.query.underwriter) {
                matchQuery.underwriter = new RegExp('^' + req.query.underwriter + '$', 'i');
            }
        } else {
            if (mongoose.Types.ObjectId.isValid(dealerId)) {
                location = await DealerLocation.findById(dealerId).lean();
            }
            if (!location) {
                location = await DealerLocation.findOne({
                    $or: [
                        { dealerId: dealerId },
                        { clientDealerId: dealerId },
                        { omniDealerId: dealerId }
                    ]
                }).lean();
            }

            if (!location) {
                // Check if dealerId is a Dealer Group slug or ID
                let grp = null;
                if (mongoose.Types.ObjectId.isValid(dealerId)) {
                    grp = await DealerGroup.findById(dealerId).lean();
                }
                if (!grp) {
                    grp = await DealerGroup.findOne({ slug: dealerId }).lean();
                }
                if (grp) {
                    const locs = await DealerLocation.find({ dealerGroup: grp._id }).select('clientDealerId dealerId').lean();
                    const ids = locs.map(l => (l.clientDealerId || l.dealerId || '').trim()).filter(Boolean);
                    matchQuery = { clientDealerId: { $in: ids } };
                    headerLocation = {
                        _id: grp._id,
                        dealerName: grp.name,
                        dealerId: `Group (${grp.dealerCount || locs.length} locs)`,
                        clientDealerId: grp.slug,
                        statePrefix: (grp.states || []).join(', ')
                    };
                } else {
                    return res.status(404).json({ success: false, message: 'Dealer location or group not found' });
                }
            } else {
                const canonicalId = (location.clientDealerId || location.dealerId).trim();
                matchQuery = { clientDealerId: canonicalId };
                headerLocation = {
                    _id: location._id,
                    dealerName: location.dealerName,
                    dealerId: location.dealerId,
                    clientDealerId: location.clientDealerId,
                    statePrefix: location.statePrefix
                };
            }
        }

        // Apply Underwriter filter
        if (req.query.underwriter) {
            matchQuery.underwriter = new RegExp('^' + req.query.underwriter.trim() + '$', 'i');
        }

        // Apply Date Range filter (startDate & endDate)
        if (req.query.startDate || req.query.endDate) {
            matchQuery.applicationDate = {};
            if (req.query.startDate) {
                matchQuery.applicationDate.$gte = new Date(req.query.startDate + (req.query.startDate.includes('T') ? '' : 'T00:00:00.000Z'));
            }
            if (req.query.endDate) {
                matchQuery.applicationDate.$lte = new Date(req.query.endDate + (req.query.endDate.includes('T') ? '' : 'T23:59:59.999Z'));
            }
        }

        const now = await getLatestDataDate();
        const ytdStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
        const mtdStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

        // Summary Aggregations (All-Time, YTD, MTD)
        const summaryAgg = await Application.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: null,
                    allTimeApps: { $sum: 1 },
                    allTimeApprovals: { $sum: { $cond: [{ $or: [{ $eq: ['$wasApproved', true] }, { $in: ['$status', ['Approved', 'Conditional Approval', 'Auto Approval']] }] }, 1, 0] } },
                    allTimeBooked: { $sum: { $cond: [{ $eq: ['$status', 'Booked'] }, 1, 0] } },
                    allTimeBookedDollars: { $sum: { $cond: [{ $eq: ['$status', 'Booked'] }, { $ifNull: ['$amountFinanced', 0] }, 0] } },
                    ytdApps: { $sum: { $cond: [{ $gte: ['$applicationDate', ytdStart] }, 1, 0] } },
                    ytdApprovals: { $sum: { $cond: [{ $and: [{ $gte: ['$applicationDate', ytdStart] }, { $or: [{ $eq: ['$wasApproved', true] }, { $in: ['$status', ['Approved', 'Conditional Approval', 'Auto Approval']] }] }] }, 1, 0] } },
                    ytdBooked: { $sum: { $cond: [{ $and: [{ $gte: ['$applicationDate', ytdStart] }, { $eq: ['$status', 'Booked'] }] }, 1, 0] } },
                    ytdBookedDollars: { $sum: { $cond: [{ $and: [{ $gte: ['$applicationDate', ytdStart] }, { $eq: ['$status', 'Booked'] }] }, { $ifNull: ['$amountFinanced', 0] }, 0] } },
                    ytdCloseBooked: { $sum: { $cond: [{ $and: [{ $gte: ['$bookedDate', ytdStart] }, { $eq: ['$status', 'Booked'] }] }, 1, 0] } },
                    ytdCloseBookedDollars: { $sum: { $cond: [{ $and: [{ $gte: ['$bookedDate', ytdStart] }, { $eq: ['$status', 'Booked'] }] }, { $ifNull: ['$amountFinanced', 0] }, 0] } },
                    mtdApps: { $sum: { $cond: [{ $gte: ['$applicationDate', mtdStart] }, 1, 0] } },
                    mtdApprovals: { $sum: { $cond: [{ $and: [{ $gte: ['$applicationDate', mtdStart] }, { $or: [{ $eq: ['$wasApproved', true] }, { $in: ['$status', ['Approved', 'Conditional Approval', 'Auto Approval']] }] }] }, 1, 0] } },
                    mtdBooked: { $sum: { $cond: [{ $and: [{ $gte: ['$applicationDate', mtdStart] }, { $eq: ['$status', 'Booked'] }] }, 1, 0] } },
                    mtdBookedDollars: { $sum: { $cond: [{ $and: [{ $gte: ['$applicationDate', mtdStart] }, { $eq: ['$status', 'Booked'] }] }, { $ifNull: ['$amountFinanced', 0] }, 0] } },
                    mtdCloseBooked: { $sum: { $cond: [{ $and: [{ $gte: ['$bookedDate', mtdStart] }, { $eq: ['$status', 'Booked'] }] }, 1, 0] } },
                    mtdCloseBookedDollars: { $sum: { $cond: [{ $and: [{ $gte: ['$bookedDate', mtdStart] }, { $eq: ['$status', 'Booked'] }] }, { $ifNull: ['$amountFinanced', 0] }, 0] } },
                }
            }
        ]);

        const rawSummary = summaryAgg[0] || {};
        const summary = {
            allTime: {
                apps: rawSummary.allTimeApps || 0,
                approvals: rawSummary.allTimeApprovals || 0,
                booked: rawSummary.allTimeBooked || 0,
                bookedDollars: rawSummary.allTimeBookedDollars || 0
            },
            ytd: {
                apps: rawSummary.ytdApps || 0,
                approvals: rawSummary.ytdApprovals || 0,
                booked: rawSummary.ytdCloseBooked || rawSummary.ytdBooked || 0,
                bookedDollars: rawSummary.ytdCloseBookedDollars || rawSummary.ytdBookedDollars || 0,
                leadBooked: rawSummary.ytdBooked || 0,
                leadBookedDollars: rawSummary.ytdBookedDollars || 0,
                closeBooked: rawSummary.ytdCloseBooked || 0,
                closeBookedDollars: rawSummary.ytdCloseBookedDollars || 0,
            },
            mtd: {
                apps: rawSummary.mtdApps || 0,
                approvals: rawSummary.mtdApprovals || 0,
                booked: rawSummary.mtdCloseBooked || rawSummary.mtdBooked || 0,
                bookedDollars: rawSummary.mtdCloseBookedDollars || rawSummary.mtdBookedDollars || 0,
                leadBooked: rawSummary.mtdBooked || 0,
                leadBookedDollars: rawSummary.mtdBookedDollars || 0,
                closeBooked: rawSummary.mtdCloseBooked || 0,
                closeBookedDollars: rawSummary.mtdCloseBookedDollars || 0,
            }
        };

        // Paginated applications list
        const totalCount = await Application.countDocuments(matchQuery);
        const rawApps = await Application.find(matchQuery)
            .sort({ applicationDate: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const applications = rawApps.map(app => {
            let daysAgo = null;
            if (app.applicationDate) {
                const diffMs = now.getTime() - new Date(app.applicationDate).getTime();
                daysAgo = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
            }
            return {
                ...app,
                daysAgo
            };
        });

        res.status(200).json({
            success: true,
            location: headerLocation,
            summary,
            applications,
            pagination: {
                page,
                limit,
                totalCount,
                totalPages: Math.ceil(totalCount / limit),
                hasMore: skip + applications.length < totalCount
            }
        });
    } catch (error) {
        console.error('Error fetching dealer applications history:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /analytics/dealer-360/:dealerId
 * Returns complete 360° overview data for a single dealer location:
 * - Location info & assigned rep
 * - Current activity status
 * - Days since app, approval, booking, visit
 * - Historical totals & conversion rates
 * - Last 12 months volume sparkline
 */
router.get('/dealer-360/:dealerId', async (req, res) => {
    try {
        const { dealerId } = req.params;
        let location = null;

        if (mongoose.Types.ObjectId.isValid(dealerId)) {
            location = await DealerLocation.findById(dealerId).populate('dealerGroup', 'name slug').lean();
        }
        if (!location) {
            location = await DealerLocation.findOne({
                $or: [
                    { clientDealerId: dealerId },
                    { dealerId: dealerId },
                    { omniDealerId: dealerId }
                ]
            }).populate('dealerGroup', 'name slug').lean();
        }

        if (!location) {
            return res.status(404).json({ success: false, message: `Dealer location not found for ID: ${dealerId}` });
        }

        const clientDealerId = location.clientDealerId || location.dealerId;
        const repName = resolveRepName(location.dealerRepresentative);

        // Fetch latest snapshot for activity status
        const latestSnap = await DailyDealerSnapshot.findOne({ clientDealerId })
            .sort({ reportDate: -1 })
            .lean();

        // Fetch application recencies & totals
        const apps = await Application.find({ clientDealerId })
            .sort({ applicationDate: -1 })
            .lean();

        const latestApp = apps[0] || null;
        const latestApproval = apps.find(a => a.wasApproved || ['Approved', 'Conditional Approval', 'Auto Approval'].includes(a.status)) || null;
        const latestBooking = apps.find(a => a.status === 'Booked') || null;

        const maxReportDate = await getMaxReportDate();
        const nowMs = maxReportDate.getTime();

        const daysSinceApp = latestApp ? Math.floor((nowMs - new Date(latestApp.applicationDate).getTime()) / (1000 * 60 * 60 * 24)) : null;
        const daysSinceApproval = latestApproval ? Math.floor((nowMs - new Date(latestApproval.applicationDate).getTime()) / (1000 * 60 * 60 * 24)) : null;
        const daysSinceBooking = latestBooking ? Math.floor((nowMs - new Date(latestBooking.applicationDate).getTime()) / (1000 * 60 * 60 * 24)) : null;

        // Fetch latest visit touchpoint date
        const lastVisit = await DealerCommunication.collection.findOne(
            {
                internalRelationshipId2: new RegExp('^' + clientDealerId + '$', 'i'),
                $or: [
                    { communicationType: { $regex: /visit|meeting/i } },
                    { communicationResult1: { $regex: /met with|training|sign up/i } }
                ]
            },
            { sort: { communicationEventDatetime: -1 } }
        );
        const daysSinceVisit = lastVisit && lastVisit.communicationEventDatetime
            ? Math.floor((nowMs - new Date(lastVisit.communicationEventDatetime).getTime()) / (1000 * 60 * 60 * 24))
            : null;

        let daysVisitToNextApp = null;
        if (lastVisit && lastVisit.communicationEventDatetime) {
            const visitMs = new Date(lastVisit.communicationEventDatetime).getTime();
            const nextApp = apps
                .filter(a => new Date(a.applicationDate).getTime() >= visitMs)
                .sort((a, b) => new Date(a.applicationDate).getTime() - new Date(b.applicationDate).getTime())[0];
            if (nextApp) {
                daysVisitToNextApp = Math.floor((new Date(nextApp.applicationDate).getTime() - visitMs) / (1000 * 60 * 60 * 24));
            }
        }

        // Totals & conversion
        const totalApps = apps.length;
        const totalApproved = apps.filter(a => a.wasApproved || ['Approved', 'Conditional Approval', 'Auto Approval'].includes(a.status)).length;
        const totalBooked = apps.filter(a => a.status === 'Booked').length;
        const totalBookedDollars = apps.filter(a => a.status === 'Booked').reduce((sum, a) => sum + (a.amountFinanced || 0), 0);

        const lookToBookPct = totalApps > 0 ? (totalBooked / totalApps) * 100 : 0;
        const approvalToBookPct = totalApproved > 0 ? (totalBooked / totalApproved) * 100 : 0;

        // 12-Month Sparkline
        const monthlySparklineMap = {};
        for (let i = 11; i >= 0; i--) {
            const d = new Date(maxReportDate.getFullYear(), maxReportDate.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            monthlySparklineMap[key] = { month: key, apps: 0, bookedDollars: 0 };
        }

        for (const app of apps) {
            const d = new Date(app.applicationDate);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (monthlySparklineMap[key]) {
                monthlySparklineMap[key].apps++;
                if (app.status === 'Booked') {
                    monthlySparklineMap[key].bookedDollars += (app.amountFinanced || 0);
                }
            }
        }

        res.json({
            success: true,
            location: {
                _id: location._id,
                dealerName: location.dealerName,
                clientDealerId: location.clientDealerId,
                dealerId: location.dealerId,
                statePrefix: location.statePrefix,
                repName,
                groupName: location.dealerGroup ? location.dealerGroup.name : null,
                groupSlug: location.dealerGroup ? location.dealerGroup.slug : null,
            },
            status: latestSnap ? latestSnap.activityStatus : (daysSinceApp != null && daysSinceApp <= 30 ? 'active' : 'inactive'),
            recencies: {
                daysSinceApp,
                daysSinceApproval,
                daysSinceBooking,
                daysSinceVisit,
                daysVisitToNextApp,
            },
            stats: {
                totalApps,
                totalApproved,
                totalBooked,
                totalBookedDollars: Math.round(totalBookedDollars),
                lookToBookPct: Math.round(lookToBookPct * 10) / 10,
                approvalToBookPct: Math.round(approvalToBookPct * 10) / 10,
            },
            sparkline: Object.values(monthlySparklineMap),
        });
    } catch (error) {
        console.error('Error in dealer-360 overview:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /analytics/dealer-360/:dealerId/timeline
 * Merges communications & applications into a single chronological Cause-and-Effect Timeline.
 */
router.get('/dealer-360/:dealerId/timeline', async (req, res) => {
    try {
        const { dealerId } = req.params;
        let location = null;

        if (mongoose.Types.ObjectId.isValid(dealerId)) {
            location = await DealerLocation.findById(dealerId).lean();
        }
        if (!location) {
            location = await DealerLocation.findOne({
                $or: [
                    { clientDealerId: dealerId },
                    { dealerId: dealerId },
                    { omniDealerId: dealerId }
                ]
            }).lean();
        }

        if (!location) {
            return res.status(404).json({ success: false, message: `Dealer location not found` });
        }

        const clientDealerId = (location.clientDealerId || location.dealerId).trim().toUpperCase();

        // 1. Fetch all communications for this dealer
        const comms = await DealerCommunication.collection.find(
            { internalRelationshipId2: new RegExp('^' + clientDealerId + '$', 'i') }
        ).sort({ communicationEventDatetime: -1 }).toArray();

        // 2. Fetch all applications for this dealer
        const apps = await Application.find({ clientDealerId })
            .sort({ applicationDate: -1 })
            .lean();

        // Index visits with timestamps
        const visitEvents = comms
            .map(c => {
                const type = (c.communicationType || '').toLowerCase();
                const result = (c.communicationResult1 || '').toLowerCase();
                const isVisit = type === 'meeting' || result.includes('met with') || result.includes('training') || result.includes('sign up');
                const isCall = type === 'phone call' || result.includes('spoke with') || result.includes('follow up');
                const rawUser = c.communicationUserEmail || c.communicationUserFullName || c.communicationUserName || '';
                const repDisplayName = resolveRepName(rawUser) || 'Unassigned';

                return {
                    id: c._id.toString(),
                    eventType: 'touchpoint',
                    date: c.communicationEventDatetime,
                    timestamp: c.communicationEventDatetime ? new Date(c.communicationEventDatetime).getTime() : 0,
                    repName: repDisplayName,
                    touchpointType: isVisit ? 'visit' : isCall ? 'call' : 'other',
                    typeLabel: isVisit ? 'In-Person Visit' : isCall ? 'Phone Call' : (c.communicationType ? (c.communicationType.charAt(0).toUpperCase() + c.communicationType.slice(1)) : 'Touchpoint'),
                    notes: c.communicationResult1 || c.communicationFeedback1 || c.communicationNotes || null,
                };
            })
            .filter(e => e.timestamp > 0);

        // Map apps with attribution check
        const appEvents = apps.map(a => {
            const appMs = new Date(a.applicationDate).getTime();
            // Find most recent visit before this application (within 60 days)
            const priorVisit = visitEvents
                .filter(v => v.touchpointType === 'visit' && v.timestamp <= appMs && (appMs - v.timestamp) <= 60 * 24 * 60 * 60 * 1000)
                .sort((x, y) => y.timestamp - x.timestamp)[0];

            let attribution = null;
            if (priorVisit) {
                const daysAfter = Math.floor((appMs - priorVisit.timestamp) / (1000 * 60 * 60 * 24));
                attribution = {
                    repName: priorVisit.repName,
                    daysAfterVisit: daysAfter,
                    visitDate: priorVisit.date,
                };
            }

            return {
                id: a._id.toString(),
                eventType: 'application',
                date: a.applicationDate,
                timestamp: appMs,
                applicationId: a.applicationId,
                status: a.status,
                amountFinanced: a.amountFinanced || 0,
                fico: a.fico || a.creditScore || null,
                lender: a.lender || 'Source One Financial',
                attribution,
            };
        });

        // Combine and sort descending
        const combined = [...visitEvents, ...appEvents].sort((a, b) => b.timestamp - a.timestamp);

        res.json({
            success: true,
            timeline: combined,
            totalVisits: visitEvents.filter(v => v.touchpointType === 'visit').length,
            totalApps: appEvents.length,
        });
    } catch (error) {
        console.error('Error fetching dealer 360 timeline:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
