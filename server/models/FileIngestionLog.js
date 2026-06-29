const mongoose = require('mongoose');

/**
 * Valid ingestion statuses for tracking CSV processing lifecycle.
 */
const INGESTION_STATUSES = ['pending', 'processing', 'completed', 'failed'];

/**
 * FileIngestionLog Schema
 * 
 * Tracks the processing status of each CSV file received via webhook.
 * Provides observability into what's been processed, what failed,
 * and processing performance metrics.
 * 
 * One log entry per WebhookPayload + parserType combination (enforced by
 * compound unique index). This allows a single payload to contain multiple
 * CSV files for different table types (e.g., applications + communications).
 * 
 * @example
 *   { fileName: "andrews_daily_dealer_metrics.csv", status: "completed",
 *     rowCount: 2500, dealersProcessed: 2500, newDealers: 12,
 *     processingTimeMs: 3420 }
 */
const fileIngestionLogSchema = new mongoose.Schema({
    sourcePayload: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WebhookPayload',
        required: [true, 'Source payload reference is required']
    },
    parserType: {
        type: String,
        trim: true,
        default: 'dealer_metrics'
    },
    fileName: {
        type: String,
        default: ''
    },
    reportDate: {
        type: Date,
        default: null
    },
    status: {
        type: String,
        enum: {
            values: INGESTION_STATUSES,
            message: '{VALUE} is not a valid ingestion status. Must be one of: ' + INGESTION_STATUSES.join(', ')
        },
        default: 'pending'
    },
    rowCount: {
        type: Number,
        default: 0
    },
    dealersProcessed: {
        type: Number,
        default: 0
    },
    newDealers: {
        type: Number,
        default: 0
    },
    newGroups: {
        type: Number,
        default: 0
    },
    errorReason: {
        type: String,
        default: null
    },
    processingTimeMs: {
        type: Number,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    completedAt: {
        type: Date,
        default: null
    }
});

// One log per payload + parser type — prevents duplicate processing entries
// A single payload can contain multiple CSVs for different table types
fileIngestionLogSchema.index(
    { sourcePayload: 1, parserType: 1 },
    { unique: true, name: 'source_payload_parser_unique' }
);

// Filter by status (find all failed, find all pending)
fileIngestionLogSchema.index(
    { status: 1 },
    { name: 'status' }
);

// Chronological browsing by report date
fileIngestionLogSchema.index(
    { reportDate: -1 },
    { name: 'report_date_desc' }
);

module.exports = mongoose.model('FileIngestionLog', fileIngestionLogSchema);
