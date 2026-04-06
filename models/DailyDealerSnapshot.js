const mongoose = require('mongoose');

/**
 * Valid activity status values from the Source One CSV.
 * Mongoose silently drops invalid enum values — explicit validation catches this.
 */
const ACTIVITY_STATUSES = ['active', '30d_inactive', '60d_inactive', 'long_inactive', 'never_active'];

/**
 * DailyDealerSnapshot Schema
 * 
 * One document per dealer per day — the source of truth for all analytics.
 * Maps directly to a single row from the daily dealer metrics CSV.
 * 
 * dealerGroup is denormalized here (copied from DealerLocation) to avoid
 * joins on time-series queries. It may be null for small (single-location) dealers.
 * 
 * @example
 *   { dealerLocation: ObjectId, reportDate: 2026-03-30, daysSinceLastApplication: 1,
 *     activityStatus: 'active', reactivatedAfterVisit: false }
 */
const dailyDealerSnapshotSchema = new mongoose.Schema({
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
    reportDate: {
        type: Date,
        required: [true, 'Report date is required']
    },

    // Application tracking
    lastApplicationDate: { type: Date, default: null },
    priorApplicationDate: { type: Date, default: null },
    daysSinceLastApplication: { type: Number, default: null },

    // Approval tracking
    lastApprovalDate: { type: Date, default: null },
    daysSinceLastApproval: { type: Number, default: null },

    // Booking tracking
    lastBookedDate: { type: Date, default: null },
    daysSinceLastBooking: { type: Number, default: null },

    // Status
    activityStatus: {
        type: String,
        enum: {
            values: ACTIVITY_STATUSES,
            message: '{VALUE} is not a valid activity status. Must be one of: ' + ACTIVITY_STATUSES.join(', ')
        },
        required: [true, 'Activity status is required']
    },

    // Sales rep communication
    latestCommunicationDatetime: { type: Date, default: null },

    // Sales visit impact — the key metric
    reactivatedAfterVisit: { type: Boolean, default: false },
    daysFromVisitToNextApp: { type: Number, default: null },

    // Traceability back to raw data
    sourcePayload: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WebhookPayload',
        default: null
    }
}, {
    timestamps: false // We use reportDate, not auto timestamps
});

// Primary query pattern: "give me all snapshots for this dealer, newest first"
dailyDealerSnapshotSchema.index(
    { dealerLocation: 1, reportDate: -1 },
    { unique: true, name: 'dealer_date_unique' }
);

// Group-level trend queries: "all snapshots for any dealer in this group"
dailyDealerSnapshotSchema.index(
    { dealerGroup: 1, reportDate: -1 },
    { name: 'group_date' }
);

// Date-range scans: "all snapshots for a given date"
dailyDealerSnapshotSchema.index(
    { reportDate: -1 },
    { name: 'date_desc' }
);

// Status filtering: "all active dealers on a given date"
dailyDealerSnapshotSchema.index(
    { activityStatus: 1, reportDate: -1 },
    { name: 'status_date' }
);

module.exports = mongoose.model('DailyDealerSnapshot', dailyDealerSnapshotSchema);
