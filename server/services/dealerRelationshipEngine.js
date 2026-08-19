/**
 * Dealer Relationship Demand (DRD) Engine
 * 
 * Computes lifetime relationship demand classifications and sales routing recommendations
 * by analyzing event-level temporal causality between in-person rep visits and dealer production.
 * 
 * Segments:
 *   - high_tlc: Production surges after visits and decays without contact (visit-dependent)
 *   - self_sufficient: High baseline production regardless of visit frequency (autonomous)
 *   - unresponsive: 3+ visits with zero/negligible lifetime bookings (comfort stop / time sink)
 *   - insufficient_data: < 2 visits or < 4 months history to reliably classify
 * 
 * @module services/dealerRelationshipEngine
 */

const Application = require('../models/Application');
const DealerCommunication = require('../models/DealerCommunication');
const DealerLocation = require('../models/DealerLocation');
const DealerProfile = require('../models/DealerProfile');
const { resolveRepName, isInactiveRep, isExcludedRep } = require('../config/repConfig');

/**
 * Classify a raw communication document into a standardized channel type.
 */
function classifyCommType(comm) {
    const type = (comm.communicationType || '').toLowerCase().trim();
    const result = (comm.communicationResult1 || '').toLowerCase().trim();

    const isVisit = type === 'meeting' ||
        type === 'visit' ||
        type === 'face to face' ||
        type.includes('visit') ||
        type.includes('in-person') ||
        type.includes('meeting') ||
        result.includes('met with') ||
        result.includes('training completed') ||
        result.includes('sign up completed');

    const isCall = type === 'phone call' ||
        type === 'phone' ||
        type.includes('call') ||
        type.includes('phone') ||
        result.includes('spoke with') ||
        result.includes('follow up') ||
        result.includes('returned phone call') ||
        result.includes('not able to speak');

    const isEmail = type === 'email' ||
        type === 'e-mail' ||
        type.includes('email') ||
        type.includes('mail');

    if (isVisit) return 'visit';
    if (isCall) return 'call';
    if (isEmail) return 'email';
    return 'other';
}

/**
 * Calculate median of a numeric array.
 */
function median(values) {
    if (!values || values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Merge overlapping time intervals [start, end].
 */
function mergeIntervals(intervals) {
    if (!intervals || intervals.length === 0) return [];
    const sorted = [...intervals].sort((a, b) => a.start - b.start);
    const merged = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
        const current = sorted[i];
        const last = merged[merged.length - 1];

        if (current.start <= last.end) {
            last.end = Math.max(last.end, current.end);
        } else {
            merged.push(current);
        }
    }
    return merged;
}

/**
 * Analyze a single dealer's lifetime timeline and compute their DRD profile.
 * 
 * @param {Object} dealerLoc - DealerLocation document
 * @param {Array} apps - Chronologically sorted application array for this dealer
 * @param {Array} comms - Chronologically sorted communication array for this dealer
 * @param {Date} [referenceDate=new Date()] - Reference date for recency calculations
 * @returns {Object} Profile data object ready for DealerProfile upsert
 */
function evaluateDealerProfile(dealerLoc, apps, comms, referenceDate = new Date()) {
    const clientDealerId = (dealerLoc.clientDealerId || dealerLoc.dealerId).trim().toUpperCase();
    const assignedRep = resolveRepName(dealerLoc.dealerRepresentative || '') || null;
    const nowMs = referenceDate.getTime();
    const DAY_MS = 24 * 60 * 60 * 1000;
    const TOUCHED_WINDOW_DAYS = 45;
    const TOUCHED_WINDOW_MS = TOUCHED_WINDOW_DAYS * DAY_MS;

    // ── 1. Extract & Classify Events ──
    const visits = [];
    const calls = [];
    const emails = [];
    let lastVisitDate = null;
    let lastTouchDate = null;
    let lastTouchType = null;

    for (const c of comms) {
        if (!c.communicationEventDatetime) continue;
        const d = new Date(c.communicationEventDatetime);
        if (isNaN(d.getTime())) continue;

        const cType = classifyCommType(c);
        if (cType === 'visit') visits.push(d);
        else if (cType === 'call') calls.push(d);
        else if (cType === 'email') emails.push(d);

        if (!lastTouchDate || d > lastTouchDate) {
            lastTouchDate = d;
            lastTouchType = cType;
        }
        if (cType === 'visit' && (!lastVisitDate || d > lastVisitDate)) {
            lastVisitDate = d;
        }
    }

    visits.sort((a, b) => a.getTime() - b.getTime());

    // Clean application events
    const validApps = [];
    let totalBookings = 0;
    let totalBookedVolume = 0;

    for (const app of apps) {
        if (!app.applicationDate) continue;
        const d = new Date(app.applicationDate);
        if (isNaN(d.getTime())) continue;

        const isBooked = app.status === 'Booked';
        const amount = isBooked ? (Number(app.amountFinanced) || 0) : 0;

        if (isBooked) {
            totalBookings++;
            totalBookedVolume += amount;
        }

        validApps.push({
            date: d,
            isBooked,
            amount
        });
    }

    validApps.sort((a, b) => a.date.getTime() - b.date.getTime());

    const totalApplications = validApps.length;
    const totalVisits = visits.length;
    const totalCalls = calls.length;
    const totalEmails = emails.length;
    const totalTouchpoints = totalVisits + totalCalls + totalEmails;
    const yieldPerVisit = totalVisits > 0 ? Math.round(totalBookedVolume / totalVisits) : 0;

    const daysSinceLastVisit = lastVisitDate ? Math.max(0, Math.floor((nowMs - lastVisitDate.getTime()) / DAY_MS)) : null;
    const daysSinceLastTouch = lastTouchDate ? Math.max(0, Math.floor((nowMs - lastTouchDate.getTime()) / DAY_MS)) : null;

    // ── 2. Time Window Elasticity Analysis ──
    // Determine overall observation span
    let earliestDate = validApps.length > 0 ? validApps[0].date : (visits.length > 0 ? visits[0] : null);
    if (earliestDate && earliestDate < new Date('2024-01-01')) {
        // Bound active visit analysis window to modern observation era where comms are recorded
        earliestDate = new Date('2024-01-01');
    }

    let visitElasticity = null;
    let productionHalfLifeDays = null;
    let touchedAppCount = 0;
    let untouchedAppCount = 0;

    if (earliestDate && totalVisits > 0) {
        const spanTotalDays = Math.max(1, Math.floor((nowMs - earliestDate.getTime()) / DAY_MS));

        // Create merged touched windows [visit, visit + 45 days]
        const rawWindows = visits.map(v => ({
            start: v.getTime(),
            end: Math.min(nowMs, v.getTime() + TOUCHED_WINDOW_MS)
        }));
        const mergedWindows = mergeIntervals(rawWindows);

        let touchedDaysMs = 0;
        for (const w of mergedWindows) {
            touchedDaysMs += (w.end - w.start);
        }
        const touchedDays = Math.max(1, Math.floor(touchedDaysMs / DAY_MS));
        const untouchedDays = Math.max(0, spanTotalDays - touchedDays);

        // Count applications inside vs outside touched windows
        for (const app of validApps) {
            if (app.date < earliestDate) continue;
            const appMs = app.date.getTime();
            const inTouched = mergedWindows.some(w => appMs >= w.start && appMs <= w.end);
            if (inTouched) touchedAppCount++;
            else untouchedAppCount++;
        }

        const touchedRate = (touchedAppCount / touchedDays) * 30; // Apps per 30 days
        const untouchedRate = untouchedDays > 0 ? (untouchedAppCount / untouchedDays) * 30 : 0;

        visitElasticity = Math.round(((touchedRate + 0.1) / (untouchedRate + 0.1)) * 100) / 100;

        // ── 3. Touch Decay Half-Life ──
        // For visits followed by apps within 45 days, measure days until last app before dormancy
        const halfLifeMeasurements = [];
        for (const v of visits) {
            const vMs = v.getTime();
            const postApps = validApps.filter(a => a.date.getTime() >= vMs && a.date.getTime() <= vMs + TOUCHED_WINDOW_MS);
            if (postApps.length > 0) {
                const lastAppMs = postApps[postApps.length - 1].date.getTime();
                const daysToLastApp = Math.max(1, Math.floor((lastAppMs - vMs) / DAY_MS));
                halfLifeMeasurements.push(daysToLastApp);
            }
        }
        if (halfLifeMeasurements.length > 0) {
            productionHalfLifeDays = Math.round(median(halfLifeMeasurements));
        }
    }

    // ── 4. Dormancy & Recovery Analysis ──
    // Find 60+ day gaps between applications
    let totalDormancyEpisodes = 0;
    let dormanciesEndedByVisit = 0;

    if (validApps.length >= 2) {
        for (let i = 1; i < validApps.length; i++) {
            const prevApp = validApps[i - 1].date;
            const currApp = validApps[i].date;
            const gapDays = Math.floor((currApp.getTime() - prevApp.getTime()) / DAY_MS);

            if (gapDays >= 60) {
                totalDormancyEpisodes++;
                // Check if a visit occurred in the gap within 45 days before currApp
                const hadVisitBeforeReturn = visits.some(v =>
                    v.getTime() > prevApp.getTime() &&
                    v.getTime() <= currApp.getTime() &&
                    (currApp.getTime() - v.getTime()) <= TOUCHED_WINDOW_MS
                );
                if (hadVisitBeforeReturn) {
                    dormanciesEndedByVisit++;
                }
            }
        }
    }

    const dormancyVisitRecoveryRate = totalDormancyEpisodes > 0 ?
        Math.round((dormanciesEndedByVisit / totalDormancyEpisodes) * 100) / 100 : 0;

    // ── 5. Classification Logic ──
    let relationshipDemand = 'insufficient_data';
    let confidenceScore = 0.3;
    let recommendedCadenceDays = null;
    let urgencyStatus = 'not_monitored';

    if (totalVisits < 2 && totalApplications < 5) {
        relationshipDemand = 'insufficient_data';
        confidenceScore = 0.35;
        recommendedCadenceDays = null;
        urgencyStatus = 'not_monitored';
    } else if (totalVisits >= 3 && totalBookings === 0 && totalApplications <= 2) {
        // Unresponsive / Comfort Stop / Time Sink
        relationshipDemand = 'unresponsive';
        confidenceScore = Math.min(0.95, 0.70 + (totalVisits * 0.05));
        recommendedCadenceDays = null; // Do not recommend field visits
        urgencyStatus = 'not_monitored';
    } else if (
        (visitElasticity !== null && visitElasticity >= 2.0 && touchedAppCount >= 2) ||
        (dormancyVisitRecoveryRate >= 0.5 && dormanciesEndedByVisit >= 1) ||
        (totalVisits >= 2 && touchedAppCount >= 2 && untouchedAppCount === 0)
    ) {
        // High TLC: Clear visit dependency
        relationshipDemand = 'high_tlc';
        confidenceScore = Math.min(0.95, 0.55 + (totalVisits * 0.05) + (totalBookings * 0.04));
        
        // Recommended Cadence based on half-life (default 30-45 days)
        const halfLife = productionHalfLifeDays || 30;
        recommendedCadenceDays = Math.min(60, Math.max(30, Math.round(halfLife / 5) * 5));

        // Urgency Calculation
        if (daysSinceLastVisit === null || daysSinceLastVisit > recommendedCadenceDays) {
            urgencyStatus = 'overdue';
        } else if (daysSinceLastVisit >= recommendedCadenceDays - 7) {
            urgencyStatus = 'due_soon';
        } else {
            urgencyStatus = 'on_track';
        }
    } else if (totalApplications >= 8 || (visitElasticity !== null && visitElasticity < 2.0 && untouchedAppCount >= 4)) {
        // Self-Sufficient: Consistent production even without visits
        relationshipDemand = 'self_sufficient';
        confidenceScore = Math.min(0.95, 0.60 + Math.min(0.30, totalApplications * 0.01));
        recommendedCadenceDays = 90; // Quarterly digital check-in
        urgencyStatus = 'self_sufficient';
    } else {
        // Borderline with some data but not yet decisive
        relationshipDemand = 'insufficient_data';
        confidenceScore = 0.45;
        recommendedCadenceDays = 60;
        urgencyStatus = 'not_monitored';
    }

    return {
        dealerLocation: dealerLoc._id,
        clientDealerId,
        dealerName: dealerLoc.dealerName || 'Unknown Dealer',
        statePrefix: dealerLoc.statePrefix || null,
        dealerGroup: dealerLoc.dealerGroup || null,
        assignedRep,
        relationshipDemand,
        confidenceScore: Math.round(confidenceScore * 100) / 100,
        recommendedCadenceDays,
        daysSinceLastVisit,
        lastVisitDate,
        daysSinceLastTouch,
        lastTouchDate,
        lastTouchType,
        urgencyStatus,
        visitElasticity,
        productionHalfLifeDays,
        lifetimeStats: {
            totalVisits,
            totalCalls,
            totalEmails,
            totalTouchpoints,
            totalApplications,
            totalBookings,
            totalBookedVolume,
            yieldPerVisit
        },
        dormancyStats: {
            totalDormancyEpisodes,
            dormanciesEndedByVisit,
            dormancyVisitRecoveryRate
        },
        lastCalculatedAt: new Date()
    };
}

/**
 * Recompute and bulk upsert DealerProfile documents for all active dealer locations.
 * 
 * @param {Object} [options]
 * @param {Date} [options.referenceDate=new Date()]
 * @param {string[]} [options.dealerIds=null] - Optional filter for specific clientDealerIds
 * @returns {Promise<Object>} Execution summary with counts per DRD segment
 */
async function recomputeAllProfiles({ referenceDate = new Date(), dealerIds = null } = {}) {
    const startTime = Date.now();
    console.log(`\n=== RECOMPUTING DEALER RELATIONSHIP PROFILES ===`);

    // 1. Load active DealerLocations
    const dealerQuery = { omniDealerId: { $exists: true, $ne: null } };
    if (dealerIds && dealerIds.length > 0) {
        dealerQuery.clientDealerId = { $in: dealerIds.map(d => d.toUpperCase()) };
    }

    const dealers = await DealerLocation.find(dealerQuery, {
        _id: 1,
        dealerId: 1,
        clientDealerId: 1,
        dealerName: 1,
        statePrefix: 1,
        dealerGroup: 1,
        dealerRepresentative: 1
    }).lean();

    console.log(`Loaded ${dealers.length} dealer location(s). Indexing applications and comms...`);

    // 2. Pre-fetch and index all Applications by clientDealerId
    const appQuery = { applicationDate: { $ne: null } };
    if (dealerIds && dealerIds.length > 0) {
        appQuery.clientDealerId = { $in: dealerIds.map(d => d.toUpperCase()) };
    }

    const apps = await Application.find(appQuery, {
        clientDealerId: 1,
        applicationDate: 1,
        status: 1,
        amountFinanced: 1
    }).lean();

    const appsByDealer = new Map();
    for (const app of apps) {
        if (!app.clientDealerId) continue;
        const key = app.clientDealerId.trim().toUpperCase();
        if (!appsByDealer.has(key)) appsByDealer.set(key, []);
        appsByDealer.get(key).push(app);
    }

    // 3. Pre-fetch and index all Communications by internalRelationshipId2 (clientDealerId)
    const commQuery = { communicationEventDatetime: { $ne: null } };
    if (dealerIds && dealerIds.length > 0) {
        commQuery.internalRelationshipId2 = { $in: dealerIds.map(d => d.toUpperCase()) };
    }

    const comms = await DealerCommunication.find(commQuery, {
        internalRelationshipId2: 1,
        communicationEventDatetime: 1,
        communicationType: 1,
        communicationResult1: 1
    }).lean();

    const commsByDealer = new Map();
    for (const comm of comms) {
        if (!comm.internalRelationshipId2) continue;
        const key = comm.internalRelationshipId2.trim().toUpperCase();
        if (!commsByDealer.has(key)) commsByDealer.set(key, []);
        commsByDealer.get(key).push(comm);
    }

    console.log(`Loaded ${apps.length.toLocaleString()} applications and ${comms.length.toLocaleString()} communications.`);
    console.log(`Processing profiles in memory...`);

    // 4. Evaluate each dealer profile in-memory
    const bulkOps = [];
    const segmentCounts = {
        high_tlc: 0,
        self_sufficient: 0,
        unresponsive: 0,
        insufficient_data: 0
    };
    const urgencyCounts = {
        overdue: 0,
        due_soon: 0,
        on_track: 0,
        self_sufficient: 0,
        not_monitored: 0
    };

    for (const dealer of dealers) {
        const key = (dealer.clientDealerId || dealer.dealerId).trim().toUpperCase();
        const dealerApps = appsByDealer.get(key) || [];
        const dealerComms = commsByDealer.get(key) || [];

        const profileData = evaluateDealerProfile(dealer, dealerApps, dealerComms, referenceDate);

        segmentCounts[profileData.relationshipDemand]++;
        urgencyCounts[profileData.urgencyStatus]++;

        bulkOps.push({
            updateOne: {
                filter: { dealerLocation: dealer._id },
                update: { $set: profileData },
                upsert: true
            }
        });
    }

    // 5. Bulk write to MongoDB
    console.log(`Writing ${bulkOps.length.toLocaleString()} profiles to MongoDB...`);
    const BATCH_SIZE = 500;
    for (let i = 0; i < bulkOps.length; i += BATCH_SIZE) {
        const batch = bulkOps.slice(i, i + BATCH_SIZE);
        await DealerProfile.bulkWrite(batch, { ordered: false });
    }

    const durationMs = Date.now() - startTime;
    console.log(`\n✅ PROFILE COMPUTATION COMPLETE (${(durationMs / 1000).toFixed(1)}s)`);
    console.log(`  Segment Distribution:`);
    console.log(`    🔴 High TLC (Visit-Dependent) : ${segmentCounts.high_tlc.toLocaleString()} (${(segmentCounts.high_tlc / dealers.length * 100).toFixed(1)}%)`);
    console.log(`    🟢 Self-Sufficient (Organic)   : ${segmentCounts.self_sufficient.toLocaleString()} (${(segmentCounts.self_sufficient / dealers.length * 100).toFixed(1)}%)`);
    console.log(`    🟠 Unresponsive (Time Sink)   : ${segmentCounts.unresponsive.toLocaleString()} (${(segmentCounts.unresponsive / dealers.length * 100).toFixed(1)}%)`);
    console.log(`    ⚪ Insufficient Data          : ${segmentCounts.insufficient_data.toLocaleString()} (${(segmentCounts.insufficient_data / dealers.length * 100).toFixed(1)}%)`);
    console.log(`  Urgency Status:`);
    console.log(`    🚨 Overdue Visits             : ${urgencyCounts.overdue.toLocaleString()}`);
    console.log(`    ⏳ Due Soon                   : ${urgencyCounts.due_soon.toLocaleString()}`);
    console.log(`    ✅ On Track                   : ${urgencyCounts.on_track.toLocaleString()}`);

    return {
        totalDealers: dealers.length,
        segmentCounts,
        urgencyCounts,
        durationMs
    };
}

module.exports = {
    evaluateDealerProfile,
    recomputeAllProfiles
};
