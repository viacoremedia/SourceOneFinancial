/**
 * ScorecardReportFile Model
 * 
 * Stores binary PDF file data and associated metadata for generated scorecard reports.
 * Persisting PDFs in MongoDB ensures instant availability across ephemeral serverless instances (e.g. Vercel).
 * 
 * @module models/ScorecardReportFile
 */

const mongoose = require('mongoose');

const scorecardReportFileSchema = new mongoose.Schema({
    reportId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ScorecardReport',
        required: true,
        index: true
    },
    filename: {
        type: String,
        required: true,
        trim: true
    },
    label: {
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
    },
    pdfData: {
        type: Buffer,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: true
});

// Fast lookups by reportId + filename
scorecardReportFileSchema.index({ reportId: 1, filename: 1 }, { unique: true });

module.exports = mongoose.model('ScorecardReportFile', scorecardReportFileSchema);
