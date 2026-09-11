const mongoose = require('mongoose');

/**
 * BadgerUpdateLog Schema
 * 
 * Tracks all manual mutations initiated from Source One into Badger Maps
 * (e.g. notepad updates and field visit check-ins).
 * Provides full traceability, audit history, and undo/revert capabilities.
 */
const badgerUpdateLogSchema = new mongoose.Schema({
    dealerId: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    dealerLocation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DealerLocation',
        default: null
    },
    badgerId: {
        type: Number,
        required: true,
        index: true
    },
    action: {
        type: String,
        required: true,
        enum: ['notepad_update', 'checkin_create'],
        index: true
    },
    user: {
        id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        name: { type: String, trim: true, default: 'Sales Rep' },
        email: { type: String, trim: true, default: null }
    },
    payload: {
        // For notepad_update
        previousNotepad: { type: String, default: null },
        updatedNotepad: { type: String, default: null },
        noteText: { type: String, default: null },

        // For checkin_create
        appointmentId: { type: Number, default: null },
        disposition: { type: String, default: null },
        feedback: { type: String, default: null },
        checkinNotes: { type: String, default: null }
    },
    isUndone: {
        type: Boolean,
        default: false,
        index: true
    },
    undoneAt: {
        type: Date,
        default: null
    },
    undoneBy: {
        name: { type: String, default: null },
        email: { type: String, default: null }
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
});

module.exports = mongoose.model('BadgerUpdateLog', badgerUpdateLogSchema);
