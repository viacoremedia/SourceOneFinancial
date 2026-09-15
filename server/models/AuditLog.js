const mongoose = require('mongoose');

/**
 * AuditLog Schema
 * 
 * Tracks all manual network operations changes (status changes, business type, tags, 
 * industry, group assignments, parent-child links) with complete previous and new state
 * to enable an audit trail and 1-click undos.
 */
const auditLogSchema = new mongoose.Schema({
    dealerId: {
        type: String,
        required: false,
        default: 'GLOBAL',
        uppercase: true,
        trim: true,
        index: true
    },
    dealerName: {
        type: String,
        required: false,
        default: 'Global System Action',
        trim: true
    },
    batchId: {
        type: String,
        default: null,
        index: true
    },
    action: {
        type: String,
        required: true,
        enum: [
            'status_change',
            'business_type_change',
            'tags_update',
            'industry_change',
            'quick_action_batch',
            'batch_status_change',
            'batch_business_type_change',
            'batch_tags_add',
            'batch_tags_remove',
            'batch_update',
            'hierarchy_set',
            'hierarchy_unlink',
            'hierarchy_dissolve',
            'global_tag_create',
            'global_tag_delete',
            'group_create',
            'group_update',
            'group_delete',
            'group_add_dealers',
            'group_remove_dealers',
            'group_proposal_create',
            'group_proposal_approve',
            'group_proposal_reject',
            'followup_create',
            'followup_complete',
            'followup_delete',
            'contact_create',
            'contact_update',
            'contact_delete'
        ],
        index: true
    },
    user: {
        id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        name: { type: String, default: 'Sales Rep' },
        email: { type: String, default: null }
    },
    previousState: {
        type: mongoose.Schema.Types.Mixed,
        required: false,
        default: null
    },
    newState: {
        type: mongoose.Schema.Types.Mixed,
        required: false,
        default: null
    },
    reason: {
        type: String,
        default: null,
        trim: true
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

module.exports = mongoose.model('AuditLog', auditLogSchema);
