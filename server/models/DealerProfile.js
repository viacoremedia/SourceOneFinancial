const mongoose = require('mongoose');

/**
 * Valid Relationship Demand Segments (The 4 Core Operational Buckets)
 */
const RELATIONSHIP_DEMAND_SEGMENTS = [
    'high_tlc',        // Spike & Decay: Production strictly surges after visits and decays without contact
    'self_sufficient', // Autonomous Locomotive: Healthy organic flow via portal; visits produce negligible lift
    'comfort_stop',    // Empty Friction: 3+ visits with $0 in lifetime booked loans (waste of travel budget)
    'insufficient_data'// Discovery Queue: <2 visits and <5 applications
];

/**
 * Valid Urgency Statuses for Sales Field Rep Routing
 */
const URGENCY_STATUSES = [
    'overdue',        // High TLC dealer exceeding recommended visit cadence (30-365 days)
    'due_soon',       // High TLC dealer approaching cadence deadline (within 7 days)
    'on_track',       // High TLC dealer visited recently
    'dormant',        // Inactive > 1 year (>365 days unvisited) — requires reactivation, not weekly route
    'self_sufficient',// Autonomous dealer — no urgent in-person visit required
    'not_monitored'   // Comfort Stop or Discovery Queue
];

/**
 * DealerProfile Schema
 * 
 * Precomputed analytics and relationship demand profile for each dealer location.
 * Analyzes full lifetime application (2019-2026) and normalized communication (2024-2026) timelines
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

    // ── 4 Primary DRD Classification Buckets ──
    relationshipDemand: {
        type: String,
        enum: {
            values: RELATIONSHIP_DEMAND_SEGMENTS,
            message: '{VALUE} is not a valid relationship demand segment'
        },
        required: true,
        index: true
    },
    patternType: {
        type: String,
        default: 'unexplored' // 'spike_and_decay' | 'autonomous_locomotive' | 'empty_friction' | 'unexplored'
    },
    confidenceScore: {
        type: Number,
        min: 0,
        max: 1,
        default: 0
    },
    recommendedCadenceDays: {
        type: Number,
        default: null // 30, 45, 60, 90
    },

    // ── Secondary Diagnostic Flags ──
    flags: {
        isFadingTlc: { type: Boolean, default: false },          // Yield per visit dropped >40% over sequential cycles
        isEmergingTlc: { type: Boolean, default: false },        // Exactly 1 verified cycle -> proactive confirmation visit
        isCatalyticActivation: { type: Boolean, default: false }, // Single onboarding visit unlocked sustained organic flow
        isStrategicTlc: { type: Boolean, default: false },        // High-volume account ($500K+) with strong touch sensitivity
        isUnderwritingFriction: { type: Boolean, default: false }, // Submitting apps (5+) but low approval rate prevents bookings
        isDormant: { type: Boolean, default: false }              // No activity/visits in >365 days
    },

    // ── Underwriting & Pipeline Conversion Stats ──
    pipelineStats: {
        totalApplications: { type: Number, default: 0 },
        totalApproved: { type: Number, default: 0 },
        totalBookings: { type: Number, default: 0 },
        totalDeclined: { type: Number, default: 0 },
        approvalRatePct: { type: Number, default: 0 },
        lookToBookPct: { type: Number, default: 0 },
        approvalToBookPct: { type: Number, default: 0 },
        topUnderwriter: { type: String, default: null },
        topLender: { type: String, default: null }
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

    // ── Empirical Metrics (Plain English) ──
    postVisitBookedLiftPct: {
        type: Number,
        default: null // e.g. 240 (%)
    },
    organicBookedRatio: {
        type: Number,
        default: 0 // % of booked $ occurring >45d from any visit
    },
    lifetimeYieldPerVisit: {
        type: Number,
        default: 0 // Booked Volume ($) / Total In-Person Visits
    },
    verifiedCycleCount: {
        type: Number,
        default: 0 // Count of independent visit clusters
    },

    // ── Lifetime Totals ──
    lifetimeStats: {
        totalVisits: { type: Number, default: 0 },
        totalCalls: { type: Number, default: 0 },
        totalEmails: { type: Number, default: 0 },
        totalTouchpoints: { type: Number, default: 0 },
        totalApplications: { type: Number, default: 0 },
        totalBookings: { type: Number, default: 0 },
        totalBookedVolume: { type: Number, default: 0 }
    },

    // ── Structured Decision Audit & Interaction Cycles ──
    decisionRationale: [{
        type: String
    }],
    interactionCycles: [{
        cycleNumber: Number,
        startDate: Date,
        endDate: Date,
        triggerDate: Date,
        triggerType: { type: String, default: 'visit' },
        repName: String,
        visitCountInCluster: { type: Number, default: 1 },
        metrics: {
            daysToFirstBooked: { type: Number, default: null },
            bookedInWindow: { type: Number, default: 0 },
            bookedVolumeInWindow: { type: Number, default: 0 },
            appsInWindow: { type: Number, default: 0 },
            relativeBookedLift: { type: Number, default: 0 },
            dormancyDurationDaysAfter: { type: Number, default: 0 },
            patternObserved: String
        },
        summaryText: String
    }],

    // ── Monthly Pre-Aggregated Chart Overlays ──
    timelineMonthly: [{
        monthKey: String, // "YYYY-MM"
        bookedVolume: { type: Number, default: 0 },
        bookedCount: { type: Number, default: 0 },
        appCount: { type: Number, default: 0 },
        visitCount: { type: Number, default: 0 },
        callCount: { type: Number, default: 0 }
    }],

    // ── Manual Reconciliation & Human Override ──
    manualOverride: {
        isOverridden: {
            type: Boolean,
            default: false,
            index: true
        },
        originalSegment: {
            type: String,
            default: null
        },
        overriddenSegment: {
            type: String,
            enum: {
                values: [...RELATIONSHIP_DEMAND_SEGMENTS, null],
                message: '{VALUE} is not a valid overridden segment'
            },
            default: null
        },
        reason: {
            type: String,
            default: null,
            trim: true
        },
        overriddenBy: {
            userId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                default: null
            },
            name: {
                type: String,
                default: null
            },
            email: {
                type: String,
                default: null
            }
        },
        overriddenAt: {
            type: Date,
            default: null
        },
        history: [{
            previousSegment: String,
            newSegment: String,
            reason: String,
            action: {
                type: String,
                enum: ['override', 'reset_to_system'],
                default: 'override'
            },
            changedBy: {
                userId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User',
                    default: null
                },
                name: String,
                email: String
            },
            changedAt: {
                type: Date,
                default: Date.now
            }
        }]
    },

    lastCalculatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Composite indices for fast sales manager routing: "Show all High TLC dealers for rep X sorted by urgency"
dealerProfileSchema.index({ assignedRep: 1, relationshipDemand: 1, urgencyStatus: 1 });
dealerProfileSchema.index({ relationshipDemand: 1, urgencyStatus: 1 });
dealerProfileSchema.index({ statePrefix: 1, relationshipDemand: 1 });
dealerProfileSchema.index({ 'manualOverride.isOverridden': 1 });

module.exports = mongoose.model('DealerProfile', dealerProfileSchema);
