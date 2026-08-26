/**
 * DRD DEEP AUDIT — Full Population Scan
 * 
 * Audits ALL dealers with a stored DealerProfile classification.
 * Applies expanded adversarial heuristics including:
 *   - Spec vs Code discrepancies (cluster window 14d spec vs 45d code)
 *   - Attribution date errors (appDate vs bookedDate)
 *   - Recency bias (lifetime attribution ignoring behavioral change)
 *   - Envelope coverage inflation
 *   - Decision tree ordering bugs
 *   - Edge cases in fallback logic
 * 
 * Run from server/: node scratch/drd_deep_audit.js
 */

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { evaluateDealerProfile } = require('../services/dealerRelationshipEngine');
const DealerProfile = require('../models/DealerProfile');
const DealerLocation = require('../models/DealerLocation');
const Application = require('../models/Application');
const DealerCommunication = require('../models/DealerCommunication');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Independently cluster visits using the SPEC's 14-day window (not the code's 45-day)
 * to compare what classification WOULD be under correct parameters.
 */
function clusterVisitsSpec(visits) {
    if (!visits || visits.length === 0) return [];
    const SPEC_GAP_DAYS = 14; // Per spec section 2.1
    const sorted = [...visits].sort((a, b) => a.getTime() - b.getTime());
    const clusters = [];
    let cluster = { start: sorted[0], end: sorted[0], count: 1 };

    for (let i = 1; i < sorted.length; i++) {
        const gap = Math.floor((sorted[i].getTime() - cluster.end.getTime()) / DAY_MS);
        if (gap < SPEC_GAP_DAYS) {
            cluster.end = sorted[i];
            cluster.count++;
        } else {
            clusters.push(cluster);
            cluster = { start: sorted[i], end: sorted[i], count: 1 };
        }
    }
    clusters.push(cluster);
    return clusters;
}

/**
 * Calculate envelope coverage: what % of the dealer's active timeline is covered by visit windows
 */
function calcEnvelopeCoverage(visitDates, firstAppDate, nowMs) {
    if (!visitDates || visitDates.length === 0) return 0;
    const POST_WINDOW = 45 * DAY_MS;
    const timelineStart = firstAppDate ? Math.min(firstAppDate.getTime(), visitDates[0].getTime()) : visitDates[0].getTime();
    const totalDays = (nowMs - timelineStart) / DAY_MS;
    if (totalDays <= 0) return 0;

    // Build raw envelopes
    const envelopes = visitDates.map(d => ({ start: d.getTime(), end: d.getTime() + POST_WINDOW }));
    // Merge overlapping
    envelopes.sort((a, b) => a.start - b.start);
    const merged = [envelopes[0]];
    for (let i = 1; i < envelopes.length; i++) {
        const last = merged[merged.length - 1];
        if (envelopes[i].start <= last.end) {
            last.end = Math.max(last.end, envelopes[i].end);
        } else {
            merged.push(envelopes[i]);
        }
    }

    const coveredDays = merged.reduce((sum, e) => sum + (Math.min(e.end, nowMs) - Math.max(e.start, timelineStart)) / DAY_MS, 0);
    return Math.min(1, coveredDays / totalDays);
}

/**
 * Check if recent behavior (last 12 months) contradicts lifetime classification
 */
function checkRecencyShift(apps, visitDates, nowMs) {
    const cutoff = nowMs - (365 * DAY_MS);
    
    const recentApps = apps.filter(a => a.applicationDate && new Date(a.applicationDate).getTime() > cutoff);
    const recentBooked = recentApps.filter(a => a.status === 'Booked');
    const recentBookedVol = recentBooked.reduce((s, a) => s + (Number(a.amountFinanced) || 0), 0);
    
    const recentVisits = visitDates.filter(d => d.getTime() > cutoff);
    
    const olderApps = apps.filter(a => a.applicationDate && new Date(a.applicationDate).getTime() <= cutoff);
    const olderBooked = olderApps.filter(a => a.status === 'Booked');
    const olderBookedVol = olderBooked.reduce((s, a) => s + (Number(a.amountFinanced) || 0), 0);
    
    return {
        recentApps: recentApps.length,
        recentBooked: recentBooked.length,
        recentBookedVol,
        recentVisits: recentVisits.length,
        olderApps: olderApps.length,
        olderBooked: olderBooked.length,
        olderBookedVol,
        totalApps: apps.length,
        recentPctOfVolume: (recentBookedVol + olderBookedVol) > 0 
            ? Math.round(recentBookedVol / (recentBookedVol + olderBookedVol) * 100) : 0
    };
}

/**
 * Attribution check: compare app-date-based lift vs booked-date-based lift
 */
function checkAttributionDates(apps, visitDates) {
    if (!visitDates || visitDates.length === 0) return null;
    
    const POST_WINDOW = 45 * DAY_MS;
    // Build merged envelopes
    const envelopes = visitDates.map(d => ({ start: d.getTime(), end: d.getTime() + POST_WINDOW }));
    envelopes.sort((a, b) => a.start - b.start);
    const merged = [envelopes[0]];
    for (let i = 1; i < envelopes.length; i++) {
        const last = merged[merged.length - 1];
        if (envelopes[i].start <= last.end) {
            last.end = Math.max(last.end, envelopes[i].end);
        } else {
            merged.push(envelopes[i]);
        }
    }
    
    let touchedByAppDate = 0, untouchedByAppDate = 0;
    let touchedByBookDate = 0, untouchedByBookDate = 0;
    let touchedVolByApp = 0, untouchedVolByApp = 0;
    let touchedVolByBook = 0, untouchedVolByBook = 0;
    
    for (const app of apps) {
        if (app.status !== 'Booked') continue;
        const amt = Number(app.amountFinanced) || 0;
        const appMs = new Date(app.applicationDate).getTime();
        const bookMs = app.bookedDate ? new Date(app.bookedDate).getTime() : appMs;
        
        const appInEnvelope = merged.some(e => appMs >= e.start && appMs <= e.end);
        const bookInEnvelope = merged.some(e => bookMs >= e.start && bookMs <= e.end);
        
        if (appInEnvelope) { touchedByAppDate++; touchedVolByApp += amt; }
        else { untouchedByAppDate++; untouchedVolByApp += amt; }
        
        if (bookInEnvelope) { touchedByBookDate++; touchedVolByBook += amt; }
        else { untouchedByBookDate++; untouchedVolByBook += amt; }
    }
    
    const totalVol = touchedVolByApp + untouchedVolByApp;
    const liftByApp = totalVol > 0 ? Math.round(touchedVolByApp / totalVol * 100) : null;
    const liftByBook = totalVol > 0 ? Math.round(touchedVolByBook / totalVol * 100) : null;
    
    return { liftByApp, liftByBook, diff: liftByApp !== null && liftByBook !== null ? Math.abs(liftByApp - liftByBook) : 0 };
}

async function runDeepAudit() {
    console.log('\n' + '═'.repeat(110));
    console.log('  DRD DEEP AUDIT — FULL POPULATION SCAN');
    console.log('  Testing ALL classified dealers for classification contradictions');
    console.log('═'.repeat(110) + '\n');

    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
    console.log('Connected to MongoDB.\n');

    const nowMs = Date.now();

    // Get counts per segment
    const segCounts = await DealerProfile.aggregate([
        { $group: { _id: '$relationshipDemand', count: { $sum: 1 } } }
    ]);
    console.log('  Population:');
    for (const s of segCounts) console.log(`    ${s._id}: ${s.count}`);
    console.log();

    // Load ALL profiles
    const allProfiles = await DealerProfile.find({
        relationshipDemand: { $in: ['high_tlc', 'comfort_stop', 'self_sufficient'] }
    }).lean();
    console.log(`  Loaded ${allProfiles.length} classified profiles. Processing...\n`);

    const issues = {
        // Flaw 1: Comfort Stop with high lift
        CS_HIGH_LIFT: [],
        CS_HIGH_YIELD: [],
        CS_HAS_PRODUCTION: [],
        // Flaw 2: Autonomous with high lift  
        SS_HIGH_LIFT: [],
        SS_SPIKE_DECAY: [],
        SS_LOW_ORGANIC: [],
        SS_THIN_EVIDENCE: [],
        // Flaw 3: Window inflation
        WINDOW_INFLATION: [],
        // NEW Flaw 4: Cluster window spec mismatch
        CLUSTER_WINDOW_MISMATCH: [],
        // NEW Flaw 5: Recency shift (behavior changed but classification doesn't reflect it)
        RECENCY_SHIFT_TLC: [],    // Was TLC historically, now autonomous
        RECENCY_SHIFT_SS: [],     // Was autonomous historically, now dependent
        // NEW Flaw 6: Attribution date discrepancy
        ATTRIBUTION_DATE_SKEW: [],
        // NEW Flaw 7: TLC issues
        TLC_LOW_LIFT: [],
        TLC_HIGH_ORGANIC: [],
        TLC_LOW_YIELD: [],
        TLC_THIN: [],
        // Stale data
        STORED_MISMATCH: [],
    };

    let processed = 0;
    const batchSize = 50;
    
    for (let batch = 0; batch < allProfiles.length; batch += batchSize) {
        const batchProfiles = allProfiles.slice(batch, batch + batchSize);
        
        await Promise.all(batchProfiles.map(async (stored) => {
            const clientId = stored.clientDealerId;
            
            const loc = await DealerLocation.findOne({
                $or: [{ clientDealerId: clientId }, { dealerId: clientId }]
            }).lean();
            if (!loc) return;

            const key = (loc.clientDealerId || loc.dealerId).trim().toUpperCase();
            const apps = await Application.find({ clientDealerId: key }).sort({ applicationDate: 1 }).lean();
            const comms = await DealerCommunication.find({ internalRelationshipId2: key }).sort({ communicationEventDatetime: 1 }).lean();

            // Re-evaluate
            const fresh = evaluateDealerProfile(loc, apps, comms);
            const seg = fresh.relationshipDemand;
            const lift = fresh.postVisitBookedLiftPct;
            const organic = fresh.organicBookedRatio;
            const visits = fresh.lifetimeStats.totalVisits;
            const bookings = fresh.lifetimeStats.totalBookings;
            const volume = fresh.lifetimeStats.totalBookedVolume;
            const yield_ = fresh.lifetimeYieldPerVisit;
            
            const dealer = {
                id: clientId,
                name: fresh.dealerName,
                seg, pattern: fresh.patternType,
                visits, apps: fresh.lifetimeStats.totalApplications,
                bookings, volume, lift, organic, yield_,
                clusters: fresh.verifiedCycleCount,
                daysSinceVisit: fresh.daysSinceLastVisit,
                approvalRate: fresh.pipelineStats?.approvalRatePct,
            };

            // ── Stored vs Fresh mismatch ──
            if (stored.relationshipDemand !== fresh.relationshipDemand) {
                issues.STORED_MISMATCH.push({ ...dealer, storedSeg: stored.relationshipDemand });
            }

            // ── Comfort Stop challenges ──
            if (seg === 'comfort_stop') {
                if (lift !== null && lift >= 50) issues.CS_HIGH_LIFT.push(dealer);
                if (yield_ >= 25000) issues.CS_HIGH_YIELD.push(dealer);
                if (bookings >= 3 && volume >= 100000) issues.CS_HAS_PRODUCTION.push(dealer);
            }

            // ── Self-Sufficient challenges ──
            if (seg === 'self_sufficient' && fresh.patternType !== 'lapsed_churn') {
                if (lift !== null && lift >= 60) issues.SS_HIGH_LIFT.push(dealer);
                if (fresh.verifiedCycleCount >= 2 && lift !== null && lift >= 50) issues.SS_SPIKE_DECAY.push(dealer);
                if (organic !== null && organic < 30 && visits >= 3) issues.SS_LOW_ORGANIC.push(dealer);
                if (bookings <= 1 && volume < 50000 && fresh.lifetimeStats.totalApplications < 15) issues.SS_THIN_EVIDENCE.push(dealer);
            }

            // ── High TLC challenges ──
            if (seg === 'high_tlc') {
                if (lift !== null && lift < 50) issues.TLC_LOW_LIFT.push(dealer);
                if (organic !== null && organic >= 50) issues.TLC_HIGH_ORGANIC.push(dealer);
                if (yield_ < 15000 && visits >= 3) issues.TLC_LOW_YIELD.push(dealer);
                if (bookings <= 2) issues.TLC_THIN.push(dealer);
            }

            // ── Window inflation (for dealers with >= 5 visits) ──
            if (visits >= 5) {
                const visitDates = comms
                    .filter(c => {
                        const t = (c.communicationType || '').toLowerCase();
                        const r = (c.communicationResult1 || '').toLowerCase();
                        return t.includes('visit') || t === 'meeting' || t.includes('in-person') || 
                               r.includes('met with') || r.includes('training completed') || r.includes('sign up completed');
                    })
                    .map(c => new Date(c.communicationEventDatetime))
                    .filter(d => !isNaN(d.getTime()))
                    .sort((a, b) => a - b);

                if (visitDates.length >= 5) {
                    const firstApp = apps.length > 0 ? new Date(apps[0].applicationDate) : null;
                    const coverage = calcEnvelopeCoverage(visitDates, firstApp, nowMs);
                    if (coverage >= 0.50 && lift !== null && lift >= 80) {
                        issues.WINDOW_INFLATION.push({ ...dealer, coverage: Math.round(coverage * 100) });
                    }

                    // ── Cluster window mismatch: compare 14d spec clusters vs 45d code clusters ──
                    const specClusters = clusterVisitsSpec(visitDates);
                    const codeClusters = fresh.verifiedCycleCount;
                    if (specClusters.length > codeClusters * 1.5 && specClusters.length >= codeClusters + 2) {
                        issues.CLUSTER_WINDOW_MISMATCH.push({
                            ...dealer,
                            specClusters: specClusters.length,
                            codeClusters,
                        });
                    }
                }
            }

            // ── Recency shift: does recent behavior contradict lifetime classification? ──
            if (visits >= 3 && apps.length >= 5) {
                const visitDates = comms
                    .filter(c => {
                        const t = (c.communicationType || '').toLowerCase();
                        const r = (c.communicationResult1 || '').toLowerCase();
                        return t.includes('visit') || t === 'meeting' || t.includes('in-person') || 
                               r.includes('met with') || r.includes('training completed') || r.includes('sign up completed');
                    })
                    .map(c => new Date(c.communicationEventDatetime))
                    .filter(d => !isNaN(d.getTime()));

                const recency = checkRecencyShift(apps, visitDates, nowMs);
                
                // High TLC but no recent visit-correlated activity
                if (seg === 'high_tlc' && recency.recentVisits === 0 && recency.recentBooked >= 2) {
                    issues.RECENCY_SHIFT_TLC.push({ ...dealer, recency });
                }
                
                // Autonomous but recent activity is ALL post-visit
                if (seg === 'self_sufficient' && fresh.patternType !== 'lapsed_churn' && recency.recentVisits >= 3 && recency.recentBooked >= 2) {
                    // Check if recent bookings are inside visit windows
                    const recentVisitDates = visitDates.filter(d => d.getTime() > nowMs - 365 * DAY_MS);
                    if (recentVisitDates.length >= 3) {
                        const attr = checkAttributionDates(
                            apps.filter(a => a.applicationDate && new Date(a.applicationDate).getTime() > nowMs - 365 * DAY_MS),
                            recentVisitDates
                        );
                        if (attr && attr.liftByApp !== null && attr.liftByApp >= 70) {
                            issues.RECENCY_SHIFT_SS.push({ ...dealer, recentLift: attr.liftByApp, recency });
                        }
                    }
                }
            }

            // ── Attribution date discrepancy ──
            if (visits >= 2 && bookings >= 2) {
                const visitDates = comms
                    .filter(c => {
                        const t = (c.communicationType || '').toLowerCase();
                        const r = (c.communicationResult1 || '').toLowerCase();
                        return t.includes('visit') || t === 'meeting' || t.includes('in-person') || 
                               r.includes('met with') || r.includes('training completed') || r.includes('sign up completed');
                    })
                    .map(c => new Date(c.communicationEventDatetime))
                    .filter(d => !isNaN(d.getTime()));

                if (visitDates.length >= 2) {
                    const attr = checkAttributionDates(apps, visitDates);
                    if (attr && attr.diff >= 20) {
                        issues.ATTRIBUTION_DATE_SKEW.push({
                            ...dealer,
                            liftByApp: attr.liftByApp,
                            liftByBook: attr.liftByBook,
                            skew: attr.diff
                        });
                    }
                }
            }

            processed++;
            if (processed % 100 === 0) {
                process.stdout.write(`  Processed ${processed}/${allProfiles.length}...\r`);
            }
        }));
    }

    console.log(`\n  Processed ${processed} dealers total.\n`);

    // ═══ RESULTS ═══
    console.log('═'.repeat(110));
    console.log('  FULL POPULATION AUDIT RESULTS');
    console.log('═'.repeat(110));

    const totalPop = allProfiles.length;
    const issueEntries = Object.entries(issues).filter(([_, arr]) => arr.length > 0).sort((a, b) => b[1].length - a[1].length);
    const totalAffected = new Set(issueEntries.flatMap(([_, arr]) => arr.map(d => d.id))).size;

    console.log(`\n  Total classified dealers : ${totalPop}`);
    console.log(`  Dealers with ≥1 issue   : ${totalAffected} (${Math.round(totalAffected / totalPop * 100)}%)`);
    console.log(`  Total issue categories   : ${issueEntries.length}\n`);

    for (const [code, arr] of issueEntries) {
        const pct = Math.round(arr.length / totalPop * 100);
        const icon = code.startsWith('CS_HIGH_LIFT') || code.startsWith('SS_HIGH_LIFT') || code.startsWith('SS_SPIKE_DECAY') || code.startsWith('TLC_HIGH_ORGANIC')
            ? '🔴' : code.includes('MISMATCH') || code.includes('INFLATION') || code.includes('SHIFT') || code.includes('SKEW')
            ? '🟠' : '🟡';

        console.log(`\n  ${icon} ${code}: ${arr.length} dealers (${pct}% of population)`);
        console.log(`  ${'─'.repeat(80)}`);

        if (code === 'CS_HIGH_LIFT') {
            console.log(`  Comfort Stops where visits WORK (lift >= 50%). These are not time sinks.`);
            const top5 = arr.sort((a, b) => (b.lift || 0) - (a.lift || 0)).slice(0, 8);
            console.log(`  Top examples (by lift):`);
            for (const d of top5) {
                console.log(`    ${d.id.padEnd(8)} ${d.name.substring(0, 40).padEnd(42)} Lift:${(d.lift + '%').padStart(5)} Visits:${String(d.visits).padStart(3)} Bkd:${String(d.bookings).padStart(3)} Vol:$${(d.volume/1000).toFixed(0)}K  Yield:$${(d.yield_/1000).toFixed(0)}K/v`);
            }
        } else if (code === 'SS_HIGH_LIFT' || code === 'SS_SPIKE_DECAY') {
            console.log(`  Autonomous dealers that are actually visit-dependent.`);
            const top5 = arr.sort((a, b) => (b.lift || 0) - (a.lift || 0)).slice(0, 8);
            for (const d of top5) {
                console.log(`    ${d.id.padEnd(8)} ${d.name.substring(0, 40).padEnd(42)} Lift:${(d.lift + '%').padStart(5)} Organic:${(d.organic + '%').padStart(4)} Visits:${String(d.visits).padStart(3)} Clusters:${d.clusters} Vol:$${(d.volume/1000).toFixed(0)}K`);
            }
        } else if (code === 'WINDOW_INFLATION') {
            console.log(`  Dealers where visit envelopes cover >= 50% of timeline, making lift % unreliable.`);
            const top5 = arr.sort((a, b) => (b.coverage || 0) - (a.coverage || 0)).slice(0, 8);
            for (const d of top5) {
                console.log(`    ${d.id.padEnd(8)} ${d.name.substring(0, 40).padEnd(42)} Coverage:${(d.coverage + '%').padStart(4)} Lift:${(d.lift + '%').padStart(5)} Visits:${String(d.visits).padStart(3)} Seg:${d.seg}`);
            }
        } else if (code === 'CLUSTER_WINDOW_MISMATCH') {
            console.log(`  Spec says CLUSTER_GAP = 14 days, but code uses 45 days.`);
            console.log(`  These dealers would have MORE distinct clusters under the spec's 14-day rule,`);
            console.log(`  meaning their visit episodes are being incorrectly merged.`);
            const top5 = arr.sort((a, b) => (b.specClusters - b.codeClusters) - (a.specClusters - a.codeClusters)).slice(0, 8);
            for (const d of top5) {
                console.log(`    ${d.id.padEnd(8)} ${d.name.substring(0, 40).padEnd(42)} Spec:${String(d.specClusters).padStart(3)} clusters vs Code:${String(d.codeClusters).padStart(3)} clusters (${d.specClusters - d.codeClusters} lost) Visits:${d.visits}`);
            }
        } else if (code === 'ATTRIBUTION_DATE_SKEW') {
            console.log(`  Lift % changes significantly depending on whether you attribute by app date vs booked date.`);
            const top5 = arr.sort((a, b) => (b.skew || 0) - (a.skew || 0)).slice(0, 8);
            for (const d of top5) {
                console.log(`    ${d.id.padEnd(8)} ${d.name.substring(0, 40).padEnd(42)} LiftByApp:${(d.liftByApp + '%').padStart(5)} LiftByBook:${(d.liftByBook + '%').padStart(5)} Skew:${d.skew}pp  Seg:${d.seg}`);
            }
        } else if (code === 'RECENCY_SHIFT_TLC') {
            console.log(`  High TLC dealers that have NOT been visited recently but are STILL booking — they may have become autonomous.`);
            const top5 = arr.slice(0, 8);
            for (const d of top5) {
                console.log(`    ${d.id.padEnd(8)} ${d.name.substring(0, 40).padEnd(42)} RecentVisits:${d.recency.recentVisits} RecentBkd:${d.recency.recentBooked} RecentVol:$${(d.recency.recentBookedVol/1000).toFixed(0)}K`);
            }
        } else if (code === 'RECENCY_SHIFT_SS') {
            console.log(`  Autonomous dealers where recent activity (12mo) is actually visit-driven.`);
            const top5 = arr.slice(0, 8);
            for (const d of top5) {
                console.log(`    ${d.id.padEnd(8)} ${d.name.substring(0, 40).padEnd(42)} RecentLift:${d.recentLift}% RecentVisits:${d.recency.recentVisits} RecentBkd:${d.recency.recentBooked}`);
            }
        } else if (code === 'STORED_MISMATCH') {
            console.log(`  Stored DB classification differs from fresh recomputation.`);
            const top5 = arr.slice(0, 8);
            for (const d of top5) {
                console.log(`    ${d.id.padEnd(8)} ${d.name.substring(0, 40).padEnd(42)} Stored:${d.storedSeg.padEnd(18)} Fresh:${d.seg}`);
            }
        } else {
            const top5 = arr.slice(0, 8);
            for (const d of top5) {
                console.log(`    ${d.id.padEnd(8)} ${d.name.substring(0, 40).padEnd(42)} Visits:${String(d.visits).padStart(3)} Bkd:${String(d.bookings).padStart(3)} Vol:$${(d.volume/1000).toFixed(0)}K Lift:${d.lift !== null ? d.lift + '%' : 'N/A'} Yield:$${(d.yield_/1000).toFixed(0)}K/v`);
            }
        }

        if (arr.length > 8) console.log(`    ... and ${arr.length - 8} more`);
    }

    // ═══ SYSTEMIC SUMMARY ═══
    console.log('\n\n' + '═'.repeat(110));
    console.log('  SYSTEMIC FLAW SUMMARY');
    console.log('═'.repeat(110));

    const csTotal = allProfiles.filter(p => p.relationshipDemand === 'comfort_stop').length;
    const ssTotal = allProfiles.filter(p => p.relationshipDemand === 'self_sufficient').length;
    const tlcTotal = allProfiles.filter(p => p.relationshipDemand === 'high_tlc').length;

    console.log(`\n  FLAW 1 — COMFORT STOP GATE ORDER (Step 2 before Step 4)`);
    console.log(`    ${issues.CS_HIGH_LIFT.length} of ${csTotal} comfort stops (${Math.round(issues.CS_HIGH_LIFT.length/csTotal*100)}%) have lift >= 50% — visits WORK`);
    console.log(`    ${issues.CS_HAS_PRODUCTION.length} of ${csTotal} comfort stops (${Math.round(issues.CS_HAS_PRODUCTION.length/csTotal*100)}%) have >= 3 bookings AND >= $100K volume`);

    console.log(`\n  FLAW 2 — AUTONOMOUS OR LOGIC (allows visit-dependent dealers)`);
    console.log(`    ${issues.SS_HIGH_LIFT.length} of ${ssTotal} autonomous (${Math.round(issues.SS_HIGH_LIFT.length/ssTotal*100)}%) have lift >= 60%`);
    console.log(`    ${issues.SS_SPIKE_DECAY.length} of ${ssTotal} autonomous (${Math.round(issues.SS_SPIKE_DECAY.length/ssTotal*100)}%) have verified spike-and-decay`);

    console.log(`\n  FLAW 3 — 45-DAY WINDOW INFLATION`);
    console.log(`    ${issues.WINDOW_INFLATION.length} dealers have >= 50% timeline coverage + >= 80% lift`);

    console.log(`\n  FLAW 4 — CLUSTER GAP MISMATCH (Spec: 14 days, Code: 45 days)`);
    console.log(`    ${issues.CLUSTER_WINDOW_MISMATCH.length} dealers would have significantly more clusters under the spec's 14-day rule`);
    console.log(`    The 45-day gap merges monthly visits into single mega-clusters, distorting spike-and-decay detection`);

    console.log(`\n  FLAW 5 — RECENCY BIAS (lifetime classification ignores behavioral change)`);
    console.log(`    ${issues.RECENCY_SHIFT_TLC.length} High TLC dealers show autonomous behavior in recent 12 months`);
    console.log(`    ${issues.RECENCY_SHIFT_SS.length} Autonomous dealers show visit-dependency in recent 12 months`);

    console.log(`\n  FLAW 6 — ATTRIBUTION DATE SKEW (appDate vs bookedDate)`);
    console.log(`    ${issues.ATTRIBUTION_DATE_SKEW.length} dealers show >= 20pp lift difference depending on attribution date used`);

    console.log(`\n  FLAW 7 — HIGH TLC QUALITY`);
    console.log(`    ${issues.TLC_LOW_LIFT.length} of ${tlcTotal} TLC (${tlcTotal > 0 ? Math.round(issues.TLC_LOW_LIFT.length/tlcTotal*100) : 0}%) have lift < 50%`);
    console.log(`    ${issues.TLC_HIGH_ORGANIC.length} of ${tlcTotal} TLC (${tlcTotal > 0 ? Math.round(issues.TLC_HIGH_ORGANIC.length/tlcTotal*100) : 0}%) have organic >= 50%`);

    console.log('\n' + '═'.repeat(110));
    console.log('  END OF DEEP AUDIT');
    console.log('═'.repeat(110) + '\n');

    await mongoose.disconnect();
}

runDeepAudit().catch(err => {
    console.error('Deep audit failed:', err);
    process.exit(1);
});
