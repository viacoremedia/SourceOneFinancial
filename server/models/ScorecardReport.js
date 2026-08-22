/**
 * ScorecardReport Model
 * 
 * Persists generation metadata, configuration parameters, and file manifests
 * for PDF Rep Scorecard report batches.
 * 
 * @module models/ScorecardReport
 */

const mongoose = require('mongoose');

const scorecardReportFileSchema = new mongoose.Schema({
    label: {
        type: String,
        required: true,
        trim: true
    },
    filename: {
        type: String,
        required: true,
        trim: true
    },
    repName: {
        type: String,
        trim: true,
        default: null
    },
    type: {
        type: String,
        enum: ['company', 'rep'],
        required: true
    },
    fileSizeBytes: {
        type: Number,
        default: 0
    },
    pageCount: {
        type: Number,
        default: 1
    }
}, { _id: true });

const scorecardReportSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    config: {
        scorecard: {
            windowSize: { type: Number, default: 7 },
            statusFilter: { type: [String], default: null },
            activityMode: { type: String, default: 'application' },
            finPeriod: { type: String, default: 'mtd' },
            customStartDate: { type: String, default: null },
            customEndDate: { type: String, default: null }
        },
        visitImpact: {
            reactivationWindow: { type: Number, default: 30 },
            touchpointMode: { type: String, default: 'visits' },
            timeframe: { type: String, default: 'ytd' },
            customStartDate: { type: String, default: null },
            customEndDate: { type: String, default: null }
        },
        drd: {
            includeTlcList: { type: Boolean, default: true }
        }
    },
    repCount: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['generating', 'ready', 'failed'],
        default: 'generating',
        index: true
    },
    error: {
        type: String,
        default: null
    },
    files: [scorecardReportFileSchema],
    summaryStats: {
        totalDealers: { type: Number, default: 0 },
        totalBookedVolume: { type: Number, default: 0 },
        totalBookedCount: { type: Number, default: 0 },
        totalVisits: { type: Number, default: 0 },
        totalReactivated: { type: Number, default: 0 },
        avgHeatIndex: { type: Number, default: 0 }
    },
    generatedAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    completedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

scorecardReportSchema.index({ generatedAt: -1 });

module.exports = mongoose.model('ScorecardReport', scorecardReportSchema);
