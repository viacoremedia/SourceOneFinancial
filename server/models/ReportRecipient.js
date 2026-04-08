const mongoose = require('mongoose');

/**
 * ReportRecipient Schema
 * 
 * Stores email addresses that receive automated reports.
 * Managed via the Settings panel by admin+ users.
 * 
 * @example
 *   { email: "joshua@viacoremedia.com", addedBy: ObjectId("..."), createdAt: Date }
 */
const reportRecipientSchema = new mongoose.Schema({
    email: {
        type: String,
        required: [true, 'Recipient email is required'],
        unique: true,
        lowercase: true,
        trim: true,
    },
    addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

reportRecipientSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model('ReportRecipient', reportRecipientSchema);
