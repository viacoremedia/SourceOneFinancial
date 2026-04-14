const mongoose = require('mongoose');

/**
 * Valid webhook event types for the logging pipeline.
 * Each represents a distinct decision point in the webhook handler.
 */
const EVENT_TYPES = [
    'request_received',   // Raw request arrived
    'parse_success',      // Body parsed successfully (multipart, text, JSON)
    'parse_error',        // Body parsing failed
    'ingestion_start',    // CSV recognized, ingestion pipeline starting
    'ingestion_complete', // CSV ingestion finished successfully
    'ingestion_failed',   // CSV ingestion encountered an error
    'empty_payload',      // Request had no usable data
    'health_check',       // /webhook/health was called
];

/**
 * WebhookLog Schema
 * 
 * Persistent, queryable audit trail for every webhook interaction.
 * Designed to answer "did Source One ever hit our endpoint?" definitively.
 * 
 * Auto-expires after 90 days via TTL index to prevent unbounded growth.
 */
const webhookLogSchema = new mongoose.Schema({
    eventType: {
        type: String,
        enum: EVENT_TYPES,
        required: true,
        index: true
    },
    method: {
        type: String,
        default: null
    },
    path: {
        type: String,
        default: null
    },
    contentType: {
        type: String,
        default: null
    },
    contentLength: {
        type: Number,
        default: null
    },
    sourceIp: {
        type: String,
        default: null
    },
    userAgent: {
        type: String,
        default: null
    },
    fileName: {
        type: String,
        default: null
    },
    parserDetected: {
        type: String,
        default: null
    },
    filesCount: {
        type: Number,
        default: 0
    },
    durationMs: {
        type: Number,
        default: null
    },
    error: {
        type: String,
        default: null
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// TTL: auto-delete logs older than 90 days
webhookLogSchema.index(
    { createdAt: 1 },
    { expireAfterSeconds: 90 * 24 * 60 * 60, name: 'ttl_90_days' }
);

// Fast lookups for diagnostic queries
webhookLogSchema.index(
    { eventType: 1, createdAt: -1 },
    { name: 'event_type_chronological' }
);

module.exports = mongoose.model('WebhookLog', webhookLogSchema);
