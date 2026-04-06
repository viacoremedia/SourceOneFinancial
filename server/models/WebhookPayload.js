const mongoose = require('mongoose');

const webhookPayloadSchema = new mongoose.Schema({
    body: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    files: [{
        originalName: String,
        mimeType: String,
        content: String // Storing the file contents here
    }],
    headers: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    receivedAt: {
        type: Date,
        default: Date.now
    }
}, { strict: false }); // strict: false allows dynamic fields safely storing unexpected data

module.exports = mongoose.model('WebhookPayload', webhookPayloadSchema);
