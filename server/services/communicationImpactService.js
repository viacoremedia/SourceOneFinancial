/**
 * Communication Impact Service
 *
 * Analyzes Andrew's DealerCommunication table from OMNI to evaluate sales rep
 * touchpoint impact, in-person visit volume lift, and effort-vs-yield account allocation.
 *
 * Core Functions:
 *   - computeVisitImpact: Pre vs post touchpoint window volume lift (14d/30d/60d)
 *   - computeEffortVsYieldFlags: High-touch/low-yield and low-touch/high-yield flags
 *
 * @module services/communicationImpactService
 */

const DealerCommunication = require('../models/DealerCommunication');
const Application = require('../models/Application');
const DealerLocation = require('../models/DealerLocation');

const DailyDealerSnapshot = require('../models/DailyDealerSnapshot');

const { resolveRepName } = require('../config/repConfig');

// Alias for backward compatibility within this file
const resolveRepDisplayName = resolveRepName;


/**
 * Get latest report date from the most recent snapshot.
 * Falls back to today if no snapshots exist.
 */
async function getMaxReportDate() {
    const snap = await DailyDealerSnapshot.findOne({}).sort({ reportDate: -1 }).select('reportDate').lean();
    if (snap && snap.reportDate) {
        return new Date(snap.reportDate);
    }
    return new Date(); // fallback to today if no snapshots
}

/**
 * Compute pre vs post volume lift associated with communication touchpoints.
 *
 * @param {number} [windowDays=30] - Attribution window in days (14, 30, 60)
 * @param {string} [repFilter=null] - Optional rep name filter
 * @returns {Promise<Object>} Aggregate & per-rep visit impact data
 */
async function computeVisitImpact(windowDays = 30, repFilter = null) {
    const validWindow = [14, 30, 60].includes(Number(windowDays)) ? Number(windowDays) : 30;
    const windowMs = validWindow * 24 * 60 * 60 * 1000;

    const maxReportDate = await getMaxReportDate();

    // Active window ending at maxReportDate (e.g. Jul 3 - Jul 17, 2026)
    const currentWindowStart = new Date(maxReportDate.getTime() - windowMs);
    const currentWindowEnd = maxReportDate;

    // Prior baseline window (e.g. Jun 19 - Jul 3, 2026)
    const baselineWindowStart = new Date(maxReportDate.getTime() - 2 * windowMs);
    const baselineWindowEnd = currentWindowStart;

    const formatDateUtc = (d) => {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
    };
    const formatDateFull = (d) => {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
    };

    const currentWindowLabel = `${formatDateUtc(currentWindowStart)} – ${formatDateFull(currentWindowEnd)}`;
    const baselineWindowLabel = `${formatDateUtc(baselineWindowStart)} – ${formatDateFull(baselineWindowEnd)}`;
    const dateRangeLabel = `${currentWindowLabel} vs Baseline: ${baselineWindowLabel}`;

    const ytdStart = new Date(Date.UTC(2026, 0, 1));

    // Load YTD 2026 communications up to maxReportDate
    const commMatch = {
        communicationEventDatetime: { $gte: ytdStart, $lte: maxReportDate }
    };

    if (repFilter) {
        const key = repFilter.trim().toLowerCase();
        commMatch.$or = [
            { communicationUserFullName: new RegExp(key, 'i') },
            { communicationUserName: new RegExp(key, 'i') },
            { communicationUserEmail: new RegExp(key, 'i') }
        ];
    }

    const comms = await DealerCommunication.find(commMatch).lean();

    if (comms.length === 0) {
        return {
            windowDays: validWindow,
            dateRangeLabel,
            maxReportDate: maxReportDate.toISOString(),
            overall: { totalVisits: 0, totalCalls: 0, totalTouchpoints: 0, preVisitVolume: 0, postVisitVolume: 0, associatedNetLiftDollars: 0, associatedNetLiftApps: 0, avgNetworkLiftPerVisit: 0 },
            reps: [],
            insufficientData: true,
        };
    }

    // Index applications by clientDealerId from baselineWindowStart up to maxReportDate
    const apps = await Application.find(
        { applicationDate: { $gte: baselineWindowStart, $lte: maxReportDate } },
        { clientDealerId: 1, applicationDate: 1, bookedDate: 1, amountFinanced: 1, status: 1 }
    ).lean();

    const appsByDealer = new Map();
    for (const app of apps) {
        if (!app.clientDealerId) continue;
        const key = app.clientDealerId.trim().toUpperCase();
        if (!appsByDealer.has(key)) appsByDealer.set(key, []);
        appsByDealer.get(key).push({
            appDate: new Date(app.applicationDate).getTime(),
            bookedDate: app.bookedDate ? new Date(app.bookedDate).getTime() : new Date(app.applicationDate).getTime(),
            isBooked: app.status === 'Booked',
            amount: app.status === 'Booked' ? (app.amountFinanced || 0) : 0,
        });
    }

    // Evaluate each touchpoint event
    const repStats = {}; // rep -> { visitCount, callCount, preVol, postVol, preApps, postApps }

    for (const comm of comms) {
        const dealerKey = (comm.internalRelationshipId2 || '').trim().toUpperCase();
        if (!dealerKey) continue;

        const rawUser = comm.communicationUserEmail || comm.communicationUserFullName || comm.communicationUserName || '';
        const repName = resolveRepDisplayName(rawUser);
        if (!repName) continue;

        if (!repStats[repName]) {
            repStats[repName] = {
                rep: repName,
                visitCount: 0,
                callCount: 0,
                totalTouchpoints: 0,
                visitPreVol: 0,
                visitPostVol: 0,
                visitPreApps: 0,
                visitPostApps: 0,
                dealers: {},
            };
        }

        if (!repStats[repName].dealers[dealerKey]) {
            const recipientName = comm.recipientOrganizationName || 'Unknown Dealer';
            repStats[repName].dealers[dealerKey] = {
                clientDealerId: dealerKey,
                dealerName: recipientName,
                touchpoints: 0,
                visitCount: 0,
                callCount: 0,
                visitPreVol: 0,
                visitPostVol: 0,
                visitPreApps: 0,
                visitPostApps: 0,
            };
        }

        const type = (comm.communicationType || '').toLowerCase();
        const result = (comm.communicationResult1 || '').toLowerCase();

        const isVisit = type.includes('visit') || type.includes('in-person') || type.includes('meeting') ||
                        result.includes('met with') || result.includes('training') || result.includes('sign up');

        const isCall = type.includes('call') || type.includes('phone') ||
                       result.includes('spoke with') || result.includes('follow up') || result.includes('returned') || result.includes('not able to speak');

        // Only count touchpoints/visits/calls that fall within the active window
        // (comms outside the window are still loaded for pre-window baseline attribution)
        const commDate = new Date(comm.communicationEventDatetime);
        const inActiveWindow = commDate >= currentWindowStart && commDate <= currentWindowEnd;

        if (inActiveWindow) {
            if (isVisit) {
                repStats[repName].visitCount++;
                repStats[repName].dealers[dealerKey].visitCount++;
            }
            if (isCall) {
                repStats[repName].callCount++;
                repStats[repName].dealers[dealerKey].callCount++;
            }
            repStats[repName].totalTouchpoints++;
            repStats[repName].dealers[dealerKey].touchpoints++;
        }

        const dealerAppList = appsByDealer.get(dealerKey) || [];
        const commTime = new Date(comm.communicationEventDatetime).getTime();

        // Compute pre and post metrics for visits within the active window only
        if (isVisit && inActiveWindow) {
            let preVol = 0, postVol = 0;
            let preApps = 0, postApps = 0;

            for (const app of dealerAppList) {
                if (app.appDate >= commTime - windowMs && app.appDate < commTime) {
                    preApps++;
                    if (app.isBooked) preVol += app.amount;
                } else if (app.appDate >= commTime && app.appDate <= commTime + windowMs) {
                    postApps++;
                    if (app.isBooked) postVol += app.amount;
                }
            }

            repStats[repName].visitPreVol += preVol;
            repStats[repName].visitPostVol += postVol;
            repStats[repName].visitPreApps += preApps;
            repStats[repName].visitPostApps += postApps;

            repStats[repName].dealers[dealerKey].visitPreVol += preVol;
            repStats[repName].dealers[dealerKey].visitPostVol += postVol;
            repStats[repName].dealers[dealerKey].visitPreApps += preApps;
            repStats[repName].dealers[dealerKey].visitPostApps += postApps;
        }
    }

    // Pre-fetch location details (dealerName, statePrefix, groupName) for unique dealers
    const allDealerKeys = new Set();
    for (const r of Object.values(repStats)) {
        for (const k of Object.keys(r.dealers)) {
            allDealerKeys.add(k);
        }
    }

    const locs = await DealerLocation.find({ clientDealerId: { $in: Array.from(allDealerKeys) } })
        .select('clientDealerId dealerName statePrefix dealerGroup')
        .populate('dealerGroup', 'name')
        .lean();

    const locMap = new Map();
    for (const l of locs) {
        if (l.clientDealerId) {
            locMap.set(l.clientDealerId.trim().toUpperCase(), l);
        }
    }

    // Format results per rep
    let networkVisits = 0;
    let networkCalls = 0;
    let networkPreVol = 0;
    let networkPostVol = 0;
    let networkPreApps = 0;
    let networkPostApps = 0;

    const reps = Object.values(repStats).map(r => {
        const netLiftDollars = Math.round(r.visitPostVol - r.visitPreVol);
        const netLiftApps = r.visitPostApps - r.visitPreApps;
        const avgLiftPerVisit = r.visitCount > 0 ? Math.round(netLiftDollars / r.visitCount) : 0;
        const hasEnoughData = r.visitPostApps + r.visitPreApps >= 3;

        // Build per-dealer breakdown array for this rep
        const dealerBreakdown = Object.values(r.dealers).map(d => {
            const loc = locMap.get(d.clientDealerId);
            const netD = Math.round(d.visitPostVol - d.visitPreVol);
            const netA = d.visitPostApps - d.visitPreApps;
            const avgL = d.visitCount > 0 ? Math.round(netD / d.visitCount) : 0;

            return {
                clientDealerId: d.clientDealerId,
                dealerName: loc ? loc.dealerName : d.dealerName,
                state: loc ? loc.statePrefix : null,
                groupName: loc && loc.dealerGroup ? loc.dealerGroup.name : null,
                touchpoints: d.touchpoints,
                visitCount: d.visitCount,
                callCount: d.callCount,
                preVisitVolume: Math.round(d.visitPreVol),
                postVisitVolume: Math.round(d.visitPostVol),
                associatedNetLiftDollars: netD,
                associatedNetLiftApps: netA,
                avgLiftPerVisit: avgL,
            };
        }).sort((a, b) => b.associatedNetLiftDollars - a.associatedNetLiftDollars);

        networkVisits += r.visitCount;
        networkCalls += r.callCount;
        networkPreVol += r.visitPreVol;
        networkPostVol += r.visitPostVol;
        networkPreApps += r.visitPreApps;
        networkPostApps += r.visitPostApps;

        return {
            rep: r.rep,
            totalTouchpoints: r.totalTouchpoints,
            visitCount: r.visitCount,
            callCount: r.callCount,
            preVisitVolume: Math.round(r.visitPreVol),
            postVisitVolume: Math.round(r.visitPostVol),
            associatedNetLiftDollars: netLiftDollars,
            associatedNetLiftApps: netLiftApps,
            avgLiftPerVisit,
            hasEnoughData,
            dealers: dealerBreakdown,
        };
    }).sort((a, b) => b.associatedNetLiftDollars - a.associatedNetLiftDollars);

    const overallNetLiftDollars = Math.round(networkPostVol - networkPreVol);
    const overallNetLiftApps = networkPostApps - networkPreApps;
    const avgNetworkLiftPerVisit = networkVisits > 0 ? Math.round(overallNetLiftDollars / networkVisits) : 0;

    return {
        windowDays: validWindow,
        dateRangeLabel,
        maxReportDate: maxReportDate.toISOString(),
        overall: {
            totalVisits: networkVisits,
            totalCalls: networkCalls,
            totalTouchpoints: networkVisits + networkCalls,
            preVisitVolume: Math.round(networkPreVol),
            postVisitVolume: Math.round(networkPostVol),
            associatedNetLiftDollars: overallNetLiftDollars,
            associatedNetLiftApps: overallNetLiftApps,
            avgNetworkLiftPerVisit,
        },
        reps,
        insufficientData: false,
    };
}

/**
 * Compute Effort vs Yield account allocation flags for rep 1-on-1 coaching.
 * Identifies High-Touch/Low-Yield ("Time Sink") and Low-Touch/High-Yield ("At-Risk Gem") accounts.
 *
 * @param {number} [windowDays=30] - Attribution window in days
 * @returns {Promise<Object>} Lists of flagged dealers
 */
async function computeEffortVsYieldFlags(windowDays = 30) {
    const validWindow = [14, 30, 60].includes(Number(windowDays)) ? Number(windowDays) : 30;
    const maxReportDate = await getMaxReportDate();
    const startDate = new Date(maxReportDate.getTime() - validWindow * 24 * 60 * 60 * 1000);

    const locations = await DealerLocation.find({}).select('_id dealerName clientDealerId statePrefix dealerRepresentative').lean();
    const comms = await DealerCommunication.find({ communicationEventDatetime: { $gte: startDate, $lte: maxReportDate } }).lean();
    const apps = await Application.find({ applicationDate: { $gte: startDate, $lte: maxReportDate }, status: 'Booked' }).lean();

    const commsByDealer = new Map();
    for (const c of comms) {
        const key = (c.internalRelationshipId2 || '').trim().toUpperCase();
        if (!key) continue;
        commsByDealer.set(key, (commsByDealer.get(key) || 0) + 1);
    }

    const volumeByDealer = new Map();
    for (const a of apps) {
        if (!a.clientDealerId) continue;
        const key = a.clientDealerId.trim().toUpperCase();
        volumeByDealer.set(key, (volumeByDealer.get(key) || 0) + (a.amountFinanced || 0));
    }

    const timeSinks = []; // High touch, low yield
    const atRiskGems = []; // Low touch, high yield

    for (const loc of locations) {
        const key = (loc.clientDealerId || '').trim().toUpperCase();
        if (!key) continue;

        const touchpoints = commsByDealer.get(key) || 0;
        const bookedVolume = Math.round(volumeByDealer.get(key) || 0);
        const repName = resolveRepDisplayName(loc.dealerRepresentative) || 'Unassigned';

        // Time Sink: >= 4 touchpoints in window BUT < $10k booked volume
        if (touchpoints >= 4 && bookedVolume < 10000) {
            timeSinks.push({
                dealerId: loc._id.toString(),
                clientDealerId: loc.clientDealerId,
                dealerName: loc.dealerName,
                state: loc.statePrefix,
                rep: repName,
                touchpoints,
                bookedVolume,
                flagType: 'time_sink',
                reason: `High outreach (${touchpoints} contacts) with low yield ($${bookedVolume.toLocaleString()})`,
            });
        }

        // At-Risk Gem: <= 1 touchpoint in window BUT >= $50k booked volume
        if (touchpoints <= 1 && bookedVolume >= 50000) {
            atRiskGems.push({
                dealerId: loc._id.toString(),
                clientDealerId: loc.clientDealerId,
                dealerName: loc.dealerName,
                state: loc.statePrefix,
                rep: repName,
                touchpoints,
                bookedVolume,
                flagType: 'at_risk_gem',
                reason: `High-value account ($${bookedVolume.toLocaleString()}) under-contacted (${touchpoints} contact)`,
            });
        }
    }

    return {
        windowDays: validWindow,
        timeSinks: timeSinks.sort((a, b) => b.touchpoints - a.touchpoints),
        atRiskGems: atRiskGems.sort((a, b) => b.bookedVolume - a.bookedVolume),
        summary: {
            timeSinkCount: timeSinks.length,
            atRiskGemCount: atRiskGems.length,
        },
    };
}

/**
 * Paginated communication history for a specific sales representative.
 * Filterable by state, group, dealer location, communication type, and text search.
 *
 * @param {Object} options
 * @param {string} options.rep - Rep display name or handle
 * @param {string} [options.state] - State prefix filter (e.g. 'TX')
 * @param {string} [options.groupSlug] - Dealer group slug filter
 * @param {string} [options.dealerId] - Client dealer ID filter
 * @param {string} [options.type] - Communication type filter (Visit, Call, Email, Meeting)
 * @param {string} [options.search] - Search text for dealer name / notes / results
 * @param {number} [options.page=1] - Page number
 * @param {number} [options.limit=25] - Items per page
 * @returns {Promise<Object>} Paginated communication items with metadata
 */
async function getRepCommunicationHistory({
    rep = null,
    state = null,
    groupSlug = null,
    dealerId = null,
    type = null,
    search = null,
    page = 1,
    limit = 25,
}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const skip = (pageNum - 1) * limitNum;

    // Build matching query
    const match = { communicationEventDatetime: { $ne: null } };

    if (rep) {
        const key = rep.trim().toLowerCase();
        const repDisplayMap = require('../config/repConfig').getRepDisplayMap();
        const targetHandles = Object.entries(repDisplayMap)
            .filter(([k, v]) => v.toLowerCase() === key || k === key)
            .map(([k]) => k);
        if (targetHandles.length === 0) targetHandles.push(key);

        const handleRegexes = targetHandles.map(h => new RegExp('^' + h + '(@|$)', 'i'));
        handleRegexes.push(new RegExp(key, 'i'));

        match.$or = [
            { communicationUserFullName: { $in: handleRegexes } },
            { communicationUserName: { $in: handleRegexes } },
            { communicationUserEmail: { $in: handleRegexes } }
        ];
    }

    if (type && type !== 'all') {
        match.communicationType = new RegExp(type, 'i');
    }

    // Pre-resolve dealer locations if state, group, or dealerId is specified
    const locMatch = {};
    if (state) locMatch.statePrefix = state.toUpperCase();
    if (groupSlug) {
        const DealerGroup = require('../models/DealerGroup');
        const grp = await DealerGroup.findOne({ slug: groupSlug }).lean();
        if (grp) locMatch.dealerGroup = grp._id;
    }
    if (dealerId) locMatch.clientDealerId = dealerId.toUpperCase();

    if (Object.keys(locMatch).length > 0) {
        const locs = await DealerLocation.find(locMatch).select('clientDealerId dealerId').lean();
        const filterDealerIds = locs.map(l => (l.clientDealerId || l.dealerId || '').trim().toUpperCase()).filter(Boolean);
        match.internalRelationshipId2 = { $in: filterDealerIds.map(d => new RegExp('^' + d + '$', 'i')) };
    }

    if (search && search.trim()) {
        const searchRegex = new RegExp(search.trim(), 'i');
        const searchConds = [
            { recipientOrganizationName: searchRegex },
            { communicationResult1: searchRegex },
            { communicationFeedback1: searchRegex },
            { internalRelationshipId2: searchRegex },
        ];
        if (match.$or) {
            match.$and = [
                { $or: match.$or },
                { $or: searchConds }
            ];
            delete match.$or;
        } else {
            match.$or = searchConds;
        }
    }

    const totalCount = await DealerCommunication.countDocuments(match);
    const commDocs = await DealerCommunication.find(match)
        .sort({ communicationEventDatetime: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean();

    const clientDealerIds = Array.from(new Set(commDocs.map(c => (c.internalRelationshipId2 || '').trim().toUpperCase()).filter(Boolean)));
    const matchingLocations = await DealerLocation.find({ clientDealerId: { $in: clientDealerIds } })
        .select('clientDealerId dealerName statePrefix dealerGroup')
        .populate('dealerGroup', 'name slug')
        .lean();

    const locationMap = new Map();
    for (const loc of matchingLocations) {
        if (loc.clientDealerId) {
            locationMap.set(loc.clientDealerId.trim().toUpperCase(), loc);
        }
    }

    const items = commDocs.map(c => {
        const key = (c.internalRelationshipId2 || '').trim().toUpperCase();
        const loc = locationMap.get(key);
        const rawUser = c.communicationUserEmail || c.communicationUserFullName || c.communicationUserName || '';
        const repDisplayName = resolveRepDisplayName(rawUser) || 'Unassigned';

        return {
            id: c._id.toString(),
            sourceCommunicationId: c.sourceCommunicationId,
            date: c.communicationEventDatetime,
            repName: repDisplayName,
            userEmail: c.communicationUserEmail || null,
            dealerName: loc ? loc.dealerName : (c.recipientOrganizationName || 'Unknown Dealer'),
            clientDealerId: c.internalRelationshipId2,
            state: loc ? loc.statePrefix : null,
            groupName: loc && loc.dealerGroup ? loc.dealerGroup.name : null,
            groupSlug: loc && loc.dealerGroup ? loc.dealerGroup.slug : null,
            type: c.communicationType || 'Other',
            result: c.communicationResult1 || null,
            feedback: c.communicationFeedback1 || null,
            sourceSystem: c.sourceSystem || null,
            timezone: c.communicationEventTimezone || null,
            isProspect: c.isProspect,
            isActiveRelationship: c.isActiveRelationship,
            isInactiveRelationship: c.isInactiveRelationship,
            lastIngestionDate: c.lastIngestionDate || null,
        };
    });

    const totalPages = Math.ceil(totalCount / limitNum) || 1;

    return {
        items,
        pagination: {
            page: pageNum,
            limit: limitNum,
            totalCount,
            totalPages,
            hasMore: pageNum < totalPages,
        },
    };
}

module.exports = {
    computeVisitImpact,
    computeEffortVsYieldFlags,
    getRepCommunicationHistory,
};
