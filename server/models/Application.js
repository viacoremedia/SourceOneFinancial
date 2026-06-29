const mongoose = require('mongoose');

/**
 * Application Schema
 * 
 * Represents an individual loan application from Andrew's Main Application Table in OMNI.
 * One document per application — identified by applicationId.
 * 
 * Applications can change status over time (submitted → approved → booked),
 * so the daily upsert overwrites the entire document on each import.
 * 
 * @example
 *   { applicationId: "APP-12345", status: "Booked", amountFinanced: 45000,
 *     dealerName: "FUN TOWN RV CONROE", applicationDate: 2026-03-15 }
 */
const applicationSchema = new mongoose.Schema({
    // Primary key from OMNI
    applicationId: {
        type: String,
        required: [true, 'Application ID is required'],
        unique: true,
        trim: true
    },

    // Pipeline / Status
    status: { type: String, trim: true, default: null },
    underwriter: { type: String, trim: true, default: null },
    lender: { type: String, trim: true, default: null },

    // Dates
    applicationDate: { type: Date, default: null },
    approvalDate: { type: Date, default: null },
    bookedDate: { type: Date, default: null },

    // Financial
    amountFinanced: { type: Number, default: null },
    term: { type: Number, default: null },
    apr: { type: Number, default: null },
    cashDown: { type: Number, default: null },
    totalDown: { type: Number, default: null },
    ltv: { type: Number, default: null },
    dealerReserveAmount: { type: Number, default: null },
    dealerReservePercent: { type: Number, default: null },
    backend: { type: Number, default: null },
    invoice: { type: Number, default: null },
    dealerMinimumRate: { type: Number, default: null },

    // Credit / Risk
    coficoAuto8: { type: Number, default: null },
    primaryFicoAuto8: { type: Number, default: null },
    dti: { type: Number, default: null },
    pti: { type: Number, default: null },

    // Collateral
    collateralYear: { type: String, trim: true, default: null },
    collateralType: { type: String, trim: true, default: null },
    collateralNewUsed: { type: String, trim: true, default: null },

    // Dealer
    dealerName: { type: String, trim: true, default: null },
    dealerGroup: { type: String, trim: true, default: null },
    dealerState: { type: String, trim: true, default: null },
    dealerCity: { type: String, trim: true, default: null },
    dealerRepresentative: { type: String, trim: true, default: null },
    clientDealerId: { type: String, trim: true, default: null },

    // Performance timing
    timeToBook: { type: Number, default: null },
    timeToDecision: { type: Number, default: null },
    timeToLastFund: { type: Number, default: null },
    timeToLastDecisionToLastContract: { type: Number, default: null },

    // Programs
    programManual: { type: String, trim: true, default: null },
    programDefault: { type: String, trim: true, default: null },

    // People
    primaryState: { type: String, trim: true, default: null },
    applicationSubmittedUser: { type: String, trim: true, default: null },

    // Flags
    isBusinessApp: { type: Boolean, default: null },
    wasApproved: { type: Boolean, default: null },
    wasApprovedNotBooked: { type: Boolean, default: null },

    // Traceability
    sourcePayload: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WebhookPayload',
        default: null
    },
    lastIngestionDate: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Primary lookup
applicationSchema.index({ applicationId: 1 }, { unique: true, name: 'app_id_unique' });

// Dealer-level queries: "all applications for this dealer"
applicationSchema.index({ clientDealerId: 1, applicationDate: -1 }, { name: 'dealer_apps' });

// Status pipeline queries: "all booked applications this month"
applicationSchema.index({ status: 1, applicationDate: -1 }, { name: 'status_date' });

// Rep-level queries
applicationSchema.index({ dealerRepresentative: 1, applicationDate: -1 }, { name: 'rep_apps' });

// Date range scans
applicationSchema.index({ applicationDate: -1 }, { name: 'app_date_desc' });
applicationSchema.index({ bookedDate: -1 }, { name: 'booked_date_desc' });

module.exports = mongoose.model('Application', applicationSchema);
