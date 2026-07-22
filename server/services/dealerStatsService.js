/**
 * Dealer Stats Service
 * 
 * Computes period-based application pipeline statistics per dealer
 * directly from the Application collection using high-performance MongoDB aggregations.
 * 
 * Powers the 7 dashboard metrics:
 * - apps (Applications submitted in period)
 * - approvals (Applications approved in period)
 * - inHouse (Deals where lender is Source One)
 * - booked (Deals booked in period)
 * - bookedDollars (Total amount financed for booked deals)
 * - lookToBook (Booked / Apps ratio)
 * - approvalToBook (Booked / Approvals ratio)
 * 
 * @module services/dealerStatsService
 */

const Application = require('../models/Application');

/**
 * Regex pattern for identifying In-House (Source One) deals.
 */
const SOURCE_ONE_LENDER_REGEX = /^Source One/i;

const REP_ALIAS_MAP = {
    'bruce': ['edominguez', 'bruce'],
    'george': ['gott', 'george'],
    'janet': ['jharrington1', 'janet'],
    'jeff': ['jweller', 'jeff'],
    'john': ['jsmith', 'john'],
    'pam/ward': ['wstoutimore', 'pam/ward', 'ward'],
    'steve': ['skimble', 'steve'],
    'mandi': ['mschultz1', 'mandi'],
    'tony': ['gcoulombe', 'tony']
};

function getRepHandles(repInput) {
    if (!repInput) return [];
    const key = repInput.trim().toLowerCase();
    if (REP_ALIAS_MAP[key]) return REP_ALIAS_MAP[key];
    return [repInput.trim()];
}

/**
 * Get period statistics for a list of dealer IDs or general filter.
 * 
 * @param {Object} params
 * @param {string[]} [params.dealerIds] - Optional array of clientDealerIds
 * @param {Date|string} [params.startDate] - Start date (inclusive)
 * @param {Date|string} [params.endDate] - End date (inclusive)
 * @param {string} [params.rep] - Optional sales rep filter
 * @param {string} [params.state] - Optional dealer state filter
 * @returns {Promise<Map<string, Object>>} Map of clientDealerId -> stats object
 */
async function getDealerStatsMap({ dealerIds = null, startDate = null, endDate = null, rep = null, state = null, groupSlug = null } = {}) {
    const match = {};

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

    if (targetDealerIds && targetDealerIds.length > 0) {
        match.clientDealerId = { $in: targetDealerIds.map(id => id.trim().toUpperCase()) };
    } else if (targetDealerIds && targetDealerIds.length === 0) {
        match.clientDealerId = { $in: ['__NO_MATCH__'] };
    }

    if (startDate || endDate) {
        match.applicationDate = {};
        if (startDate) match.applicationDate.$gte = new Date(startDate);
        if (endDate) {
            const endD = new Date(endDate);
            endD.setUTCHours(23, 59, 59, 999);
            match.applicationDate.$lte = endD;
        }
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
                match.$or = [
                    { dealerRepresentative: { $in: handleRegexes } },
                    { clientDealerId: { $in: repDealerIds } }
                ];
            } else {
                match.dealerRepresentative = { $in: handleRegexes };
            }
        }
        if (state) {
            match.dealerState = state.toUpperCase();
        }
    }

    const pipeline = [
        { $match: match },
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
                booked: {
                    $sum: {
                        $cond: [
                            { $eq: ['$status', 'Booked'] },
                            1,
                            0
                        ]
                    }
                },
                bookedDollars: {
                    $sum: {
                        $cond: [
                            { $eq: ['$status', 'Booked'] },
                            { $ifNull: ['$amountFinanced', 0] },
                            0
                        ]
                    }
                }
            }
        }
    ];

    const results = await Application.aggregate(pipeline);

    const statsMap = new Map();

    for (const res of results) {
        const dealerId = res._id;
        if (!dealerId) continue;

        const apps = res.apps || 0;
        const approvals = res.approvals || 0;
        const booked = res.booked || 0;
        const bookedDollars = res.bookedDollars || 0;

        const lookToBook = apps > 0 ? Number((booked / apps).toFixed(4)) : 0;
        const approvalToBook = (approvals + booked) > 0 ? Number((booked / (approvals + booked)).toFixed(4)) : (approvals > 0 ? Number((booked / approvals).toFixed(4)) : 0);

        statsMap.set(dealerId, {
            apps,
            approvals,
            inHouse: res.inHouse || 0,
            booked,
            bookedDollars,
            lookToBook,
            approvalToBook
        });
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
    let totalBooked = 0;
    let totalBookedDollars = 0;

    for (const stats of statsMap.values()) {
        totalApps += stats.apps;
        totalApprovals += stats.approvals;
        totalInHouse += stats.inHouse;
        totalBooked += stats.booked;
        totalBookedDollars += stats.bookedDollars;
    }

    const lookToBook = totalApps > 0 ? Number((totalBooked / totalApps).toFixed(4)) : 0;
    const approvalToBook = totalApprovals > 0 ? Number((totalBooked / totalApprovals).toFixed(4)) : 0;

    return {
        apps: totalApps,
        approvals: totalApprovals,
        inHouse: totalInHouse,
        booked: totalBooked,
        bookedDollars: totalBookedDollars,
        lookToBook,
        approvalToBook,
        activeDealersWithApps: statsMap.size
    };
}

module.exports = {
    getDealerStatsMap,
    getNetworkAggregateStats
};
