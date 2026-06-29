const mongoose = require('mongoose');

/**
 * DealerCommunication Schema
 * 
 * Represents an individual communication event from Andrew's Dealer Communication
 * Table in OMNI. One document per communication event.
 * 
 * Communication records are immutable (they don't change after creation),
 * so the daily upsert is safe — re-sending the same record is a no-op.
 * 
 * @example
 *   { sourceCommunicationId: "COMM-9876", communicationType: "Visit",
 *     communicationUserFullName: "John Smith", recipientOrganizationName: "Fun Town RV" }
 */
const dealerCommunicationSchema = new mongoose.Schema({
    // Primary key from OMNI
    sourceCommunicationId: {
        type: String,
        required: [true, 'Source communication ID is required'],
        unique: true,
        trim: true
    },

    // Source system
    sourceSystem: { type: String, trim: true, default: null },

    // Who communicated
    communicationOrganizationName: { type: String, trim: true, default: null },
    communicationUserName: { type: String, trim: true, default: null },
    communicationUserFullName: { type: String, trim: true, default: null },
    communicationUserEmail: { type: String, trim: true, default: null },

    // What type of communication
    communicationType: { type: String, trim: true, default: null },

    // Recipient
    recipientRelationshipType: { type: String, trim: true, default: null },
    recipientOrganizationName: { type: String, trim: true, default: null },

    // Internal relationship tracking
    internalRelationshipId1: { type: String, trim: true, default: null },
    internalRelationshipId2: { type: String, trim: true, default: null },

    // Result / Feedback
    communicationResult1: { type: String, trim: true, default: null },
    communicationFeedback1: { type: String, trim: true, default: null },

    // Timing
    communicationEventDatetime: { type: Date, default: null },
    communicationEventTimezone: { type: String, trim: true, default: null },
    lastCommunicationEventDatetime: { type: Date, default: null },

    // Relationship status flags
    isProspect: { type: Boolean, default: null },
    isActiveRelationship: { type: Boolean, default: null },
    isInactiveRelationship: { type: Boolean, default: null },

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
dealerCommunicationSchema.index(
    { sourceCommunicationId: 1 },
    { unique: true, name: 'comm_id_unique' }
);

// Recipient-based queries: "all communications with this dealer"
dealerCommunicationSchema.index(
    { recipientOrganizationName: 1, communicationEventDatetime: -1 },
    { name: 'recipient_date' }
);

// User/rep-based queries: "all communications by this rep"
dealerCommunicationSchema.index(
    { communicationUserFullName: 1, communicationEventDatetime: -1 },
    { name: 'user_date' }
);

// Type-based queries: "all visits in the last 30 days"
dealerCommunicationSchema.index(
    { communicationType: 1, communicationEventDatetime: -1 },
    { name: 'type_date' }
);

// Date scans
dealerCommunicationSchema.index(
    { communicationEventDatetime: -1 },
    { name: 'comm_date_desc' }
);

module.exports = mongoose.model('DealerCommunication', dealerCommunicationSchema);
