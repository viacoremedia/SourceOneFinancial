const mongoose = require('mongoose');

/**
 * DealerGroupRequest Schema
 * 
 * Tracks rep proposals for Dealer Group creation, modification, dealership additions,
 * removals, and transfers. Admins review these in the Approval Desk with visual diffs
 * and granular cherry-picking.
 */
const dealerGroupRequestSchema = new mongoose.Schema({
    requestType: {
        type: String,
        enum: ['create_group', 'add_dealers', 'remove_dealers', 'transfer_dealers', 'delete_group', 'edit_group'],
        required: true
    },
    groupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DealerGroup',
        default: null
    },
    groupName: {
        type: String,
        required: [true, 'Group name is required'],
        trim: true
    },
    groupDescription: {
        type: String,
        default: '',
        trim: true
    },
    dealers: [{
        dealerLocation: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DealerLocation',
            required: true
        },
        dealerId: {
            type: String,
            required: true
        },
        dealerName: {
            type: String,
            required: true
        },
        currentGroupName: {
            type: String,
            default: null
        },
        currentGroupId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DealerGroup',
            default: null
        },
        action: {
            type: String,
            enum: ['add', 'remove'],
            required: true
        },
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending'
        }
    }],
    requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    requesterName: {
        type: String,
        default: ''
    },
    requesterEmail: {
        type: String,
        default: ''
    },
    repNote: {
        type: String,
        required: [true, 'Please provide context or justification for this group proposal'],
        trim: true
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'partially_approved'],
        default: 'pending',
        index: true
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    reviewerName: {
        type: String,
        default: null
    },
    reviewNote: {
        type: String,
        default: null,
        trim: true
    },
    reviewedAt: {
        type: Date,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
});

module.exports = mongoose.model('DealerGroupRequest', dealerGroupRequestSchema);
