const mongoose = require('mongoose');

/**
 * Embedded sub-schema for pre-aggregated monthly metrics.
 * Computed from DailyDealerSnapshot documents by the rollup service.
 */
const metricsSchema = new mongoose.Schema({
    // Activity status day counts
    daysActive:        { type: Number, default: 0 },
    daysInactive30:    { type: Number, default: 0 },
    daysInactive60:    { type: Number, default: 0 },
    daysLongInactive:  { type: Number, default: 0 },
    totalSnapshotDays: { type: Number, default: 0 },

    // Event counts (detected by comparing consecutive snapshots)
    applicationDatesChanged: { type: Number, default: 0 },
    approvalDatesChanged:    { type: Number, default: 0 },
    bookingDatesChanged:     { type: Number, default: 0 },
    reactivationEvents:      { type: Number, default: 0 },

    // Days-since-last-application stats
    avgDaysSinceLastApp: { type: Number, default: null },
    minDaysSinceLastApp: { type: Number, default: null },
    maxDaysSinceLastApp: { type: Number, default: null },

    // Other averages
    avgDaysSinceLastApproval: { type: Number, default: null },
    avgDaysSinceLastBooking:  { type: Number, default: null }
}, { _id: false });

/**
 * MonthlyDealerRollup Schema
 * 
 * Pre-aggregated monthly statistics for a dealer location.
 * One document per dealer per month. Derived from DailyDealerSnapshot
 * and rebuilt on demand by the rollup service.
 * 
 * The `targets` field is a placeholder for future user-inputted goals
 * (e.g. "target 40 applications this month"). Schema uses Mixed type
 * so the frontend can store arbitrary target structures.
 * 
 * dealerGroup may be null for small (single-location) dealers.
 */
const monthlyDealerRollupSchema = new mongoose.Schema({
    dealerLocation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DealerLocation',
        required: [true, 'Dealer location reference is required']
    },
    dealerGroup: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DealerGroup',
        default: null
    },
    year: {
        type: Number,
        required: [true, 'Year is required'],
        min: [2020, 'Year must be 2020 or later'],
        max: [2100, 'Year must be 2100 or earlier']
    },
    month: {
        type: Number,
        required: [true, 'Month is required'],
        min: [1, 'Month must be between 1 and 12'],
        max: [12, 'Month must be between 1 and 12']
    },
    metrics: {
        type: metricsSchema,
        default: () => ({})
    },
    targets: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Primary: one rollup per dealer per month
monthlyDealerRollupSchema.index(
    { dealerLocation: 1, year: 1, month: 1 },
    { unique: true, name: 'dealer_year_month_unique' }
);

// Group-level aggregation: all locations in a group for a month
monthlyDealerRollupSchema.index(
    { dealerGroup: 1, year: 1, month: 1 },
    { name: 'group_year_month' }
);

// Cross-dealer scans for a specific month
monthlyDealerRollupSchema.index(
    { year: 1, month: 1 },
    { name: 'year_month' }
);

module.exports = mongoose.model('MonthlyDealerRollup', monthlyDealerRollupSchema);
