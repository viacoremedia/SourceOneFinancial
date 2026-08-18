/**
 * Dealer Stats Service
 * 
 * Computes period-based application pipeline & funded production statistics per dealer
 * directly from the Application collection using high-performance MongoDB dual-pipeline aggregations.
 * 
 * Dual-Pipeline Architecture:
 * 1. Lead Date Pipeline (applicationDate): Apps, Approvals, In-House, Lead Booked Deals, Lead Booked $, Look-to-Book %, Approval-to-Book %
 * 2. Close Date Pipeline (bookedDate): Total Funded Deals, Total Funded Volume ($)
 * 
 * @module services/dealerStatsService
 */

const Application = require('../models/Application');

/**
 * Regex pattern for identifying In-House (Source One) deals.
 */
const SOURCE_ONE_LENDER_REGEX = /^Source One/i;

const { getRepAliasMap, getRepHandles } = require('../config/repConfig');

// Build alias map once at module load (active reps only for dashboard filtering)
const REP_ALIAS_MAP = getRepAliasMap();


/**
 * Get period statistics for a list of dealer IDs or general filter.
 * 
 * @param {Object} params
 * @param {string[]} [params.dealerIds] - Optional array of clientDealerIds
 * @param {Date|string} [params.startDate] - Start date (inclusive)
 * @param {Date|string} [params.endDate] - End date (inclusive)
 * @param {string} [params.rep] - Optional sales rep filter
 * @param {string} [params.state] - Optional dealer state filter
 * @param {string} [params.groupSlug] - Optional dealer group slug filter
 * @returns {Promise<Map<string, Object>>} Map of clientDealerId -> stats object
 */
async function getDealerStatsMap({ dealerIds = null, startDate = null, endDate = null, rep = null, state = null, groupSlug = null } = {}) {
    let targetDealerIds = dealerIds ? [...dealerIds] : null;

    if (groupSlug && (!targetDealerIds || targetDealerIds.length === 0)) {
        const DealerGroup = require('../models/DealerGroup');
        const DealerLocation = require('../models/DealerLocation');
        const grp = await DealerGroup.findOne({ slug: groupSlug }).lean();
        if (grp) {
            const locs = await DealerLocation.find({ dealerGroup: grp._id }).lean();
            targetDealerIds = locs.map(l => (l.clientDealerId || l.dealerId || '').trim().toUpperCase()).filter(Boolean);
        } else {
            targetDealerIds = [];
        }
    }

    // Shared filters (rep, state, dealerIds)
    const baseMatch = {};

    if (targetDealerIds && targetDealerIds.length > 0) {
        baseMatch.clientDealerId = { $in: targetDealerIds.map(id => id.trim().toUpperCase()) };
    } else if (targetDealerIds && targetDealerIds.length === 0) {
        baseMatch.clientDealerId = { $in: ['__NO_MATCH__'] };
    }

    if (!targetDealerIds) {
        if (rep) {
            const DealerLocation = require('../models/DealerLocation');
            const handles = getRepHandles(rep);
            const handleRegexes = handles.map(h => new RegExp('^' + h + '$', 'i'));

            const repLocs = await DealerLocation.find({
                dealerRepresentative: { $in: handleRegexes }
            }).lean();
            const repDealerIds = repLocs.map(l => (l.clientDealerId || l.dealerId || '').trim().toUpperCase()).filter(Boolean);

            if (repDealerIds.length > 0) {
                baseMatch.$or = [
                    { dealerRepresentative: { $in: handleRegexes } },
                    { clientDealerId: { $in: repDealerIds } }
                ];
            } else {
                baseMatch.dealerRepresentative = { $in: handleRegexes };
            }
        }
        if (state) {
            baseMatch.dealerState = state.toUpperCase();
        }
    }

    // ── Pipeline 1: Lead Date Model (applicationDate match) ──
    const leadMatch = { ...baseMatch };
    if (startDate || endDate) {
        leadMatch.applicationDate = {};
        if (startDate) leadMatch.applicationDate.$gte = new Date(startDate);
        if (endDate) {
            const endD = new Date(endDate);
            endD.setUTCHours(23, 59, 59, 999);
            leadMatch.applicationDate.$lte = endD;
        }
    }

    const leadPipeline = [
        { $match: leadMatch },
        {
            $group: {
                _id: { $toUpper: '$clientDealerId' },
                apps: { $sum: 1 },
                approvals: {
                    $sum: {
                        $cond: [
                            {
                                $or: [
                                    { $eq: ['$wasApproved', true] },
                                    { $in: ['$status', ['Approved', 'Conditional Approval', 'Auto Approval']] }
                                ]
                            },
                            1,
                            0
                        ]
                    }
                },
                inHouse: {
                    $sum: {
                        $cond: [
                            { $regexMatch: { input: { $ifNull: ['$lender', ''] }, regex: SOURCE_ONE_LENDER_REGEX } },
                            1,
                            0
                        ]
                    }
                },
                leadBooked: {
                    $sum: {
                        $cond: [
                            { $eq: ['$status', 'Booked'] },
                            1,
                            0
                        ]
                    }
                },
                leadBookedDollars: {
                    $sum: {
                        $cond: [
                            { $eq: ['$status', 'Booked'] },
                            { $ifNull: ['$amountFinanced', 0] },
                            0
                        ]
                    }
                },
                ficoSum: {
                    $sum: {
                        $cond: [
                            { $and: [{ $ne: ['$primaryFicoAuto8', null] }, { $gt: ['$primaryFicoAuto8', 0] }] },
                            '$primaryFicoAuto8',
                            0
                        ]
                    }
                },
                ficoCount: {
                    $sum: {
                        $cond: [
                            { $and: [{ $ne: ['$primaryFicoAuto8', null] }, { $gt: ['$primaryFicoAuto8', 0] }] },
                            1,
                            0
                        ]
                    }
                }
            }
        }
    ];

    // ── Pipeline 2: Close Date Model (bookedDate match) ──
    const closeMatch = { ...baseMatch, status: 'Booked' };
    if (startDate || endDate) {
        closeMatch.bookedDate = {};
        if (startDate) closeMatch.bookedDate.$gte = new Date(startDate);
        if (endDate) {
            const endD = new Date(endDate);
            endD.setUTCHours(23, 59, 59, 999);
            closeMatch.bookedDate.$lte = endD;
        }
    }

    const closePipeline = [
        { $match: closeMatch },
        {
            $group: {
                _id: { $toUpper: '$clientDealerId' },
                closeBooked: { $sum: 1 },
                closeBookedDollars: { $sum: { $ifNull: ['$amountFinanced', 0] } },
                inMonthBooked: {
                    $sum: {
                        $cond: [
                            {
                                $and: [
                                    { $ne: ['$applicationDate', null] },
                                    { $ne: ['$bookedDate', null] },
                                    { $eq: [{ $year: '$bookedDate' }, { $year: '$applicationDate' }] },
                                    { $eq: [{ $month: '$bookedDate' }, { $month: '$applicationDate' }] }
                                ]
                            },
                            1, 0
                        ]
                    }
                },
                inMonthBookedDollars: {
                    $sum: {
                        $cond: [
                            {
                                $and: [
                                    { $ne: ['$applicationDate', null] },
                                    { $ne: ['$bookedDate', null] },
                                    { $eq: [{ $year: '$bookedDate' }, { $year: '$applicationDate' }] },
                                    { $eq: [{ $month: '$bookedDate' }, { $month: '$applicationDate' }] }
                                ]
                            },
                            { $ifNull: ['$amountFinanced', 0] }, 0
                        ]
                    }
                },
                outOfMonthBooked: {
                    $sum: {
                        $cond: [
                            {
                                $or: [
                                    { $eq: ['$applicationDate', null] },
                                    { $ne: [{ $year: '$bookedDate' }, { $year: '$applicationDate' }] },
                                    { $ne: [{ $month: '$bookedDate' }, { $month: '$applicationDate' }] }
                                ]
                            },
                            1, 0
                        ]
                    }
                },
                outOfMonthBookedDollars: {
                    $sum: {
                        $cond: [
                            {
                                $or: [
                                    { $eq: ['$applicationDate', null] },
                                    { $ne: [{ $year: '$bookedDate' }, { $year: '$applicationDate' }] },
                                    { $ne: [{ $month: '$bookedDate' }, { $month: '$applicationDate' }] }
                                ]
                            },
                            { $ifNull: ['$amountFinanced', 0] }, 0
                        ]
                    }
                }
            }
        }
    ];

    // Execute both pipelines concurrently
    const [leadResults, closeResults] = await Promise.all([
        Application.aggregate(leadPipeline),
        Application.aggregate(closePipeline)
    ]);

    const statsMap = new Map();

    // Helper getter/initializer
    const getOrInitStats = (dealerId) => {
        if (!statsMap.has(dealerId)) {
            statsMap.set(dealerId, {
                apps: 0,
                approvals: 0,
                inHouse: 0,
                leadBooked: 0,
                leadBookedDollars: 0,
                closeBooked: 0,
                closeBookedDollars: 0,
                inMonthBooked: 0,
                inMonthBookedDollars: 0,
                outOfMonthBooked: 0,
                outOfMonthBookedDollars: 0,
                booked: 0,
                bookedDollars: 0,
                lookToBook: 0,
                approvalToBook: 0,
                avgFico: null,
                ficoSum: 0,
                ficoCount: 0
            });
        }
        return statsMap.get(dealerId);
    };

    // Populate Lead Date results
    for (const res of leadResults) {
        const dealerId = res._id;
        if (!dealerId) continue;
        const entry = getOrInitStats(dealerId);
        entry.apps = res.apps || 0;
        entry.approvals = res.approvals || 0;
        entry.inHouse = res.inHouse || 0;
        entry.leadBooked = res.leadBooked || 0;
        entry.leadBookedDollars = res.leadBookedDollars || 0;
        entry.ficoSum = res.ficoSum || 0;
        entry.ficoCount = res.ficoCount || 0;
        if (entry.ficoCount > 0) {
            entry.avgFico = Math.round(entry.ficoSum / entry.ficoCount);
        }
    }

    // Populate Close Date results
    for (const res of closeResults) {
        const dealerId = res._id;
        if (!dealerId) continue;
        const entry = getOrInitStats(dealerId);
        entry.closeBooked = res.closeBooked || 0;
        entry.closeBookedDollars = res.closeBookedDollars || 0;
        entry.inMonthBooked = res.inMonthBooked || 0;
        entry.inMonthBookedDollars = res.inMonthBookedDollars || 0;
        entry.outOfMonthBooked = res.outOfMonthBooked || 0;
        entry.outOfMonthBookedDollars = res.outOfMonthBookedDollars || 0;
        // Aliases for total funded production
        entry.booked = entry.closeBooked;
        entry.bookedDollars = entry.closeBookedDollars;
    }

    // Calculate ratios for all dealers in statsMap
    for (const entry of statsMap.values()) {
        const apps = entry.apps || 0;
        const approvals = entry.approvals || 0;
        const leadBooked = entry.leadBooked || 0;

        entry.lookToBook = apps > 0 ? Number((leadBooked / apps).toFixed(4)) : 0;
        entry.approvalToBook = (approvals + leadBooked) > 0 
            ? Number((leadBooked / (approvals + leadBooked)).toFixed(4)) 
            : (approvals > 0 ? Number((leadBooked / approvals).toFixed(4)) : 0);

        // Ensure aliases are synchronized
        entry.booked = entry.closeBooked;
        entry.bookedDollars = entry.closeBookedDollars;
    }

    return statsMap;
}

/**
 * Get aggregate network stats for a date range.
 */
async function getNetworkAggregateStats({ startDate = null, endDate = null, rep = null, state = null, groupSlug = null, dealerIds = null } = {}) {
    const statsMap = await getDealerStatsMap({ startDate, endDate, rep, state, groupSlug, dealerIds });
    
    let totalApps = 0;
    let totalApprovals = 0;
    let totalInHouse = 0;
    let totalLeadBooked = 0;
    let totalLeadBookedDollars = 0;
    let totalCloseBooked = 0;
    let totalCloseBookedDollars = 0;
    let totalInMonthBooked = 0;
    let totalInMonthBookedDollars = 0;
    let totalOutOfMonthBooked = 0;
    let totalOutOfMonthBookedDollars = 0;
    let netFicoSum = 0;
    let netFicoCount = 0;

    for (const stats of statsMap.values()) {
        totalApps += stats.apps;
        totalApprovals += stats.approvals;
        totalInHouse += stats.inHouse;
        totalLeadBooked += stats.leadBooked;
        totalLeadBookedDollars += stats.leadBookedDollars;
        totalCloseBooked += stats.closeBooked;
        totalCloseBookedDollars += stats.closeBookedDollars;
        totalInMonthBooked += stats.inMonthBooked || 0;
        totalInMonthBookedDollars += stats.inMonthBookedDollars || 0;
        totalOutOfMonthBooked += stats.outOfMonthBooked || 0;
        totalOutOfMonthBookedDollars += stats.outOfMonthBookedDollars || 0;
        netFicoSum += stats.ficoSum || 0;
        netFicoCount += stats.ficoCount || 0;
    }

    const lookToBook = totalApps > 0 ? Number((totalLeadBooked / totalApps).toFixed(4)) : 0;
    const approvalToBook = totalApprovals > 0 ? Number((totalLeadBooked / totalApprovals).toFixed(4)) : 0;
    const avgFico = netFicoCount > 0 ? Math.round(netFicoSum / netFicoCount) : null;

    return {
        apps: totalApps,
        approvals: totalApprovals,
        inHouse: totalInHouse,
        leadBooked: totalLeadBooked,
        leadBookedDollars: totalLeadBookedDollars,
        closeBooked: totalCloseBooked,
        closeBookedDollars: totalCloseBookedDollars,
        inMonthBooked: totalInMonthBooked,
        inMonthBookedDollars: totalInMonthBookedDollars,
        outOfMonthBooked: totalOutOfMonthBooked,
        outOfMonthBookedDollars: totalOutOfMonthBookedDollars,
        avgFico,
        // Backward compatibility & primary production display
        booked: totalCloseBooked,
        bookedDollars: totalCloseBookedDollars,
        lookToBook,
        approvalToBook,
        activeDealersWithApps: statsMap.size
    };
}

module.exports = {
    getDealerStatsMap,
    getNetworkAggregateStats
};
