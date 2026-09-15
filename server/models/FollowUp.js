const mongoose = require('mongoose');

/**
 * FollowUp Schema
 * 
 * Lightweight, user-scoped rooftop follow-up and task scheduling.
 * Follow-ups are indexed by user and due date, sorted nearest to furthest,
 * and retained indefinitely for historical logs.
 */
const followUpSchema = new mongoose.Schema({
    dealerId: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
        index: true
    },
    dealerName: {
        type: String,
        required: true,
        trim: true
    },
    clientDealerId: {
        type: String,
        trim: true,
        default: null
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    userName: {
        type: String,
        trim: true,
        default: ''
    },
    userEmail: {
        type: String,
        trim: true,
        default: ''
    },
    dueDate: {
        type: Date,
        required: true,
        index: true
    },
    note: {
        type: String,
        trim: true,
        default: ''
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'cancelled'],
        default: 'pending',
        index: true
    },
    completedAt: {
        type: Date,
        default: null
    },
    completedBy: {
        type: String,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Compound indexes for fast query resolution
followUpSchema.index({ userId: 1, status: 1, dueDate: 1 });
followUpSchema.index({ dealerId: 1, status: 1 });

module.exports = mongoose.model('FollowUp', followUpSchema);
