/**
 * Underwriter & Lender Performance Service
 * 
 * Aggregates underwriter operational and conversion metrics:
 * - Speed to decision (avg timeToDecision in minutes/hours)
 * - Total applications processed & decision breakdown (Approved, Conditional, Declined)
 * - Approval-to-Book Win Rate
 * - Decline Rate
 * - Source One In-House vs Outside Lender distribution
 * 
 * @module services/underwriterService
 */

const Application = require('../models/Application');
const { getLatestDataDate } = require('../utils/dateUtils');
const { SOURCE_ONE_LENDER_REGEX } = require('./dealerStatsService');

/**
 * Get underwriter performance metrics for a specified date range.
 * 
 * @param {Object} options
 * @param {string|Date} [options.startDate]
 * @param {string|Date} [options.endDate]
 * @returns {Promise<Array<Object>>} List of underwriter performance summary objects
 */
async function getUnderwriterScorecard({ startDate = null, endDate = null } = {}) {
    const matchStage = {
        underwriter: { $ne: null, $nin: ['', 'N/A', 'Unknown', 'None'] }
    };

    if (startDate || endDate) {
        matchStage.applicationDate = {};
        if (startDate) matchStage.applicationDate.$gte = new Date(startDate);
        if (endDate) {
            const endD = new Date(endDate);
            endD.setUTCHours(23, 59, 59, 999);
            matchStage.applicationDate.$lte = endD;
        }
    } else {
        // Default to July MTD if no range provided
        const now = await getLatestDataDate();
        const mtdStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const mtdEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
        matchStage.applicationDate = { $gte: mtdStart, $lte: mtdEnd };
    }

    const pipeline = [
        { $match: matchStage },
        {
            $group: {
                _id: '$underwriter',
                totalApps: { $sum: 1 },
                approvedCount: {
                    $sum: {
                        $cond: [
                            { $regexMatch: { input: { $ifNull: ['$status', ''] }, regex: /approve|conditional|auto\s*approval|booked/i } },
                            1, 0
                        ]
                    }
                },
                conditionalCount: {
                    $sum: {
                        $cond: [
                            { $regexMatch: { input: { $ifNull: ['$status', ''] }, regex: /conditional/i } },
                            1, 0
                        ]
                    }
                },
                declinedCount: {
                    $sum: {
                        $cond: [
                            { $regexMatch: { input: { $ifNull: ['$status', ''] }, regex: /decline|turn\s*down|reject|deni|cancelled/i } },
                            1, 0
                        ]
                    }
                },
                bookedCount: {
                    $sum: {
                        $cond: [
                            { $regexMatch: { input: { $ifNull: ['$status', ''] }, regex: /booked|funded/i } },
                            1, 0
                        ]
                    }
                },
                bookedVolume: {
                    $sum: {
                        $cond: [
                            { $regexMatch: { input: { $ifNull: ['$status', ''] }, regex: /booked|funded/i } },
                            { $ifNull: ['$amountFinanced', 0] },
                            0
                        ]
                    }
                },
                uniqueLenders: {
                    $addToSet: {
                        $cond: [
                            { $and: [{ $ne: ['$lender', null] }, { $ne: ['$lender', ''] }] },
                            '$lender',
                            '$$REMOVE'
                        ]
                    }
                },
                allLenders: {
                    $push: {
                        $cond: [
                            { $and: [{ $ne: ['$lender', null] }, { $ne: ['$lender', ''] }] },
                            '$lender',
                            'Source One / In-House'
                        ]
                    }
                },
                sourceOneCount: {
                    $sum: {
                        $cond: [
                            {
                                $or: [
                                    { $eq: ['$lender', null] },
                                    { $eq: ['$lender', ''] },
                                    { $regexMatch: { input: { $ifNull: ['$lender', ''] }, regex: /source\s*one|s1|in-house|viacore/i } }
                                ]
                            },
                            1, 0
                        ]
                    }
                },
                avgTurnTimeMinutes: {
                    $avg: {
                        $cond: [
                            { $and: [{ $ne: ['$timeToDecision', null] }, { $gt: ['$timeToDecision', 0] }] },
                            '$timeToDecision',
                            null
                        ]
                    }
                },
                avgFico: {
                    $avg: {
                        $cond: [
                            { $and: [{ $ne: ['$primaryFicoAuto8', null] }, { $gt: ['$primaryFicoAuto8', 0] }] },
                            '$primaryFicoAuto8',
                            null
                        ]
                    }
                }
            }
        },
        { $sort: { totalApps: -1 } }
    ];

    // ── Parallel Close Date Pipeline (Funded Deals by bookedDate) ──
    const closeMatchStage = {
        underwriter: { $ne: null, $nin: ['', 'N/A', 'Unknown', 'None'] },
        status: { $regex: /booked|funded/i }
    };

    if (startDate || endDate) {
        closeMatchStage.bookedDate = {};
        if (startDate) closeMatchStage.bookedDate.$gte = new Date(startDate);
        if (endDate) {
            const endD = new Date(endDate);
            endD.setUTCHours(23, 59, 59, 999);
            closeMatchStage.bookedDate.$lte = endD;
        }
    } else {
        const now = await getLatestDataDate();
        const mtdStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const mtdEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
        closeMatchStage.bookedDate = { $gte: mtdStart, $lte: mtdEnd };
    }

    const closePipeline = [
        { $match: closeMatchStage },
        {
            $group: {
                _id: '$underwriter',
                closeBookedCount: { $sum: 1 },
                closeBookedVolume: { $sum: { $ifNull: ['$amountFinanced', 0] } }
            }
        }
    ];

    const [results, closeResults] = await Promise.all([
        Application.aggregate(pipeline),
        Application.aggregate(closePipeline)
    ]);

    const closeMap = new Map();
    for (const c of closeResults) {
        closeMap.set(c._id, c);
    }

    return results.map(row => {
        const totalApps = row.totalApps || 0;
        const approvedCount = row.approvedCount || 0;
        const leadBookedCount = row.bookedCount || 0;
        const leadBookedVolume = Math.round(row.bookedVolume || 0);
        const declinedCount = row.declinedCount || 0;
        const conditionalCount = row.conditionalCount || 0;
        const sourceOneCount = row.sourceOneCount || 0;
        const uniqueLendersList = Array.isArray(row.uniqueLenders) ? row.uniqueLenders : [];
        const uniqueLenderCount = uniqueLendersList.length;

        const closeData = closeMap.get(row._id) || { closeBookedCount: 0, closeBookedVolume: 0 };
        const closeBookedCount = closeData.closeBookedCount || 0;
        const closeBookedVolume = Math.round(closeData.closeBookedVolume || 0);

        // Build per-lender percentage breakdown
        const lenderCounts = {};
        for (const l of row.allLenders || []) {
            const name = (l && String(l).trim()) ? String(l).trim() : 'Source One / In-House';
            lenderCounts[name] = (lenderCounts[name] || 0) + 1;
        }

        const lenderBreakdown = Object.entries(lenderCounts)
            .map(([lender, count]) => ({
                lender,
                count,
                pct: totalApps > 0 ? Number((count / totalApps).toFixed(4)) : 0
            }))
            .sort((a, b) => b.count - a.count);

        const approvalRate = totalApps > 0 ? Number((approvedCount / totalApps).toFixed(4)) : 0;
        const winRate = approvedCount > 0 ? Number((leadBookedCount / approvedCount).toFixed(4)) : 0;
        const declineRate = totalApps > 0 ? Number((declinedCount / totalApps).toFixed(4)) : 0;
        const conditionalPct = approvedCount > 0 ? Number((conditionalCount / approvedCount).toFixed(4)) : 0;
        const sourceOnePct = totalApps > 0 ? Number((sourceOneCount / totalApps).toFixed(4)) : 0;
        const avgTurnTimeHours = row.avgTurnTimeMinutes != null ? Number((row.avgTurnTimeMinutes / 60).toFixed(1)) : null;

        return {
            underwriter: row._id,
            totalApps,
            approvedCount,
            conditionalCount,
            declinedCount,
            leadBookedCount,
            leadBookedVolume,
            closeBookedCount,
            closeBookedVolume,
            bookedCount: closeBookedCount,
            bookedVolume: closeBookedVolume,
            approvalRate,
            winRate, // Approval-to-Book based on Lead Date Model
            declineRate,
            conditionalPct,
            sourceOnePct,
            uniqueLenderCount,
            uniqueLenders: uniqueLendersList,
            lenderBreakdown,
            avgTurnTimeMinutes: row.avgTurnTimeMinutes != null ? Math.round(row.avgTurnTimeMinutes) : null,
            avgTurnTimeHours,
            avgFico: row.avgFico != null ? Math.round(row.avgFico) : null
        };
    });
}

module.exports = {
    getUnderwriterScorecard
};
