const mongoose = require('mongoose');

/**
 * Valid Relationship Demand Segments
 */
const RELATIONSHIP_DEMAND_SEGMENTS = [
    'high_tlc',        // Production strictly surges after visits and decays without contact
    'self_sufficient', // Healthy baseline production regardless of visits; visits produce negligible lift
    'unresponsive',    // 3+ visits with zero/negligible lifetime bookings (comfort stop / time sink)
    'insufficient_data'// < 2 visits or < 6 months of historical data
];

/**
 * Valid Urgency Statuses for Sales Field Rep Routing
 */
const URGENCY_STATUSES = [
    'overdue',        // High TLC dealer exceeding recommended visit cadence
    'due_soon',       // High TLC dealer approaching cadence deadline (within 7 days)
    'on_track',       // High TLC dealer visited recently
    'self_sufficient',// Autonomous dealer — no urgent in-person visit required
    'not_monitored'   // Unresponsive or insufficient data
];

/**
 * DealerProfile Schema
 * 
 * Precomputed analytics and relationship demand profile for each dealer location.
 * Analyzes full lifetime application (2019-2026) and communication (2024-2026) timelines
 * to deliver actionable sales routing recommendations.
 */
const dealerProfileSchema = new mongoose.Schema({
    dealerLocation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DealerLocation',
        required: [true, 'Dealer location reference is required'],
        unique: true
    },
    clientDealerId: {
        type: String,
        required: [true, 'Client Dealer ID is required'],
        uppercase: true,
        trim: true,
        index: true
    },
    dealerName: {
        type: String,
        trim: true
    },
    statePrefix: {
        type: String,
        trim: true,
        uppercase: true
    },
    dealerGroup: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DealerGroup',
        default: null
    },
    assignedRep: {
        type: String,
        trim: true,
        index: true,
        default: null
    },

    // ── DRD Classification ──
    relationshipDemand: {
        type: String,
        enum: {
            values: RELATIONSHIP_DEMAND_SEGMENTS,
            message: '{VALUE} is not a valid relationship demand segment'
        },
        required: true,
        index: true
    },
    confidenceScore: {
        type: Number,
        min: 0,
        max: 1,
        default: 0
    },
    recommendedCadenceDays: {
        type: Number,
        default: null // e.g. 30, 45, 60, 90
    },

    // ── Operational Urgency & Touchpoint Recency ──
    daysSinceLastVisit: {
        type: Number,
        default: null
    },
    lastVisitDate: {
        type: Date,
        default: null
    },
    daysSinceLastTouch: {
        type: Number,
        default: null
    },
    lastTouchDate: {
        type: Date,
        default: null
    },
    lastTouchType: {
        type: String,
        default: null
    },
    urgencyStatus: {
        type: String,
        enum: {
            values: URGENCY_STATUSES,
            message: '{VALUE} is not a valid urgency status'
        },
        default: 'not_monitored',
        index: true
    },

    // ── Behavioral & Statistical Analytics ──
    visitElasticity: {
        type: Number,
        default: null // Ratio of application rate during touched windows vs untouched windows
    },
    productionHalfLifeDays: {
        type: Number,
        default: null // Median days from visit to last application before dormancy
    },

    // ── Lifetime Totals ──
    lifetimeStats: {
        totalVisits: { type: Number, default: 0 },
        totalCalls: { type: Number, default: 0 },
        totalEmails: { type: Number, default: 0 },
        totalTouchpoints: { type: Number, default: 0 },
        totalApplications: { type: Number, default: 0 },
        totalBookings: { type: Number, default: 0 },
        totalBookedVolume: { type: Number, default: 0 },
        yieldPerVisit: { type: Number, default: 0 } // Booked Volume / Visits
    },

    // ── Dormancy & Recovery Patterns ──
    dormancyStats: {
        totalDormancyEpisodes: { type: Number, default: 0 }, // Number of times dealer went 60+ days with 0 apps
        dormanciesEndedByVisit: { type: Number, default: 0 }, // Number of recoveries preceded by a rep visit
        dormancyVisitRecoveryRate: { type: Number, default: 0 } // dormanciesEndedByVisit / totalDormancyEpisodes
    },

    lastCalculatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Composite index for fast sales manager routing: "Show all High TLC dealers for rep X sorted by urgency"
dealerProfileSchema.index({ assignedRep: 1, relationshipDemand: 1, urgencyStatus: 1 });
dealerProfileSchema.index({ relationshipDemand: 1, urgencyStatus: 1 });
dealerProfileSchema.index({ statePrefix: 1, relationshipDemand: 1 });

module.exports = mongoose.model('DealerProfile', dealerProfileSchema);
