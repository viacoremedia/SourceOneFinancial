/**
 * DRD Classification Comprehensive Audit
 * 
 * Samples 20 random dealers from each of: high_tlc, comfort_stop, self_sufficient
 * For each dealer:
 *   1. Loads stored DealerProfile (current classification)
 *   2. Loads raw application history & communication history
 *   3. Re-runs evaluateDealerProfile from scratch
 *   4. Applies adversarial challenge logic to detect contradictions
 *   5. Outputs detailed findings
 * 
 * Run from server/: node scratch/drd_audit.js
 */

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { evaluateDealerProfile } = require('../services/dealerRelationshipEngine');
const DealerProfile = require('../models/DealerProfile');
const DealerLocation = require('../models/DealerLocation');
const Application = require('../models/Application');
const DealerCommunication = require('../models/DealerCommunication');

const SAMPLE_SIZE = 20;
const SEGMENTS = ['high_tlc', 'comfort_stop', 'self_sufficient'];

/**
 * Adversarial challenge: given the raw numbers and classification, identify logical contradictions
 */
function challengeClassification(profile, storedProfile) {
    const issues = [];
    const seg = profile.relationshipDemand;
    const lift = profile.postVisitBookedLiftPct;
    const organic = profile.organicBookedRatio;
    const visits = profile.lifetimeStats.totalVisits;
    const bookings = profile.lifetimeStats.totalBookings;
    const volume = profile.lifetimeStats.totalBookedVolume;
    const yield_ = profile.lifetimeYieldPerVisit;
    const apps = profile.lifetimeStats.totalApplications;
    const approvalRate = profile.pipelineStats?.approvalRatePct || 0;
    const daysSinceVisit = profile.daysSinceLastVisit;

    // ═══ COMFORT STOP CHALLENGES ═══
    if (seg === 'comfort_stop') {
        // 1. High lift % contradicts comfort stop
        if (lift !== null && lift >= 50) {
            issues.push({
                severity: 'CRITICAL',
                code: 'CS_HIGH_LIFT',
                message: `Post-Visit Lift is ${lift}% — if visits generate ${lift}% of all booked volume, this dealer IS responding to visits. Comfort Stop classification is contradicted.`,
                recommendation: 'Should likely be High TLC or at minimum reclassified for review.'
            });
        }

        // 2. Meaningful yield/visit contradicts "time sink"
        if (yield_ >= 25000) {
            issues.push({
                severity: 'CRITICAL',
                code: 'CS_HIGH_YIELD',
                message: `Yield/Visit is $${(yield_/1000).toFixed(0)}K — this exceeds the $25K/visit threshold. Visits are economically productive.`,
                recommendation: 'Re-evaluate whether volume thresholds are set correctly.'
            });
        }

        // 3. Decent booking count + decent volume = not truly a sink
        if (bookings >= 3 && volume >= 100000) {
            issues.push({
                severity: 'HIGH',
                code: 'CS_HAS_PRODUCTION',
                message: `${bookings} booked deals totaling $${(volume/1000).toFixed(0)}K — this is meaningful production, not a time sink.`,
                recommendation: 'Comfort stop rules may be over-classifying productive dealers with many visits.'
            });
        }

        // 4. No visits logged but classified as comfort stop
        if (visits < 3) {
            issues.push({
                severity: 'HIGH',
                code: 'CS_LOW_VISITS',
                message: `Only ${visits} visits recorded. Comfort Stop requires >=3 visits per spec, but dealer was still classified here.`,
                recommendation: 'Check for edge case in multi-condition OR logic.'
            });
        }
    }

    // ═══ SELF-SUFFICIENT / AUTONOMOUS CHALLENGES ═══
    if (seg === 'self_sufficient') {
        // 1. High lift % contradicts autonomy
        if (lift !== null && lift >= 60) {
            issues.push({
                severity: 'CRITICAL',
                code: 'SS_HIGH_LIFT',
                message: `Post-Visit Lift is ${lift}% — ${lift}% of booked volume is tied to visit windows. Dealer is NOT autonomous; they're visit-dependent.`,
                recommendation: 'Should be High TLC. The organic ratio check may be passing because total volume includes older pre-2025 data.'
            });
        }

        // 2. Timeline shows clear spike-and-decay correlation
        if (profile.verifiedCycleCount >= 2 && lift !== null && lift >= 50) {
            issues.push({
                severity: 'CRITICAL',
                code: 'SS_SPIKE_DECAY',
                message: `${profile.verifiedCycleCount} verified visit clusters AND ${lift}% lift — classic spike-and-decay pattern masked as autonomous.`,
                recommendation: 'The organic ratio threshold (>=50%) may be too generous when combined with high lift.'
            });
        }

        // 3. Low organic ratio but still classified autonomous
        if (organic !== null && organic < 30 && visits >= 3) {
            issues.push({
                severity: 'HIGH',
                code: 'SS_LOW_ORGANIC',
                message: `Only ${organic}% organic ratio with ${visits} visits — this dealer's production is clearly driven by visits, not portal autonomy.`,
                recommendation: 'The "hasDemonstratedAutonomy" path may be overriding organic ratio checks.'
            });
        }

        // 4. Very few bookings claiming autonomous
        if (bookings <= 1 && volume < 50000) {
            issues.push({
                severity: 'MEDIUM',
                code: 'SS_THIN_EVIDENCE',
                message: `Only ${bookings} bookings ($${(volume/1000).toFixed(0)}K) — too little production history to confidently call autonomous.`,
                recommendation: 'Should likely be insufficient_data / discovery queue.'
            });
        }
    }

    // ═══ HIGH TLC CHALLENGES ═══
    if (seg === 'high_tlc') {
        // 1. Low lift % undermines TLC classification
        if (lift !== null && lift < 50) {
            issues.push({
                severity: 'HIGH',
                code: 'TLC_LOW_LIFT',
                message: `Post-Visit Lift is only ${lift}% — majority of production happens outside visit windows. Visit-dependency claim is weak.`,
                recommendation: 'Re-evaluate whether this is truly touch-sensitive vs naturally active.'
            });
        }

        // 2. High organic ratio contradicts TLC
        if (organic !== null && organic >= 50) {
            issues.push({
                severity: 'CRITICAL',
                code: 'TLC_HIGH_ORGANIC',
                message: `${organic}% organic ratio — more than half of production occurs WITHOUT visits. This dealer may be self-sufficient.`,
                recommendation: 'Organic ratio should disqualify from High TLC.'
            });
        }

        // 3. Very few bookings for TLC confidence
        if (bookings <= 2) {
            issues.push({
                severity: 'MEDIUM',
                code: 'TLC_THIN_EVIDENCE',
                message: `Only ${bookings} lifetime bookings — statistical confidence for visit causality is very low.`,
                recommendation: 'Consider requiring minimum 3 bookings for TLC classification.'
            });
        }

        // 4. Low yield/visit makes route visits uneconomic
        if (yield_ < 15000 && visits >= 3) {
            issues.push({
                severity: 'HIGH',
                code: 'TLC_LOW_YIELD',
                message: `Yield/Visit is only $${(yield_/1000).toFixed(0)}K across ${visits} visits — even if touch-dependent, the ROI doesn't justify route priority.`,
                recommendation: 'Consider a minimum yield threshold for TLC to prevent uneconomic route assignments.'
            });
        }
    }

    // ═══ CROSS-SEGMENT: Cluster Window Inflation ═══
    // The 45-day cluster gap creates MASSIVE merged windows that inflate lift %
    if (visits >= 3) {
        const totalDaysInEnvelopes = visits * 45; // Rough estimate (each visit creates ~45-55d envelope)
        const totalCalendarDays = daysSinceVisit !== null ? 
            (Date.now() - new Date('2024-01-01').getTime()) / (24*60*60*1000) : 
            365 * 2;
        const envelopeCoverage = Math.min(100, Math.round((totalDaysInEnvelopes / totalCalendarDays) * 100));
        
        if (envelopeCoverage >= 60 && lift !== null && lift >= 80) {
            issues.push({
                severity: 'HIGH',
                code: 'WINDOW_INFLATION',
                message: `With ${visits} visits × ~45-55 day windows, ~${envelopeCoverage}% of the timeline is covered by visit envelopes. Lift of ${lift}% may be a statistical artifact — not causal.`,
                recommendation: 'Frequent visits create overlapping envelopes that attribute everything to visits. Consider normalized attribution.'
            });
        }
    }

    // ═══ CROSS-SEGMENT: Stored vs Recomputed Mismatch ═══
    if (storedProfile && storedProfile.relationshipDemand !== profile.relationshipDemand) {
        issues.push({
            severity: 'MEDIUM',
            code: 'STORED_MISMATCH',
            message: `Stored classification "${storedProfile.relationshipDemand}" differs from fresh recomputation "${profile.relationshipDemand}".`,
            recommendation: 'Database may be stale. Run recompute.'
        });
    }

    return issues;
}

async function runAudit() {
    console.log('\n' + '═'.repeat(100));
    console.log('  DRD CLASSIFICATION COMPREHENSIVE AUDIT');
    console.log('  Sampling 20 random dealers from each of: HIGH TLC, COMFORT STOP, SELF-SUFFICIENT');
    console.log('═'.repeat(100) + '\n');

    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
    console.log('Connected to MongoDB.\n');

    const allResults = [];
    let totalIssues = 0;
    let criticalCount = 0;

    for (const segment of SEGMENTS) {
        console.log('\n' + '─'.repeat(100));
        console.log(`  SEGMENT: ${segment.toUpperCase()} — Sampling ${SAMPLE_SIZE} random dealers`);
        console.log('─'.repeat(100));

        // Sample random dealers from this segment
        const storedProfiles = await DealerProfile.aggregate([
            { $match: { relationshipDemand: segment } },
            { $sample: { size: SAMPLE_SIZE } }
        ]);

        console.log(`  Found ${storedProfiles.length} sampled profiles.\n`);

        for (let idx = 0; idx < storedProfiles.length; idx++) {
            const stored = storedProfiles[idx];
            const clientId = stored.clientDealerId;
            
            // Load raw data
            const loc = await DealerLocation.findOne({
                $or: [{ clientDealerId: clientId }, { dealerId: clientId }]
            }).lean();

            if (!loc) {
                console.log(`  [${idx + 1}/${storedProfiles.length}] ⚠️ ${clientId} — No DealerLocation found, skipping.`);
                continue;
            }

            const key = (loc.clientDealerId || loc.dealerId).trim().toUpperCase();
            const apps = await Application.find({ clientDealerId: key }).sort({ applicationDate: 1 }).lean();
            const comms = await DealerCommunication.find({ internalRelationshipId2: key }).sort({ communicationEventDatetime: 1 }).lean();

            // Re-evaluate from scratch
            const fresh = evaluateDealerProfile(loc, apps, comms);

            // Challenge
            const issues = challengeClassification(fresh, stored);

            const dealerLabel = `${fresh.dealerName} (${clientId})`;

            if (issues.length === 0) {
                console.log(`  [${idx + 1}] ✅ ${dealerLabel} — Classification OK (${fresh.relationshipDemand} / ${fresh.patternType})`);
            } else {
                const criticals = issues.filter(i => i.severity === 'CRITICAL').length;
                criticalCount += criticals;
                totalIssues += issues.length;

                console.log(`\n  [${idx + 1}] ${criticals > 0 ? '🚨' : '⚠️'} ${dealerLabel}`);
                console.log(`       Classification : ${fresh.relationshipDemand} / ${fresh.patternType}`);
                console.log(`       Visits: ${fresh.lifetimeStats.totalVisits} | Apps: ${fresh.lifetimeStats.totalApplications} | Bookings: ${fresh.lifetimeStats.totalBookings} | Volume: $${(fresh.lifetimeStats.totalBookedVolume/1000).toFixed(0)}K`);
                console.log(`       Lift: ${fresh.postVisitBookedLiftPct !== null ? fresh.postVisitBookedLiftPct + '%' : 'N/A'} | Organic: ${fresh.organicBookedRatio}% | Yield/Visit: $${(fresh.lifetimeYieldPerVisit/1000).toFixed(0)}K | Clusters: ${fresh.verifiedCycleCount}`);
                console.log(`       Approval Rate: ${fresh.pipelineStats.approvalRatePct}% | L-to-B: ${fresh.pipelineStats.lookToBookPct}%`);
                console.log(`       Days Since Visit: ${fresh.daysSinceLastVisit !== null ? fresh.daysSinceLastVisit : 'Never'}`);
                
                for (const issue of issues) {
                    const icon = issue.severity === 'CRITICAL' ? '🔴' : issue.severity === 'HIGH' ? '🟠' : '🟡';
                    console.log(`       ${icon} [${issue.severity}] ${issue.code}: ${issue.message}`);
                    console.log(`         → ${issue.recommendation}`);
                }

                allResults.push({
                    clientDealerId: clientId,
                    dealerName: fresh.dealerName,
                    segment: fresh.relationshipDemand,
                    pattern: fresh.patternType,
                    visits: fresh.lifetimeStats.totalVisits,
                    apps: fresh.lifetimeStats.totalApplications,
                    bookings: fresh.lifetimeStats.totalBookings,
                    volume: fresh.lifetimeStats.totalBookedVolume,
                    lift: fresh.postVisitBookedLiftPct,
                    organic: fresh.organicBookedRatio,
                    yieldPerVisit: fresh.lifetimeYieldPerVisit,
                    clusters: fresh.verifiedCycleCount,
                    approvalRate: fresh.pipelineStats.approvalRatePct,
                    daysSinceVisit: fresh.daysSinceLastVisit,
                    issues
                });
            }
        }
    }

    // ═══ SUMMARY ═══
    console.log('\n\n' + '═'.repeat(100));
    console.log('  AUDIT SUMMARY');
    console.log('═'.repeat(100));
    console.log(`  Total dealers audited : ${SAMPLE_SIZE * SEGMENTS.length}`);
    console.log(`  Dealers with issues   : ${allResults.length}`);
    console.log(`  Total issues found    : ${totalIssues}`);
    console.log(`  Critical issues       : ${criticalCount}`);

    // Group issues by code
    const byCode = {};
    for (const r of allResults) {
        for (const iss of r.issues) {
            if (!byCode[iss.code]) byCode[iss.code] = { count: 0, severity: iss.severity, dealers: [] };
            byCode[iss.code].count++;
            byCode[iss.code].dealers.push(r.clientDealerId);
        }
    }

    console.log('\n  Issue Distribution:');
    const sorted = Object.entries(byCode).sort((a, b) => b[1].count - a[1].count);
    for (const [code, data] of sorted) {
        const icon = data.severity === 'CRITICAL' ? '🔴' : data.severity === 'HIGH' ? '🟠' : '🟡';
        console.log(`    ${icon} ${code} (${data.severity}): ${data.count} dealers — ${data.dealers.join(', ')}`);
    }

    // ═══ SYSTEMIC PATTERN ANALYSIS ═══
    console.log('\n\n' + '═'.repeat(100));
    console.log('  SYSTEMIC PATTERN ANALYSIS');
    console.log('═'.repeat(100));

    // Check: How many comfort stops have lift >= 50%?
    const csHighLift = allResults.filter(r => r.segment === 'comfort_stop' && r.lift !== null && r.lift >= 50);
    if (csHighLift.length > 0) {
        console.log(`\n  🔴 COMFORT STOPS WITH HIGH LIFT (>= 50%):`);
        console.log(`     ${csHighLift.length} out of ${SAMPLE_SIZE} sampled comfort stops show visit-correlated production.`);
        console.log(`     This suggests the Comfort Stop gate fires BEFORE checking lift %, allowing visit-productive dealers to be misclassified.`);
        console.log(`     ROOT CAUSE: Decision tree Step 2 (Comfort Stop) runs before Step 4 (Organic vs TLC).`);
        console.log(`     FIX: Comfort stop should ONLY apply to dealers where visits demonstrably fail to produce (lift < 20% AND yield < $15K).`);
    }

    // Check: How many autonomous dealers have lift >= 60%?
    const ssHighLift = allResults.filter(r => r.segment === 'self_sufficient' && r.lift !== null && r.lift >= 60);
    if (ssHighLift.length > 0) {
        console.log(`\n  🔴 AUTONOMOUS DEALERS WITH HIGH LIFT (>= 60%):`);
        console.log(`     ${ssHighLift.length} out of ${SAMPLE_SIZE} sampled autonomous dealers show strong visit-dependency.`);
        console.log(`     ROOT CAUSE: "isOrganicDominated" uses OR logic (organicRatio >= 50% OR lift < 50%), but doesn't account for timeline correlation.`);
        console.log(`     FIX: Autonomous classification should require lift < 40% OR have an explicit timeline decay check.`);
    }

    // Check: Window inflation across high-visit dealers
    const windowInflated = allResults.filter(r => r.issues.some(i => i.code === 'WINDOW_INFLATION'));
    if (windowInflated.length > 0) {
        console.log(`\n  🟠 VISIT WINDOW INFLATION DETECTED:`);
        console.log(`     ${windowInflated.length} dealers have so many visits that their 45-day envelopes cover most of the timeline.`);
        console.log(`     When >60% of the calendar is "inside a visit window", 100% lift is a statistical certainty, not causal proof.`);
        console.log(`     FIX: Normalize lift by (envelope days / total calendar days) to get true attribution accuracy.`);
    }

    console.log('\n' + '═'.repeat(100));
    console.log('  END OF AUDIT');
    console.log('═'.repeat(100) + '\n');

    await mongoose.disconnect();
}

runAudit().catch(err => {
    console.error('Audit failed:', err);
    process.exit(1);
});
