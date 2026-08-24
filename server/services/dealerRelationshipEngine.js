/**
 * Dealer Relationship Demand (DRD) & Field Allocation Engine (v6.2 Final)
 * 
 * Computes deterministic, auditable relationship demand profiles and sales routing recommendations
 * by analyzing event-level temporal causality between in-person rep visits and funded loan production.
 * 
 * Segments:
 *   - high_tlc: Funded loan production strictly surges after visits and decays without contact (Spike & Decay)
 *   - self_sufficient: Consistent organic flow via portal; visits produce negligible lift (Autonomous)
 *   - comfort_stop: 3+ visits with $0 in lifetime booked loans (waste of travel budget)
 *   - insufficient_data: < 2 visits and < 5 applications (Discovery Queue)
 * 
 * @module services/dealerRelationshipEngine
 */

const Application = require('../models/Application');
const DealerCommunication = require('../models/DealerCommunication');
const DealerLocation = require('../models/DealerLocation');
const DealerProfile = require('../models/DealerProfile');
const { resolveRepName } = require('../config/repConfig');

/**
 * Monthly seasonal baseline indices for RV and specialty vehicle lending.
 * Normalizes pre/post visit comparisons so winter lull is not falsely flagged as visit decay.
 */
const MONTHLY_SEASONAL_INDEX = {
    0: 0.70,  // Jan (Low season)
    1: 0.80,  // Feb
    2: 1.15,  // Mar (Spring ramp-up)
    3: 1.25,  // Apr
    4: 1.35,  // May (Peak buying season)
    5: 1.30,  // Jun
    6: 1.25,  // Jul
    7: 1.15,  // Aug
    8: 0.95,  // Sep
    9: 0.85,  // Oct
    10: 0.65, // Nov (Winter lull)
    11: 0.60  // Dec
};

/**
 * Calculate dynamic post-visit active window based on calendar month of the visit.
 * Spring / Summer Peak (Mar - Aug): 55 days (Extended consumer shopping cycle)
 * Shoulder Season (Sep - Oct): 45 days
 * Winter / Off-Season (Nov - Feb): 35 days (Tighter turnaround required)
 * 
 * @param {Date} date - Date of the visit episode
 * @returns {number} Days in active post-visit envelope
 */
function getSeasonalPostWindowDays(date) {
    if (!date || isNaN(date.getTime())) return 45;
    const month = date.getMonth(); // 0 = Jan, 11 = Dec
    if (month >= 2 && month <= 7) return 55; // Mar - Aug
    if (month >= 8 && month <= 9) return 45; // Sep - Oct
    return 35; // Nov - Feb
}

/**
 * Classify and normalize communication records across both Jeriko (2024-2025) and Badger Maps (2026).
 * 
 * @param {Object} comm - Raw communication document
 * @returns {'visit' | 'call' | 'email' | 'text' | 'other'} Standardized channel
 */
function classifyCommType(comm) {
    const rawType = (comm.communicationType || '').toLowerCase().trim();
    const result = (comm.communicationResult1 || '').toLowerCase().trim();

    // 1. In-Person Visits (Catches Jeriko types + 2026 Badger Maps results)
    const isVisit = rawType === 'visit' ||
        rawType === 'meeting' ||
        rawType === 'face to face' ||
        rawType.includes('visit') ||
        rawType.includes('in-person') ||
        rawType.includes('meeting') ||
        result.includes('met with') ||
        result.includes('training completed') ||
        result.includes('sign up completed');

    if (isVisit) return 'visit';

    // 2. Phone Calls
    const isCall = rawType === 'phone' ||
        rawType === 'phone call' ||
        rawType.includes('call') ||
        rawType.includes('phone') ||
        result.includes('spoke with') ||
        result.includes('follow up on approvals') ||
        result.includes('returned phone call') ||
        result.includes('not able to speak');

    if (isCall) return 'call';

    // 3. Digital Correspondence
    if (rawType === 'email' || rawType.includes('mail')) return 'email';
    if (rawType === 'text' || rawType === 'sms') return 'text';

    return 'other';
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
 * Cluster visits occurring within <45 days of each other into discrete episodes.
 * 
 * @param {Array<{date: Date, repName: string, notes?: string}>} visits - Chronological visits
 * @returns {Array<Object>} Discrete visit clusters
 */
function clusterVisits(visits) {
    if (!visits || visits.length === 0) return [];
    const DAY_MS = 24 * 60 * 60 * 1000;
    const CLUSTER_WINDOW_DAYS = 45;

    const sorted = [...visits].sort((a, b) => a.date.getTime() - b.date.getTime());
    const clusters = [];
    let currentCluster = {
        clusterNumber: 1,
        visits: [sorted[0]],
        startDate: sorted[0].date,
        endDate: sorted[0].date,
        repName: sorted[0].repName || 'Sales Rep'
    };

    for (let i = 1; i < sorted.length; i++) {
        const v = sorted[i];
        const gapDays = Math.floor((v.date.getTime() - currentCluster.endDate.getTime()) / DAY_MS);

        if (gapDays < CLUSTER_WINDOW_DAYS) {
            // Merge into current cluster
            currentCluster.visits.push(v);
            currentCluster.endDate = v.date;
            if (v.repName && currentCluster.repName === 'Sales Rep') {
                currentCluster.repName = v.repName;
            }
        } else {
            // Finalize current cluster and start new one
            clusters.push(currentCluster);
            currentCluster = {
                clusterNumber: clusters.length + 1,
                visits: [v],
                startDate: v.date,
                endDate: v.date,
                repName: v.repName || 'Sales Rep'
            };
        }
    }
    clusters.push(currentCluster);
    return clusters;
}

/**
 * Pure function to calculate operational urgency based on days since last visit vs. recommended cadence.
 * 
 * @param {number|null} daysSinceLastVisit
 * @param {number|null} cadenceDays
 * @param {'high_tlc' | 'self_sufficient' | 'comfort_stop' | 'insufficient_data'} segment
 * @returns {'overdue' | 'due_soon' | 'on_track' | 'self_sufficient' | 'not_monitored'}
 */
function calculateUrgency(daysSinceLastVisit, cadenceDays, segment) {
    if (segment === 'self_sufficient') return 'self_sufficient';
    if (segment === 'comfort_stop' || segment === 'insufficient_data') return 'not_monitored';
    if (!cadenceDays) return 'not_monitored';

    // If unvisited for > 365 days, it is dormant (special reactivation, not active weekly route)
    if (daysSinceLastVisit !== null && daysSinceLastVisit > 365) {
        return 'dormant';
    }

    if (daysSinceLastVisit === null || daysSinceLastVisit > cadenceDays) {
        return 'overdue';
    }
    if (daysSinceLastVisit >= cadenceDays - 7) {
        return 'due_soon';
    }
    return 'on_track';
}

/**
 * Analyze a single dealer location's lifetime timeline and evaluate their DRD profile.
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
    const POST_WINDOW_DAYS = 45;
    const POST_WINDOW_MS = POST_WINDOW_DAYS * DAY_MS;

    // ── 1. Normalize and Classify Communications ──
    const rawVisits = [];
    const rawCalls = [];
    const rawEmails = [];
    let lastVisitDate = null;
    let lastTouchDate = null;
    let lastTouchType = null;

    for (const c of comms) {
        if (!c.communicationEventDatetime) continue;
        const d = new Date(c.communicationEventDatetime);
        if (isNaN(d.getTime())) continue;

        const channel = classifyCommType(c);
        const repName = c.communicationUserFullName || assignedRep || 'Sales Rep';

        if (channel === 'visit') {
            rawVisits.push({ date: d, repName, notes: c.communicationResult1 || '' });
            if (!lastVisitDate || d > lastVisitDate) lastVisitDate = d;
        } else if (channel === 'call') {
            rawCalls.push({ date: d, repName });
        } else if (channel === 'email') {
            rawEmails.push({ date: d, repName });
        }

        if (!lastTouchDate || d > lastTouchDate) {
            lastTouchDate = d;
            lastTouchType = channel;
        }
    }

    rawVisits.sort((a, b) => a.date.getTime() - b.date.getTime());

    // ── 2. Clean and Index Application & Booked Events ──
    const validApps = [];
    let totalBookings = 0;
    let totalBookedVolume = 0;

    for (const app of apps) {
        if (!app.applicationDate) continue;
        const appDate = new Date(app.applicationDate);
        if (isNaN(appDate.getTime())) continue;

        const isBooked = app.status === 'Booked';
        const amount = isBooked ? (Number(app.amountFinanced) || 0) : 0;
        const bookedDate = (isBooked && app.bookedDate) ? new Date(app.bookedDate) : appDate;

        if (isBooked) {
            totalBookings++;
            totalBookedVolume += amount;
        }

        validApps.push({
            appDate,
            bookedDate,
            isBooked,
            amount
        });
    }

    validApps.sort((a, b) => a.appDate.getTime() - b.appDate.getTime());

    const totalApplications = validApps.length;
    const totalVisits = rawVisits.length;
    const totalCalls = rawCalls.length;
    const totalEmails = rawEmails.length;
    const totalTouchpoints = totalVisits + totalCalls + totalEmails;
    const lifetimeYieldPerVisit = totalVisits > 0 ? Math.round(totalBookedVolume / totalVisits) : 0;

    const daysSinceLastVisit = lastVisitDate ? Math.max(0, Math.floor((nowMs - lastVisitDate.getTime()) / DAY_MS)) : null;
    const daysSinceLastTouch = lastTouchDate ? Math.max(0, Math.floor((nowMs - lastTouchDate.getTime()) / DAY_MS)) : null;

    // ── 3. Cluster Visits into Discrete Episodes & Measure Touched Active Envelopes ──
    const visitClusters = clusterVisits(rawVisits);
    const verifiedCycleCount = visitClusters.length;

    // Build merged active visit envelopes: [visit.startDate, visit.endDate + seasonalPostWindowDays]
    const rawEnvelopes = visitClusters.map(c => {
        const windowDays = getSeasonalPostWindowDays(c.startDate);
        return {
            start: c.startDate.getTime(),
            end: c.endDate.getTime() + (windowDays * DAY_MS)
        };
    });
    const mergedEnvelopes = mergeIntervals(rawEnvelopes);

    // Measure Touched vs Untouched Bookings & Applications across entire history
    let touchedBookedCount = 0;
    let touchedBookedVolume = 0;
    let touchedAppCount = 0;
    let untouchedBookedCount = 0;
    let untouchedBookedVolume = 0;
    let untouchedAppCount = 0;

    for (const app of validApps) {
        const appMs = app.appDate.getTime();
        const isInsideTouched = mergedEnvelopes.some(env => appMs >= env.start && appMs <= env.end);

        if (isInsideTouched) {
            touchedAppCount++;
            if (app.isBooked) {
                touchedBookedCount++;
                touchedBookedVolume += app.amount;
            }
        } else {
            untouchedAppCount++;
            if (app.isBooked) {
                untouchedBookedCount++;
                untouchedBookedVolume += app.amount;
            }
        }
    }

    // ── 4. Evaluate Each Interaction Cycle (Relative Booked Lift & Decay) ──
    const interactionCycles = [];
    let spikeAndDecayCycleCount = 0;
    const cycleYields = [];

    for (let i = 0; i < visitClusters.length; i++) {
        const cluster = visitClusters[i];
        const clusterEndMs = cluster.endDate.getTime();
        const clusterStartMs = cluster.startDate.getTime();
        const seasonalWindowDays = getSeasonalPostWindowDays(cluster.startDate);
        const postEndMs = clusterEndMs + (seasonalWindowDays * DAY_MS);
        const preStartMs = clusterStartMs - (seasonalWindowDays * DAY_MS);

        // Apps & Bookings inside Cluster Envelope [startDate, endDate + seasonalWindowDays]
        const clusterApps = validApps.filter(a => {
            const t = a.appDate.getTime();
            return t >= clusterStartMs && t <= postEndMs;
        });

        const clusterBooked = clusterApps.filter(a => a.isBooked);
        const bookedInWindow = clusterBooked.length;
        const bookedVolumeInWindow = clusterBooked.reduce((sum, a) => sum + a.amount, 0);
        const appsInWindow = clusterApps.length;
        cycleYields.push(bookedVolumeInWindow);

        // Pre-Window baseline [startDate - seasonalWindowDays, startDate]
        const preApps = validApps.filter(a => {
            const t = a.appDate.getTime();
            return t >= preStartMs && t < clusterStartMs;
        });
        const preBooked = preApps.filter(a => a.isBooked);
        const preBookedVolume = preBooked.reduce((sum, a) => sum + a.amount, 0);

        // Calculate Relative Booked Lift (seasonally normalized)
        const startMonth = cluster.startDate.getMonth();
        const seasonWeight = MONTHLY_SEASONAL_INDEX[startMonth] || 1.0;
        const preRate = (preBookedVolume / seasonalWindowDays) * 30 * seasonWeight;
        const postRate = (bookedVolumeInWindow / seasonalWindowDays) * 30;
        const relativeBookedLift = Math.round(((postRate - preRate) / Math.max(preRate, 5000)) * 100) / 100;

        // Days to first booked deal
        let daysToFirstBooked = null;
        if (clusterBooked.length > 0) {
            const firstBookedMs = clusterBooked[0].bookedDate.getTime();
            daysToFirstBooked = Math.max(0, Math.floor((firstBookedMs - clusterStartMs) / DAY_MS));
        }

        // Measure subsequent decay in [endDate + seasonalWindowDays, nextClusterStart or +90d]
        const nextClusterStartMs = (i + 1 < visitClusters.length) ? visitClusters[i + 1].startDate.getTime() : postEndMs + (45 * DAY_MS);
        const decayApps = validApps.filter(a => {
            const t = a.appDate.getTime();
            return t > postEndMs && t < nextClusterStartMs;
        });

        const isDecayed = decayApps.length <= 1;
        let patternObserved = 'empty_friction';

        if (bookedInWindow >= 1 && (relativeBookedLift >= 1.5 || preBooked.length === 0)) {
            patternObserved = isDecayed ? 'spike_and_decay' : 'escalation';
            if (patternObserved === 'spike_and_decay' || isDecayed) {
                spikeAndDecayCycleCount++;
            }
        } else if (appsInWindow >= 3 && bookedInWindow === 0) {
            patternObserved = 'empty_friction';
        } else if (bookedInWindow === 0 && appsInWindow === 0) {
            patternObserved = 'empty_friction';
        } else {
            patternObserved = 'autonomous_flow';
        }

        const dateStr = cluster.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const visitCountText = cluster.visits.length > 1 ? `Cluster (${cluster.visits.length} visits)` : 'Visit';
        const summaryText = bookedInWindow > 0
            ? `${visitCountText} on ${dateStr} by ${cluster.repName} → $${(bookedVolumeInWindow / 1000).toFixed(1)}K Booked (${bookedInWindow} deal${bookedInWindow > 1 ? 's' : ''}), ${appsInWindow} apps → ${isDecayed ? 'Flatlined at Day 45' : 'Sustained flow'}`
            : `${visitCountText} on ${dateStr} by ${cluster.repName} → 0 Booked deals ($0), ${appsInWindow} apps logged`;

        interactionCycles.push({
            cycleNumber: i + 1,
            startDate: cluster.startDate,
            endDate: cluster.endDate,
            triggerDate: cluster.startDate,
            triggerType: 'visit',
            repName: cluster.repName,
            visitCountInCluster: cluster.visits.length,
            metrics: {
                daysToFirstBooked,
                bookedInWindow,
                bookedVolumeInWindow,
                appsInWindow,
                relativeBookedLift,
                dormancyDurationDaysAfter: isDecayed ? 45 : 0,
                patternObserved
            },
            summaryText
        });
    }

    // Sort interaction cycles newest first for UI display
    interactionCycles.sort((a, b) => b.startDate.getTime() - a.startDate.getTime());

    // ── 5. Pipeline & Underwriting Conversion Metrics ──
    let totalApproved = 0;
    let totalDeclined = 0;
    const underwriterCounts = {};
    const lenderCounts = {};

    for (const app of apps) {
        if (app.status === 'Approved' || app.status === 'Booked') totalApproved++;
        if (app.status === 'Declined' || app.status === 'Withdrawn') totalDeclined++;
        if (app.underwriter) underwriterCounts[app.underwriter] = (underwriterCounts[app.underwriter] || 0) + 1;
        if (app.lender) lenderCounts[app.lender] = (lenderCounts[app.lender] || 0) + 1;
    }

    const topUnderwriter = Object.entries(underwriterCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const topLender = Object.entries(lenderCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    const approvalRatePct = totalApplications > 0 ? Math.round((totalApproved / totalApplications) * 100) : 0;
    const lookToBookPct = totalApplications > 0 ? Math.round((totalBookings / totalApplications) * 100) : 0;
    const approvalToBookPct = totalApproved > 0 ? Math.round((totalBookings / totalApproved) * 100) : 0;

    const pipelineStats = {
        totalApplications,
        totalApproved,
        totalBookings,
        totalDeclined,
        approvalRatePct,
        lookToBookPct,
        approvalToBookPct,
        topUnderwriter,
        topLender
    };

    // Secondary Diagnostic Flags
    let isFadingTlc = false;
    if (cycleYields.length >= 2) {
        const lastYield = cycleYields[cycleYields.length - 1];
        const prevYield = cycleYields[cycleYields.length - 2];
        if (prevYield > 50000 && lastYield < prevYield * 0.60) {
            isFadingTlc = true;
        }
    }

    let isCatalyticActivation = false;
    if (visitClusters.length === 1 && totalBookings >= 5 && totalApplications >= 15) {
        const clusterEndMs = visitClusters[0].endDate.getTime();
        const appsPrior = validApps.filter(a => a.appDate.getTime() < clusterEndMs).length;
        if (appsPrior <= 2) {
            isCatalyticActivation = true;
        }
    }

    const lastAppDate = validApps.length > 0 ? validApps[validApps.length - 1].appDate : null;
    let lastBookedDate = null;
    for (let i = validApps.length - 1; i >= 0; i--) {
        if (validApps[i].isBooked) {
            lastBookedDate = validApps[i].bookedDate;
            break;
        }
    }
    const daysSinceLastApp = lastAppDate ? Math.max(0, Math.floor((nowMs - lastAppDate.getTime()) / DAY_MS)) : null;
    const daysSinceLastBooked = lastBookedDate ? Math.max(0, Math.floor((nowMs - lastBookedDate.getTime()) / DAY_MS)) : null;

    const isLapsed = (daysSinceLastApp !== null && daysSinceLastApp > 180);
    const isDormant = (daysSinceLastApp === null && daysSinceLastVisit !== null && daysSinceLastVisit > 365) || (daysSinceLastApp !== null && daysSinceLastApp > 365) || (daysSinceLastVisit !== null && daysSinceLastVisit > 365);

    // Calculate Organic vs. Post-Visit Booked Ratio
    const organicBookedRatio = totalBookedVolume > 0
        ? Math.max(0, Math.round((untouchedBookedVolume / totalBookedVolume) * 100))
        : 0;

    const postVisitBookedLiftPct = totalBookedVolume > 0
        ? Math.round((touchedBookedVolume / totalBookedVolume) * 100)
        : null;

    const yieldPerVisit = totalVisits > 0 ? Math.round(totalBookedVolume / totalVisits) : 0;

    const isOverVisitedSink = (totalVisits >= 15 && yieldPerVisit < 25000 && totalBookedVolume < 500000);
    const isUnderwritingFriction = (
        (totalVisits >= 3 && totalApplications >= 8 && (totalBookings === 0 || (totalBookings <= 1 && totalBookedVolume < 50000 && (approvalRatePct <= 35 || lookToBookPct <= 5)))) ||
        (totalVisits >= 3 && totalApplications >= 35 && (approvalRatePct <= 20 || lookToBookPct <= 8) && (yieldPerVisit < 35000 || totalVisits >= 10))
    );
    const isStrategicTlc = (totalBookedVolume >= 500000 && postVisitBookedLiftPct !== null && postVisitBookedLiftPct >= 65 && totalVisits >= 3 && yieldPerVisit >= 25000 && !isLapsed);

    // ── 6. Classification & Operational Decision Rules ──
    let relationshipDemand = 'insufficient_data';
    let patternType = 'unexplored';
    let confidenceScore = 0.35;
    let recommendedCadenceDays = null;

    // Emerging TLC: exactly 1 cycle with high lift AND at least 2 bookings AND not lapsed AND yield >= 25K
    const isEmergingTlc = (spikeAndDecayCycleCount === 1 && visitClusters.length <= 2 && totalBookings >= 2 && totalBookings <= 4 && postVisitBookedLiftPct !== null && postVisitBookedLiftPct >= 65 && yieldPerVisit >= 25000 && !isLapsed);

    // A dealer is DOMINATED by organic production if >=50% of volume is organic or postVisitLift < 50%
    const isOrganicDominated = (organicBookedRatio !== null && organicBookedRatio >= 50) || (postVisitBookedLiftPct !== null && postVisitBookedLiftPct < 50);

    // If an account was unvisited for > 120 days and generated >= $100K (or >= 3 bookings) unvisited, they proved autonomy
    const hasDemonstratedAutonomy = (daysSinceLastVisit !== null && daysSinceLastVisit > 120 && totalBookedVolume >= 100000 && (organicBookedRatio === null || organicBookedRatio >= 35) && !isLapsed);

    if (totalVisits < 2 && totalApplications < 5 && totalBookedVolume < 100000) {
        // Discovery Queue / Insufficient Data (Black & White)
        relationshipDemand = 'insufficient_data';
        patternType = 'unexplored';
        confidenceScore = 0.40;
        recommendedCadenceDays = null;
    } else if (
        (totalVisits >= 3 && totalBookings === 0) ||
        (totalVisits >= 5 && totalBookings <= 1 && totalBookedVolume < 50000) ||
        (totalVisits >= 10 && totalBookings <= 2 && totalBookedVolume < 150000) ||
        (isOverVisitedSink) ||
        (isUnderwritingFriction && yieldPerVisit < 35000)
    ) {
        // Comfort Stop / Empty Friction ($0 or trivial booked volume over 3+ visits, or UW bottleneck)
        relationshipDemand = 'comfort_stop';
        patternType = isUnderwritingFriction ? 'underwriting_friction' : 'empty_friction';
        confidenceScore = Math.min(0.98, 0.75 + (totalVisits * 0.04));
        recommendedCadenceDays = null; // Do not recommend field road trips
    } else if (isLapsed && (totalBookings >= 2 || totalBookedVolume >= 50000)) {
        // Lapsed / Churned Account: Previously productive, but dark for 180+ days
        relationshipDemand = 'self_sufficient';
        patternType = 'lapsed_churn';
        confidenceScore = 0.85;
        recommendedCadenceDays = null; // Exclude from active weekly routes
    } else if (isOrganicDominated && (totalBookings >= 2 || totalBookedVolume >= 75000 || totalApplications >= 8)) {
        // SELF-SUFFICIENT: Active organic production
        relationshipDemand = 'self_sufficient';
        patternType = isCatalyticActivation ? 'catalytic_activation' : 'autonomous_locomotive';
        confidenceScore = Math.min(0.98, 0.75 + Math.min(0.20, totalBookings * 0.01));
        recommendedCadenceDays = 90; // Quarterly digital/phone check-in
    } else if (hasDemonstratedAutonomy) {
        // SELF-SUFFICIENT: Dealer sustained production across 120+ unvisited days
        relationshipDemand = 'self_sufficient';
        patternType = 'autonomous_locomotive';
        confidenceScore = Math.min(0.98, 0.75 + Math.min(0.20, totalBookings * 0.01));
        recommendedCadenceDays = 90;
    } else if (
        !isLapsed &&
        ((totalVisits >= 2 && totalBookings >= 3 && postVisitBookedLiftPct !== null && postVisitBookedLiftPct >= 65 && yieldPerVisit >= 20000) ||
        (spikeAndDecayCycleCount >= 2 && totalBookings >= 2 && postVisitBookedLiftPct !== null && postVisitBookedLiftPct >= 60 && yieldPerVisit >= 20000) ||
        (isStrategicTlc) ||
        (totalVisits >= 4 && totalBookings >= 4 && organicBookedRatio <= 35 && yieldPerVisit >= 20000))
    ) {
        // Confirmed High TLC (Multi-cycle touch dependency and viable economics)
        relationshipDemand = 'high_tlc';
        patternType = isStrategicTlc ? 'strategic_tlc' : (isFadingTlc ? 'fading_tlc' : 'spike_and_decay');
        confidenceScore = Math.min(0.98, 0.65 + (Math.min(3, totalVisits) * 0.08) + Math.min(0.15, totalBookings * 0.02));
        recommendedCadenceDays = 35; // Strict 30-45 day in-person route cadence
    } else if (isEmergingTlc) {
        // Emerging High TLC
        relationshipDemand = 'high_tlc';
        patternType = 'spike_and_decay';
        confidenceScore = 0.70;
        recommendedCadenceDays = 30;
    } else if (totalBookings >= 2 || totalBookedVolume >= 75000 || totalApplications >= 8) {
        // Self-Sufficient baseline
        relationshipDemand = 'self_sufficient';
        patternType = 'autonomous_locomotive';
        confidenceScore = 0.65;
        recommendedCadenceDays = 90;
    } else {
        relationshipDemand = 'insufficient_data';
        patternType = 'unexplored';
        confidenceScore = 0.50;
        recommendedCadenceDays = null;
    }

    // Urgency Calculation
    const urgencyStatus = (isDormant || isLapsed)
        ? 'dormant'
        : calculateUrgency(daysSinceLastVisit, recommendedCadenceDays, relationshipDemand);

    // ── 7. Generate Plain-English Decision Rationale with When-and-Why Traceability ──
    const decisionRationale = [];
    const pctLiftStr = postVisitBookedLiftPct !== null ? `${postVisitBookedLiftPct}%` : '0%';
    const bookedVolStr = totalBookedVolume >= 1000000
        ? `$${(totalBookedVolume / 1000000).toFixed(2)}M`
        : `$${(totalBookedVolume / 1000).toFixed(0)}K`;

    const lastAppStr = lastAppDate ? lastAppDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Never';

    if (patternType === 'lapsed_churn') {
        decisionRationale.push(`Classified as Lapsed / Churned Account (Confidence ${Math.round(confidenceScore * 100)}%).`);
        decisionRationale.push(`⚠️ Churned / Inactive: Zero application submissions in over ${daysSinceLastApp} days (last active: ${lastAppStr}).`);
        decisionRationale.push(`Historical Performance: Generated ${bookedVolStr} across ${totalBookings} deals prior to going silent.`);
        decisionRationale.push(`Recommendation: Exclude from active weekly sales routes. Queue for Marketing Win-Back / Reactivation Campaign.`);
    } else if (relationshipDemand === 'high_tlc') {
        if (isStrategicTlc) {
            decisionRationale.push(`Classified as Strategic High TLC (Confidence ${Math.round(confidenceScore * 100)}%).`);
            decisionRationale.push(`High-Volume Enterprise Account: ${bookedVolStr} in funded volume across ${totalBookings} deals with ${pctLiftStr} generated directly inside visit windows.`);
            decisionRationale.push(`Why this rule applied: High revenue magnitude justifies proactive regular field maintenance to protect core production.`);
            decisionRationale.push(`Recommendation: Maintain continuous 30–45 day executive relationship touch.`);
        } else if (isEmergingTlc) {
            decisionRationale.push(`Classified as Emerging High TLC (Confidence ${Math.round(confidenceScore * 100)}%).`);
            decisionRationale.push(`1 verified Spike & Decay cycle observed: In-person visit generated ${bookedVolStr} in funded loans.`);
            decisionRationale.push(`Why this rule applied: Single high-yield response following road visit indicates strong touch sensitivity.`);
            decisionRationale.push(`Recommendation: Schedule a proactive confirmation visit within 30 days.`);
        } else {
            decisionRationale.push(`Classified as High TLC / Visit-Dependent (Confidence ${Math.round(confidenceScore * 100)}%).`);
            decisionRationale.push(`${pctLiftStr} of all lifetime funded loan volume (${bookedVolStr} across ${totalBookings} booked deal${totalBookings > 1 ? 's' : ''}) occurred exclusively within active in-person visit envelopes.`);
            decisionRationale.push(`Funded loan production flatlines to zero during unvisited gaps.`);
            if (spikeAndDecayCycleCount >= 2) {
                decisionRationale.push(`Why this rule applied: ${spikeAndDecayCycleCount} independent Spike & Decay cycles verified across interaction history.`);
            } else {
                decisionRationale.push(`Why this rule applied: High concentration of loan volume (${pctLiftStr} lift) tied directly to sales rep road visits.`);
            }
            decisionRationale.push(`Recommendation: Enforce strict 30–45 day in-person route cadence. Currently ${daysSinceLastVisit !== null ? `${daysSinceLastVisit} days unvisited` : 'unvisited'}.`);
        }
        if (isFadingTlc) {
            decisionRationale.push(`⚠️ Flag: Fading TLC detected — dollar yield per visit dropped >40% over sequential cycles. Investigate F&I manager turnover or competitor pressure.`);
        }
    } else if (relationshipDemand === 'comfort_stop') {
        if (isUnderwritingFriction) {
            decisionRationale.push(`Classified as Underwriting / Credit Box Review (Confidence ${Math.round(confidenceScore * 100)}%).`);
            decisionRationale.push(`Field rep logged ${totalVisits} in-person visits and successfully generated ${totalApplications} application submissions.`);
            decisionRationale.push(`Why this rule applied: ${totalApplications} apps submitted but only ${totalBookings} booked (${bookedVolStr} volume) due to low conversion (${approvalRatePct}% approved). Rep is driving dealership adoption, but applicant credit tier requires lender review.`);
            decisionRationale.push(`Recommendation: Do not penalize sales rep. Coordinate with Underwriting / Lender Management to review credit tier guidelines.`);
        } else {
            decisionRationale.push(`Classified as Comfort Stop / Time Sink (Confidence ${Math.round(confidenceScore * 100)}%).`);
            decisionRationale.push(`Field reps have conducted ${totalVisits} in-person visits across multiple quarters, resulting in ${totalBookings > 0 ? `only ${bookedVolStr} across ${totalBookings} deal` : '$0 in lifetime booked loan volume'}.`);
            decisionRationale.push(`Why this rule applied: Extremely low yield (${totalBookedVolume > 0 ? `$${Math.round(totalBookedVolume / totalVisits / 1000)}K/visit` : '$0/visit'}) across ${totalVisits} visits.`);
            decisionRationale.push(`Recommendation: Freeze field driving visits immediately. Reallocate travel hours to overdue High TLC accounts.`);
        }
    } else if (relationshipDemand === 'self_sufficient') {
        decisionRationale.push(`Classified as Self-Sufficient / Autonomous (Confidence ${Math.round(confidenceScore * 100)}%).`);
        decisionRationale.push(`Rooftop generates steady, high-volume funded loans organically (${bookedVolStr} across ${totalBookings} deals) with only ${totalVisits} lifetime visit${totalVisits > 1 ? 's' : ''}.`);
        decisionRationale.push(`${organicBookedRatio}% of funded loan volume occurred without a recent sales visit.`);
        decisionRationale.push(`Why this rule applied: High organic baseline proves dealer utilizes portal independently.`);
        decisionRationale.push(`Recommendation: Deprioritize in-person road trips. Maintain via quarterly digital/phone check-in.`);
        if (isCatalyticActivation && !isLapsed) {
            decisionRationale.push(`🚀 Catalytic Activation: A single onboarding visit unlocked permanent, sustained organic flow.`);
        }
    } else {
        decisionRationale.push(`Classified as Discovery Queue / Insufficient Data.`);
        decisionRationale.push(`Rooftop has received ${totalVisits} in-person visit${totalVisits > 1 ? 's' : ''} and submitted ${totalApplications} application${totalApplications > 1 ? 's' : ''}.`);
        decisionRationale.push(`Why this rule applied: Inconclusive interaction history (<2 visits and <5 apps).`);
        decisionRationale.push(`Recommendation: Schedule an exploratory baseline visit to assess dealership loan potential.`);
    }

    if (urgencyStatus === 'dormant' && patternType !== 'lapsed_churn') {
        decisionRationale.push(`💤 Inactive / Dormant Status: Unvisited for ${daysSinceLastVisit} days (last visit was ${lastVisitDate ? lastVisitDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}).`);
        decisionRationale.push(`Why this rule applied: Unvisited for over a year (>365 days). Excluded from active weekly sales rep route alerts and marked for a Dormant Reactivation campaign.`);
    }

    // ── CRM Notes Intelligence (Personnel Turnover & Competitor Friction) ──
    let turnoverAlert = null;
    let competitorAlert = null;

    for (const comm of comms) {
        if (!comm.communicationEventDatetime) continue;
        const dt = new Date(comm.communicationEventDatetime);
        const daysAgo = Math.floor((nowMs - dt.getTime()) / DAY_MS);
        const res = (comm.communicationResult1 || '').toLowerCase();
        const feed = (comm.communicationFeedback1 || '').toLowerCase();

        // Check for F&I / Management Turnover (Last 180 Days)
        if (!turnoverAlert && daysAgo <= 180) {
            if (feed.includes('new f&i') || feed.includes('new finance') || feed.includes('new manager') || feed.includes('manager left') || feed.includes('f&i left') || feed.includes('turnover') || feed.includes('no longer with') || feed.includes('new director')) {
                turnoverAlert = {
                    date: dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                };
            }
        }

        // Check for Competitor Friction (Last 120 Days)
        if (!competitorAlert && daysAgo <= 120) {
            if (res.includes('lost to competitor') || feed.includes('lost to competitor') || feed.includes('competitor rate') || feed.includes('cheaper rate') || feed.includes('ally') || feed.includes('huntington') || feed.includes('us bank')) {
                competitorAlert = {
                    date: dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                };
            }
        }
    }

    if (turnoverAlert) {
        decisionRationale.push(`⚠️ Personnel Alert: Rep CRM notes report F&I / Management turnover on ${turnoverAlert.date}. Volume trajectory may reflect onboarding new staff.`);
    }
    if (competitorAlert) {
        decisionRationale.push(`⚔️ Competitor Friction: Field rep logged deals lost to competitor rate sheets on ${competitorAlert.date}.`);
    }

    // ── 8. Generate Pre-Aggregated Monthly Timeline (2024-2026) ──
    const monthlyMap = new Map();
    const startYear = 2024;
    const endYear = referenceDate.getFullYear();
    const endMonth = referenceDate.getMonth();

    for (let y = startYear; y <= endYear; y++) {
        const maxM = (y === endYear) ? endMonth : 11;
        for (let m = 0; m <= maxM; m++) {
            const mKey = `${y}-${String(m + 1).padStart(2, '0')}`;
            monthlyMap.set(mKey, {
                monthKey: mKey,
                bookedVolume: 0,
                bookedCount: 0,
                appCount: 0,
                visitCount: 0,
                callCount: 0
            });
        }
    }

    for (const app of validApps) {
        const y = app.appDate.getFullYear();
        const m = app.appDate.getMonth();
        const mKey = `${y}-${String(m + 1).padStart(2, '0')}`;
        if (monthlyMap.has(mKey)) {
            const entry = monthlyMap.get(mKey);
            entry.appCount++;
            if (app.isBooked) {
                entry.bookedCount++;
                entry.bookedVolume += app.amount;
            }
        }
    }

    for (const v of rawVisits) {
        const y = v.date.getFullYear();
        const m = v.date.getMonth();
        const mKey = `${y}-${String(m + 1).padStart(2, '0')}`;
        if (monthlyMap.has(mKey)) {
            monthlyMap.get(mKey).visitCount++;
        }
    }

    for (const c of rawCalls) {
        const y = c.date.getFullYear();
        const m = c.date.getMonth();
        const mKey = `${y}-${String(m + 1).padStart(2, '0')}`;
        if (monthlyMap.has(mKey)) {
            monthlyMap.get(mKey).callCount++;
        }
    }

    const timelineMonthly = Array.from(monthlyMap.values());

    return {
        dealerLocation: dealerLoc._id,
        clientDealerId,
        dealerName: dealerLoc.dealerName || 'Unknown Dealer',
        statePrefix: dealerLoc.statePrefix || null,
        dealerGroup: dealerLoc.dealerGroup || null,
        assignedRep,
        relationshipDemand,
        patternType,
        confidenceScore: Math.round(confidenceScore * 100) / 100,
        recommendedCadenceDays,
        flags: {
            isFadingTlc,
            isEmergingTlc,
            isCatalyticActivation,
            isStrategicTlc,
            isUnderwritingFriction,
            isDormant
        },
        pipelineStats,
        daysSinceLastVisit,
        lastVisitDate,
        daysSinceLastTouch,
        lastTouchDate,
        lastTouchType,
        urgencyStatus,
        postVisitBookedLiftPct,
        organicBookedRatio,
        lifetimeYieldPerVisit,
        verifiedCycleCount,
        lifetimeStats: {
            totalVisits,
            totalCalls,
            totalEmails,
            totalTouchpoints,
            totalApplications,
            totalBookings,
            totalBookedVolume
        },
        decisionRationale,
        interactionCycles,
        timelineMonthly,
        lastCalculatedAt: new Date()
    };
}

/**
 * Recompute and bulk upsert DealerProfile documents for all active dealer locations.
 * 
 * @param {Object} [options]
 * @param {Date} [options.referenceDate=new Date()]
 * @param {Date} [options.startDate=new Date('2025-01-01T00:00:00.000Z')] - Operational baseline start date (Jan 1, 2025)
 * @param {string[]} [options.dealerIds=null] - Optional filter for specific clientDealerIds
 * @returns {Promise<Object>} Execution summary with counts per DRD segment
 */
async function recomputeAllProfiles({ referenceDate = new Date(), startDate = new Date('2025-01-01T00:00:00.000Z'), dealerIds = null } = {}) {
    const startTime = Date.now();
    console.log(`\n=== RECOMPUTING DEALER RELATIONSHIP PROFILES (v6.2 Engine - 2025+ Baseline) ===`);

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

    console.log(`Loaded ${dealers.length} dealer location(s). Indexing 2025+ applications and comms...`);

    // 2. Pre-fetch and index Applications from Jan 1, 2025 onward by clientDealerId
    const appQuery = { applicationDate: { $gte: startDate } };
    if (dealerIds && dealerIds.length > 0) {
        appQuery.clientDealerId = { $in: dealerIds.map(d => d.toUpperCase()) };
    }

    const apps = await Application.find(appQuery, {
        clientDealerId: 1,
        applicationDate: 1,
        bookedDate: 1,
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

    // 3. Pre-fetch and index Communications from Jan 1, 2025 onward by internalRelationshipId2 (clientDealerId)
    const commQuery = { communicationEventDatetime: { $gte: startDate } };
    if (dealerIds && dealerIds.length > 0) {
        commQuery.internalRelationshipId2 = { $in: dealerIds.map(d => d.toUpperCase()) };
    }

    const comms = await DealerCommunication.find(commQuery, {
        internalRelationshipId2: 1,
        communicationEventDatetime: 1,
        communicationType: 1,
        communicationResult1: 1,
        communicationFeedback1: 1,
        communicationUserFullName: 1
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

    // 3b. Pre-load any existing manual overrides to preserve human reconciliation decisions
    const existingProfiles = await DealerProfile.find(
        { 'manualOverride.isOverridden': true },
        { dealerLocation: 1, clientDealerId: 1, manualOverride: 1 }
    ).lean();

    const overrideMap = new Map();
    for (const ep of existingProfiles) {
        if (ep.dealerLocation) {
            overrideMap.set(ep.dealerLocation.toString(), ep.manualOverride);
        }
        if (ep.clientDealerId) {
            overrideMap.set(ep.clientDealerId.trim().toUpperCase(), ep.manualOverride);
        }
    }
    if (existingProfiles.length > 0) {
        console.log(`Preserving ${existingProfiles.length} human-reconciled manual override(s)...`);
    }

    // 4. Evaluate each dealer profile in-memory
    const bulkOps = [];
    const segmentCounts = {
        high_tlc: 0,
        self_sufficient: 0,
        comfort_stop: 0,
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

        // Check if there is an active manual override for this dealer
        const override = overrideMap.get(dealer._id.toString()) || overrideMap.get(key);
        if (override && override.isOverridden && override.overriddenSegment) {
            profileData.manualOverride = override;
            const originalSystemSegment = profileData.relationshipDemand;
            profileData.manualOverride.originalSegment = originalSystemSegment;
            profileData.relationshipDemand = override.overriddenSegment;
            profileData.decisionRationale = profileData.decisionRationale || [];
            profileData.decisionRationale.unshift(
                `🔒 MANUALLY RECONCILED: Classification overridden to "${override.overriddenSegment.replace(/_/g, ' ').toUpperCase()}" by ${override.overriddenBy?.name || override.overriddenBy?.email || 'User'}${override.reason ? ` — "${override.reason}"` : ''}`
            );
        }

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
    console.log(`    🟠 Comfort Stop (Time Sink)   : ${segmentCounts.comfort_stop.toLocaleString()} (${(segmentCounts.comfort_stop / dealers.length * 100).toFixed(1)}%)`);
    console.log(`    ⚪ Discovery Queue (Low Data) : ${segmentCounts.insufficient_data.toLocaleString()} (${(segmentCounts.insufficient_data / dealers.length * 100).toFixed(1)}%)`);
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
    classifyCommType,
    clusterVisits,
    calculateUrgency,
    evaluateDealerProfile,
    recomputeAllProfiles
};
