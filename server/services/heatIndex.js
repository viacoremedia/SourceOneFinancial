/**
 * Heat Index Service
 *
 * Computes a 0–100 composite performance score per rep based on 8 weighted
 * sub-scores. Also classifies reps as Strong / Average / Overburdened /
 * Underperforming based on heat index + capacity ratio.
 *
 * Formula:
 *   Score = Σ (weight_i × normalizedSubScore_i)
 *
 * Sub-scores are min/max normalized across all reps so the index is relative.
 * For "days since" metrics, lower = better (inverted before normalization).
 *
 * @module services/heatIndex
 */

/**
 * Default weights — sum to 1.0.
 * Heavy on App Days (primary metric) and Active Ratio (outcome).
 */
const DEFAULT_WEIGHTS = {
    avgDaysSinceApp: 0.20,
    avgDaysSinceApproval: 0.10,
    avgDaysSinceBooking: 0.10,
    avgContactDays: 0.15,
    avgVisitResponse: 0.10,
    activeRatio: 0.20,
    reactivationRate: 0.10,
    churnNet: 0.05,
};

/**
 * Default classification thresholds.
 */
const DEFAULT_THRESHOLDS = {
    strongMinHeat: 70,        // heatIndex >= 70 → "strong"
    overburdenedCapacity: 1.3, // capacityRatio > 1.3
    overburdenedMaxHeat: 50,   // AND heatIndex < 50 → "overburdened"
    underperformMaxCap: 1.0,   // capacityRatio <= 1.0
    underperformMaxHeat: 40,   // AND heatIndex < 40 → "underperforming"
};

/**
 * Min/max normalize a value within a range. Clamps to [0, 1].
 */
function normalize(value, min, max) {
    if (max === min) return 0.5; // All equal → neutral
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

/**
 * Extract a numeric sub-score from rep data. Returns null if unavailable.
 */
function extractMetric(rep, key) {
    switch (key) {
        case 'avgDaysSinceApp':
            return rep.rollingAvg?.avgDaysSinceApp;
        case 'avgDaysSinceApproval':
            return rep.rollingAvg?.avgDaysSinceApproval;
        case 'avgDaysSinceBooking':
            return rep.rollingAvg?.avgDaysSinceBooking;
        case 'avgContactDays':
            return rep.rollingAvg?.avgContactDays;
        case 'avgVisitResponse':
            return rep.rollingAvg?.avgVisitResponse;
        case 'activeRatio':
            return rep.totalDealers > 0
                ? rep.activeCount / rep.totalDealers
                : null;
        case 'reactivationRate':
            return rep.totalDealers > 0
                ? rep.reactivatedCount / rep.totalDealers
                : null;
        case 'churnNet':
            return rep.statusFlows?.netDelta ?? null;
        default:
            return null;
    }
}

/**
 * Whether a metric is "lower is better" (inverted for scoring).
 */
const INVERTED_METRICS = new Set([
    'avgDaysSinceApp',
    'avgDaysSinceApproval',
    'avgDaysSinceBooking',
    'avgContactDays',
    'avgVisitResponse',
]);

/**
 * Compute Heat Index scores for an array of rep scorecard entries.
 * Mutates each rep object in-place by adding:
 *   - heatIndex (0–100)
 *   - heatClass ('strong' | 'average' | 'overburdened' | 'underperforming')
 *   - capacityFlag ('overburdened' | 'underperforming' | null)
 *   - _heatBreakdown (object with per-metric sub-scores for tooltip)
 *
 * @param {Object[]} reps - Array of rep scorecard entries
 * @param {number} networkAvgDealersPerRep - Average dealers per rep
 * @param {Object} [weights] - Optional custom weights
 * @param {Object} [thresholds] - Optional custom thresholds
 * @returns {Object[]} Same array with heat index fields populated
 */
function computeHeatScores(reps, networkAvgDealersPerRep, weights, thresholds) {
    const w = { ...DEFAULT_WEIGHTS, ...weights };
    const t = { ...DEFAULT_THRESHOLDS, ...thresholds };

    if (reps.length === 0) return reps;

    // Step 1: Extract raw values for each metric across all reps
    const metricKeys = Object.keys(w);
    const rawValues = {};
    for (const key of metricKeys) {
        rawValues[key] = reps.map(r => extractMetric(r, key));
    }

    // Step 2: Compute min/max for normalization (ignoring nulls)
    const ranges = {};
    for (const key of metricKeys) {
        const valid = rawValues[key].filter(v => v != null);
        if (valid.length === 0) {
            ranges[key] = { min: 0, max: 0 };
        } else {
            // Clamp outliers at 2x the IQR above Q3 / below Q1
            const sorted = [...valid].sort((a, b) => a - b);
            ranges[key] = {
                min: sorted[0],
                max: sorted[sorted.length - 1],
            };
        }
    }

    // Step 3: Score each rep
    for (let i = 0; i < reps.length; i++) {
        const rep = reps[i];
        let totalScore = 0;
        let totalWeight = 0;
        const breakdown = {};

        for (const key of metricKeys) {
            const raw = rawValues[key][i];
            const weight = w[key] || 0;

            if (raw == null) {
                // Skip null metrics — redistribute weight
                breakdown[key] = { raw: null, normalized: null, weighted: null };
                continue;
            }

            let norm = normalize(raw, ranges[key].min, ranges[key].max);

            // Invert "lower is better" metrics so that lower days = higher score
            if (INVERTED_METRICS.has(key)) {
                norm = 1 - norm;
            }

            const weighted = norm * weight * 100;
            totalScore += weighted;
            totalWeight += weight;

            breakdown[key] = {
                raw: Math.round(raw * 100) / 100,
                normalized: Math.round(norm * 100) / 100,
                weighted: Math.round(weighted * 100) / 100,
            };
        }

        // Normalize to 0–100 based on available weight
        const heatIndex = totalWeight > 0
            ? Math.round((totalScore / totalWeight) * 100) / 100
            : 50; // Neutral baseline if no data

        // Clamp
        rep.heatIndex = Math.max(0, Math.min(100, Math.round(heatIndex)));

        // Capacity ratio
        rep.capacityRatio = networkAvgDealersPerRep > 0
            ? Math.round((rep.totalDealers / networkAvgDealersPerRep) * 100) / 100
            : null;

        // Classification
        if (rep.heatIndex >= t.strongMinHeat) {
            rep.heatClass = 'strong';
            rep.capacityFlag = null;
        } else if (
            rep.capacityRatio != null &&
            rep.capacityRatio > t.overburdenedCapacity &&
            rep.heatIndex < t.overburdenedMaxHeat
        ) {
            rep.heatClass = 'overburdened';
            rep.capacityFlag = 'overburdened';
        } else if (
            rep.capacityRatio != null &&
            rep.capacityRatio <= t.underperformMaxCap &&
            rep.heatIndex < t.underperformMaxHeat
        ) {
            rep.heatClass = 'underperforming';
            rep.capacityFlag = 'underperforming';
        } else {
            rep.heatClass = 'average';
            rep.capacityFlag = null;
        }

        // Attach breakdown for frontend tooltip
        rep._heatBreakdown = breakdown;
    }

    return reps;
}

module.exports = { computeHeatScores, DEFAULT_WEIGHTS, DEFAULT_THRESHOLDS };
