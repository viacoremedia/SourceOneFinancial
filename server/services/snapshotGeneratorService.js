
/**
 * Snapshot Generator Service
 * 
 * Computes DailyDealerSnapshot documents from raw Application and DealerCommunication
 * collections. Replaces the legacy Caleb CSV daily export pipeline.
 * 
 * Computes for each dealer:
 * - lastApplicationDate, daysSinceLastApplication
 * - lastApprovalDate, daysSinceLastApproval
 * - lastBookedDate, daysSinceLastBooking
 * - activityStatus ('active', '30d_inactive', '60d_inactive', 'long_inactive', 'never_active')
 * - latestCommunicationDatetime
 * - reactivatedAfterVisit, daysFromVisitToNextApp
 * 
 * @module services/snapshotGeneratorService
 */

const mongoose = require('mongoose');
const DailyDealerSnapshot = require('../models/DailyDealerSnapshot');
const DealerLocation = require('../models/DealerLocation');
const Application = require('../models/Application');
const DealerCommunication = require('../models/DealerCommunication');
const MonthlyDealerRollup = require('../models/MonthlyDealerRollup');
const { rebuildRollupsForRange } = require('./rollupService');
const { clearLatestDateCache } = require('../utils/dateUtils');

// Concurrency guard to prevent concurrent rebuild runs
let isRebuildingSnapshots = false;

/**
 * Format a Date object to YYYY-MM-DD string in UTC
 */
function toDateKey(date) {
    if (!date) return null;
    const d = new Date(date);
    return d.toISOString().split('T')[0];
}

/**
 * Binary search to find the latest date in a sorted date array that is <= targetDate
 */
function findLatestDateOnOrBefore(sortedDates, targetDate) {
    if (!sortedDates || sortedDates.length === 0) return null;
    const targetMs = targetDate.getTime();

    let low = 0;
    let high = sortedDates.length - 1;
    let best = null;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const midMs = sortedDates[mid].getTime();

        if (midMs <= targetMs) {
            best = sortedDates[mid];
            low = mid + 1; // Try to find a later date still <= target
        } else {
            high = mid - 1;
        }
    }
    return best;
}

/**
 * Find the prior application date (the second latest date <= targetDate)
 */
function findPriorDateOnOrBefore(sortedDates, targetDate) {
    if (!sortedDates || sortedDates.length < 2) return null;
    const targetMs = targetDate.getTime();

    let low = 0;
    let high = sortedDates.length - 1;
    let bestIdx = -1;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const midMs = sortedDates[mid].getTime();

        if (midMs <= targetMs) {
            bestIdx = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    if (bestIdx > 0) {
        return sortedDates[bestIdx - 1];
    }
    return null;
}

/**
 * Compute activity status string from daysSinceLastApp
 */
function computeActivityStatus(daysSinceLastApp) {
    if (daysSinceLastApp === null || daysSinceLastApp === undefined) {
        return 'never_active';
    }
    if (daysSinceLastApp <= 30) return 'active';
    if (daysSinceLastApp <= 60) return '30d_inactive';
    if (daysSinceLastApp <= 90) return '60d_inactive';
    if (daysSinceLastApp <= 120) return '90d_inactive';
    return 'long_inactive';
}

/**
 * Generate DailyDealerSnapshot documents for a range of dates.
 * Defaults to generating from 2025-01-01 to today.
 * 
 * @param {Object} options
 * @param {string|Date} [options.fromDate='2025-01-01'] - Start date (YYYY-MM-DD)
 * @param {string|Date} [options.toDate] - End date (defaults to today)
 * @param {string[]} [options.dealerIds] - Optional array of specific dealer IDs to target
 * @returns {Promise<{ totalSnapshots: number, daysProcessed: number, durationMs: number }>}
 */
async function generateSnapshotsForRange({ fromDate = '2025-01-01', toDate = new Date(), dealerIds = null } = {}) {
    const startTime = Date.now();
    const startD = new Date(fromDate);
    startD.setUTCHours(0, 0, 0, 0);

    const endD = new Date(toDate);
    endD.setUTCHours(0, 0, 0, 0);

    console.log(`\n=== SNAPSHOT GENERATION SERVICE ===`);
    console.log(`Date Range: ${startD.toISOString().split('T')[0]} to ${endD.toISOString().split('T')[0]}`);

    // 1. Load DealerLocation documents (only those enriched by dealer info CSV)
    //    Excludes ghost/skeleton records that lack omniDealerId
    const dealerQuery = { omniDealerId: { $exists: true, $ne: null } };
    if (dealerIds && dealerIds.length > 0) {
        dealerQuery.dealerId = { $in: dealerIds };
    }

    const dealers = await DealerLocation.find(dealerQuery, {
        _id: 1,
        dealerId: 1,
        clientDealerId: 1,
        dealerGroup: 1,
        dealerName: 1
    }).lean();

    console.log(`Loaded ${dealers.length} dealer location(s) from MongoDB.`);

    // Map by clientDealerId (or fallback dealerId)
    const dealerMap = new Map();
    for (const d of dealers) {
        const key = (d.clientDealerId || d.dealerId).trim().toUpperCase();
        dealerMap.set(key, d);
    }

    // 2. Pre-fetch Application dates for all dealers into memory
    console.log(`Fetching application timeline from database...`);
    const appProjection = {
        clientDealerId: 1,
        applicationDate: 1,
        approvalDate: 1,
        bookedDate: 1,
        wasApproved: 1,
        status: 1
    };

    const rawApps = await Application.find(
        { applicationDate: { $ne: null } },
        appProjection
    ).lean();

    console.log(`Loaded ${rawApps.length} raw application record(s). Indexing by dealer...`);

    // Per-dealer sorted date arrays
    const dealerAppTimeline = new Map(); // dealerKey -> { apps: Date[], approvals: Date[], bookings: Date[] }

    for (const app of rawApps) {
        if (!app.clientDealerId) continue;
        const key = app.clientDealerId.trim().toUpperCase();

        if (!dealerAppTimeline.has(key)) {
            dealerAppTimeline.set(key, { apps: [], approvals: [], bookings: [] });
        }
        const timeline = dealerAppTimeline.get(key);

        if (app.applicationDate) timeline.apps.push(new Date(app.applicationDate));
        if (app.wasApproved && app.approvalDate) timeline.approvals.push(new Date(app.approvalDate));
        if (app.status === 'Booked' && (app.bookedDate || app.applicationDate)) {
            timeline.bookings.push(new Date(app.bookedDate || app.applicationDate));
        }
    }

    // Sort all date arrays chronologically
    for (const timeline of dealerAppTimeline.values()) {
        timeline.apps.sort((a, b) => a.getTime() - b.getTime());
        timeline.approvals.sort((a, b) => a.getTime() - b.getTime());
        timeline.bookings.sort((a, b) => a.getTime() - b.getTime());
    }

    // 3. Pre-fetch Communication dates for all dealers into memory
    console.log(`Fetching sales communication timeline from database...`);
    const rawComms = await DealerCommunication.find(
        { communicationEventDatetime: { $ne: null } },
        { internalRelationshipId2: 1, communicationEventDatetime: 1 }
    ).lean();

    console.log(`Loaded ${rawComms.length} communication record(s). Indexing by dealer...`);

    const dealerCommTimeline = new Map(); // dealerKey -> Date[]
    for (const comm of rawComms) {
        const key = (comm.internalRelationshipId2 || '').trim().toUpperCase();
        if (!key) continue;

        if (!dealerCommTimeline.has(key)) {
            dealerCommTimeline.set(key, []);
        }
        dealerCommTimeline.get(key).push(new Date(comm.communicationEventDatetime));
    }

    for (const dates of dealerCommTimeline.values()) {
        dates.sort((a, b) => a.getTime() - b.getTime());
    }

    // 4. Generate daily dates array
    const dateList = [];
    const curr = new Date(startD);
    while (curr <= endD) {
        dateList.push(new Date(curr));
        curr.setUTCDate(curr.getUTCDate() + 1);
    }

    console.log(`Generating snapshots across ${dateList.length} date(s) for ${dealers.length} dealer(s)...`);

    // 5. Generate snapshots and bulkWrite in parallel batches
    let totalSnapshots = 0;
    const BATCH_SIZE = 3500;
    const CONCURRENCY = 4;
    let pendingBatches = [];
    let currentBatch = [];
    let dateIdx = 0;

    async function flushBatches() {
        if (pendingBatches.length === 0) return;
        const toRun = pendingBatches.splice(0, pendingBatches.length);
        const results = await Promise.all(
            toRun.map(batch => DailyDealerSnapshot.bulkWrite(batch, { ordered: false }))
        );
        for (const res of results) {
            totalSnapshots += (res.upsertedCount || 0) + (res.modifiedCount || 0);
        }
    }

    for (const reportDate of dateList) {
        dateIdx++;
        if (dateIdx % 10 === 0 || dateIdx === dateList.length) {
            const elapsedSec = (Date.now() - startTime) / 1000;
            const datesPerSec = (dateIdx / elapsedSec).toFixed(2);
            const remainingDates = dateList.length - dateIdx;
            const etaSec = remainingDates / (dateIdx / elapsedSec);
            console.log(`[Progress] Date ${dateIdx}/${dateList.length} (${toDateKey(reportDate)}) | Rate: ${datesPerSec} days/sec | ETA: ${(etaSec / 60).toFixed(1)} mins`);
        }
        const reportMs = reportDate.getTime();

        for (const dealer of dealers) {
            const key = (dealer.clientDealerId || dealer.dealerId).trim().toUpperCase();
            const appTimeline = dealerAppTimeline.get(key) || { apps: [], approvals: [], bookings: [] };
            const commDates = dealerCommTimeline.get(key) || [];

            // Application metrics
            const lastAppDate = findLatestDateOnOrBefore(appTimeline.apps, reportDate);
            const priorAppDate = findPriorDateOnOrBefore(appTimeline.apps, reportDate);

            let daysSinceLastApp = null;
            if (lastAppDate) {
                daysSinceLastApp = Math.floor((reportMs - lastAppDate.getTime()) / (1000 * 60 * 60 * 24));
                if (daysSinceLastApp < 0) daysSinceLastApp = 0;
            }

            // Approval metrics
            const lastApprDate = findLatestDateOnOrBefore(appTimeline.approvals, reportDate);
            let daysSinceLastAppr = null;
            if (lastApprDate) {
                daysSinceLastAppr = Math.floor((reportMs - lastApprDate.getTime()) / (1000 * 60 * 60 * 24));
                if (daysSinceLastAppr < 0) daysSinceLastAppr = 0;
            }

            // Booking metrics
            const lastBookDate = findLatestDateOnOrBefore(appTimeline.bookings, reportDate);
            let daysSinceLastBook = null;
            if (lastBookDate) {
                daysSinceLastBook = Math.floor((reportMs - lastBookDate.getTime()) / (1000 * 60 * 60 * 24));
                if (daysSinceLastBook < 0) daysSinceLastBook = 0;
            }

            // Status
            const activityStatus = computeActivityStatus(daysSinceLastApp);

            // Communication metrics
            const latestCommDate = findLatestDateOnOrBefore(commDates, reportDate);

            // Visit impact metrics (reactivated after visit)
            let reactivatedAfterVisit = false;
            let daysFromVisitToNextApp = null;

            if (latestCommDate && lastAppDate && lastAppDate.getTime() >= latestCommDate.getTime()) {
                const diffMs = lastAppDate.getTime() - latestCommDate.getTime();
                const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

                // If visit occurred within 90 days prior to application
                if (diffDays <= 90) {
                    daysFromVisitToNextApp = diffDays;
                    // Check if dealer had been inactive prior to this application
                    if (priorAppDate) {
                        const gapBetweenApps = Math.floor((lastAppDate.getTime() - priorAppDate.getTime()) / (1000 * 60 * 60 * 24));
                        if (gapBetweenApps >= 30) {
                            reactivatedAfterVisit = true;
                        }
                    } else {
                        // First application after visit
                        reactivatedAfterVisit = true;
                    }
                }
            }

            const snapshotDoc = {
                dealerLocation: dealer._id,
                dealerGroup: dealer.dealerGroup || null,
                reportDate,
                lastApplicationDate: lastAppDate,
                priorApplicationDate: priorAppDate,
                daysSinceLastApplication: daysSinceLastApp,
                lastApprovalDate: lastApprDate,
                daysSinceLastApproval: daysSinceLastAppr,
                lastBookedDate: lastBookDate,
                daysSinceLastBooking: daysSinceLastBook,
                activityStatus,
                latestCommunicationDatetime: latestCommDate,
                reactivatedAfterVisit,
                daysFromVisitToNextApp
            };

            currentBatch.push({
                updateOne: {
                    filter: { dealerLocation: dealer._id, reportDate },
                    update: { $set: snapshotDoc },
                    upsert: true
                }
            });

            if (currentBatch.length >= BATCH_SIZE) {
                pendingBatches.push(currentBatch);
                currentBatch = [];
                if (pendingBatches.length >= CONCURRENCY) {
                    await flushBatches();
                }
            }
        }
    }

    if (currentBatch.length > 0) {
        pendingBatches.push(currentBatch);
    }
    await flushBatches();

    const durationMs = Date.now() - startTime;
    console.log(`\n✓ SNAPSHOT GENERATION COMPLETE`);
    console.log(`  Snapshots Upserted/Updated : ${totalSnapshots.toLocaleString()}`);
    console.log(`  Days Processed              : ${dateList.length}`);
    console.log(`  Dealers Covered             : ${dealers.length}`);
    console.log(`  Time Elapsed                : ${(durationMs / 1000).toFixed(2)}s`);

    return { totalSnapshots, daysProcessed: dateList.length, durationMs };
}

/**
 * High-level orchestration function to rebuild recent snapshots and rollups.
 * Typically triggered automatically upon ingestion of a new main_application CSV,
 * or manually via POST /webhook/rebuild or CLI.
 * 
 * Anchors to the latest application date or today, and computes backwards
 * to cover the requested number of calendar months (defaults to 3 months).
 * 
 * @param {Object} options
 * @param {number} [options.monthsBack=3] - Number of months back to cover
 * @param {Date|string} [options.fromDate] - Explicit start date override
 * @param {Date|string} [options.toDate] - Explicit end date override
 * @param {string} [options.webhookPayloadId] - Source payload ObjectId for traceability
 * @returns {Promise<{
 *   success: boolean,
 *   skipped?: boolean,
 *   reason?: string,
 *   fromDate: string,
 *   toDate: string,
 *   snapshots: Object,
 *   rollups: Object,
 *   totalDurationMs: number
 * }>}
 */
async function rebuildRecentSnapshots({ monthsBack = 3, fromDate = null, toDate = null, webhookPayloadId = null } = {}) {
    if (isRebuildingSnapshots) {
        console.warn('⚠️ [SnapshotService] Snapshot rebuild already in progress — skipping duplicate concurrent invocation.');
        return { success: false, skipped: true, reason: 'Rebuild already in progress' };
    }

    isRebuildingSnapshots = true;
    const overallStartTime = Date.now();

    try {
        // Resolve toDate: use provided, or latest application date in DB, or today
        let targetEnd = toDate ? new Date(toDate) : null;
        if (!targetEnd) {
            const latestApp = await Application.findOne({ applicationDate: { $ne: null } })
                .sort({ applicationDate: -1 })
                .select('applicationDate')
                .lean();
            targetEnd = latestApp && latestApp.applicationDate ? new Date(latestApp.applicationDate) : new Date();
        }
        targetEnd.setUTCHours(0, 0, 0, 0);

        // Resolve fromDate: use provided, or go back to the 1st of the month `monthsBack` months ago
        let targetStart = fromDate ? new Date(fromDate) : null;
        if (!targetStart) {
            targetStart = new Date(Date.UTC(
                targetEnd.getUTCFullYear(),
                targetEnd.getUTCMonth() - monthsBack,
                1
            ));
        }
        targetStart.setUTCHours(0, 0, 0, 0);

        console.log(`\n================================================================`);
        console.log(`  REBUILDING RECENT SNAPSHOTS & ROLLUPS`);
        console.log(`  Window: ${toDateKey(targetStart)} to ${toDateKey(targetEnd)} (${monthsBack} months back)`);
        console.log(`================================================================`);

        // Step 1: Rebuild DailyDealerSnapshots for the date range
        const snapResult = await generateSnapshotsForRange({
            fromDate: targetStart,
            toDate: targetEnd
        });

        // Step 2: Rebuild MonthlyDealerRollups for all months touched by this range
        const rollupResult = await rebuildRollupsForRange(targetStart, targetEnd);

        // Step 3: Clear date cache so all subsequent queries see the fresh data
        clearLatestDateCache();

        const totalDurationMs = Date.now() - overallStartTime;
        console.log(`\n================================================================`);
        console.log(`  ✓ AUTOMATED REBUILD FINISHED IN ${(totalDurationMs / 1000).toFixed(2)}s`);
        console.log(`  Snapshots Processed: ${snapResult.totalSnapshots.toLocaleString()}`);
        console.log(`  Rollups Rebuilt:     ${rollupResult.totalRebuilt.toLocaleString()}`);
        console.log(`================================================================\n`);

        return {
            success: true,
            fromDate: toDateKey(targetStart),
            toDate: toDateKey(targetEnd),
            snapshots: snapResult,
            rollups: rollupResult,
            totalDurationMs
        };

    } catch (err) {
        console.error(`❌ [SnapshotService] Rebuild failed after ${Date.now() - overallStartTime}ms:`, err.message);
        throw err;
    } finally {
        isRebuildingSnapshots = false;
    }
}

module.exports = {
    generateSnapshotsForRange,
    rebuildRecentSnapshots,
    computeActivityStatus
};
