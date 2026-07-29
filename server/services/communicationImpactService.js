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

const REP_DISPLAY_MAP = {
    'bruce': 'Bruce Sweere',
    'bsweere': 'Bruce Sweere',
    'edominguez': 'Ericka Dominguez',
    'ericka': 'Ericka Dominguez',
    'genevieve': 'Genevieve Coulombe',
    'gcoulombe': 'Genevieve Coulombe',
    'george': 'George Ott',
    'gott': 'George Ott',
    'janet': 'Janet Harrington',
    'jharrington': 'Janet Harrington',
    'jharrington1': 'Janet Harrington',
    'jeff': 'Jeff Smith',
    'jsmith': 'Jeff Smith',
    'jweller': 'Jeff Weller',
    'john': 'John Rubi',
    'jrubi': 'John Rubi',
    'ward': 'Ward Stoutimore',
    'wstoutimore': 'Ward Stoutimore',
    'steve': 'Steve Kimble',
    'skimble': 'Steve Kimble',
    'mandi': 'Mandi Schultz',
    'mandy': 'Mandi Schultz',
    'mschultz': 'Mandi Schultz',
    'mschultz1': 'Mandi Schultz',
    'tony': 'Tony DeRouin',
    'tderouin': 'Tony DeRouin',
    'dzilberchtein': 'Dan Zilberchtein',
    'danillz': 'Dan Zilberchtein',
    'daniilz': 'Dan Zilberchtein',
    'ljablonoski': 'Larry Jablonoski',
    'larryj': 'Larry Jablonoski',
    'pcarter': 'Paul Carter',
    'pam': 'Pam Carter',
    'wendy': 'Wendy',
    'jkrimker': 'J Krimker',
    'mrusin': 'M Rusin',
    'nboly': 'N Boly',
};

function resolveRepDisplayName(rawStr) {
    if (!rawStr) return null;
    let str = rawStr.trim().toLowerCase();
    if (str.includes('@')) {
        str = str.split('@')[0].trim();
    }
    const strNoNum = str.replace(/[0-9]/g, '');
    if (REP_DISPLAY_MAP[str]) return REP_DISPLAY_MAP[str];
    if (REP_DISPLAY_MAP[strNoNum]) return REP_DISPLAY_MAP[strNoNum];
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Get latest report date capped at 2026-07-22
 */
async function getMaxReportDate() {
    const snap = await DailyDealerSnapshot.findOne({}).sort({ reportDate: -1 }).select('reportDate').lean();
    if (snap && snap.reportDate) {
        return new Date(snap.reportDate);
    }
    return new Date(Date.UTC(2026, 6, 22)); // 2026-07-22 fallback
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

    const formatDateUtc = (d) => {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
    };

    // Load all communications with valid dates
    const commMatch = { communicationEventDatetime: { $ne: null } };

    if (repFilter) {
        const key = repFilter.trim().toLowerCase();
        commMatch.$or = [
            { communicationUserFullName: new RegExp(key, 'i') },
            { communicationUserName: new RegExp(key, 'i') },
            { communicationUserEmail: new RegExp(key, 'i') }
        ];
    }

    const comms = await DealerCommunication.find(commMatch).lean();

    // Compute dynamic date range of dataset
    let minCommTime = Infinity;
    let maxCommTime = -Infinity;
    for (const c of comms) {
        if (c.communicationEventDatetime) {
            const t = new Date(c.communicationEventDatetime).getTime();
            if (t < minCommTime) minCommTime = t;
            if (t > maxCommTime) maxCommTime = t;
        }
    }

    const startDateObj = minCommTime !== Infinity ? new Date(minCommTime) : new Date(Date.UTC(2025, 0, 1));
    const endDateObj = maxCommTime !== -Infinity ? new Date(Math.min(maxCommTime, maxReportDate.getTime())) : maxReportDate;
    const dateRangeLabel = `${formatDateUtc(startDateObj)} – ${formatDateUtc(endDateObj)}`;

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

    // Index applications by clientDealerId up to maxReportDate
    const apps = await Application.find(
        { applicationDate: { $gte: startDateObj, $lte: maxReportDate } },
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
            };
        }

        const commTime = new Date(comm.communicationEventDatetime).getTime();
        const type = (comm.communicationType || '').toLowerCase();
        const isVisit = type.includes('visit') || type.includes('in-person') || type.includes('meeting');
        const isCall = type.includes('call') || type.includes('phone');

        if (isVisit) repStats[repName].visitCount++;
        if (isCall) repStats[repName].callCount++;
        repStats[repName].totalTouchpoints++;

        const dealerAppList = appsByDealer.get(dealerKey) || [];

        // Compute pre and post metrics for visits
        if (isVisit) {
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
        const targetHandles = Object.entries(REP_DISPLAY_MAP)
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
