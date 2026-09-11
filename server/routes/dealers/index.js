const express = require('express');
const DealerLocation = require('../../models/DealerLocation');
const DealerProfile = require('../../models/DealerProfile');
const DealerGroup = require('../../models/DealerGroup');
const DailyDealerSnapshot = require('../../models/DailyDealerSnapshot');
const DealerGroupRequest = require('../../models/DealerGroupRequest');
const AuditLog = require('../../models/AuditLog');
const GlobalTag = require('../../models/GlobalTag');
const dealerGroupService = require('../../services/dealerGroupService');
const { requireAuth, requireRole } = require('../../middleware/authMiddleware');
const groupsRouter = require('./groups');
const {
    getSyncStatus,
    syncSingleDealerFromBadger,
    syncAllDealersFromBadger,
    getDealerBadgerActivity,
    updateDealerBadgerNotepad,
    createDealerBadgerCheckin,
    undoBadgerNotepadUpdate,
    undoBadgerCheckin,
    getDealerBadgerAuditLogs
} = require('../../services/badgerSyncService');

const router = express.Router();

// Mount Dealer Groups sub-router
router.use('/groups', groupsRouter);

// ── GET /dealers/dead (Admin: List all dead dealers in graveyard) ──
router.get('/dead', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const deadDealers = await DealerLocation.find({
            systemStatus: { $in: ['closed', 'bought_out', 'no_longer_in_service'] }
        })
        .select('dealerId dealerName statePrefix dealerRepresentative systemStatus systemStatusReason systemStatusChangedAt systemStatusChangedBy dealerPhoneNumber dealerCity dealerState')
        .sort({ systemStatusChangedAt: -1 })
        .lean();

        res.json({
            success: true,
            total: deadDealers.length,
            dealers: deadDealers
        });
    } catch (err) {
        console.error('Error fetching dead dealers:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── POST /dealers/:dealerId/system-status (Flag dealership as dead or active) ──
router.post('/:dealerId/system-status', requireAuth, async (req, res) => {
    try {
        const { dealerId } = req.params;
        const { status, reason } = req.body;

        const validStatuses = ['active', 'closed', 'bought_out', 'no_longer_in_service'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
            });
        }

        const cleanId = dealerId.trim().toUpperCase();
        const changedBy = req.user.name || req.user.email || 'System';

        const updateData = {
            systemStatus: status,
            systemStatusReason: reason || (status === 'active' ? null : 'Manually flagged by sales team'),
            systemStatusChangedAt: new Date(),
            systemStatusChangedBy: changedBy
        };

        const mongoose = require('mongoose');
        const isObjectId = mongoose.Types.ObjectId.isValid(dealerId);
        const matchQuery = isObjectId
            ? { $or: [{ _id: dealerId }, { dealerId: cleanId }, { clientDealerId: cleanId }] }
            : { $or: [{ dealerId: cleanId }, { clientDealerId: cleanId }] };

        const updatedLoc = await DealerLocation.findOneAndUpdate(
            matchQuery,
            { $set: updateData },
            { returnDocument: 'after' }
        );

        if (!updatedLoc) {
            return res.status(404).json({ success: false, message: `Dealer ${cleanId} not found` });
        }

        await DealerProfile.findOneAndUpdate(
            { $or: [{ clientDealerId: cleanId }, { dealerLocation: updatedLoc._id }] },
            { $set: updateData }
        );

        res.json({
            success: true,
            message: `Dealer ${cleanId} status updated to ${status}`,
            dealer: updatedLoc
        });
    } catch (err) {
        console.error('Error updating dealer system status:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── POST /dealers/:dealerId/revive (Admin: Restore dead dealer to active) ──
router.post('/:dealerId/revive', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const { dealerId } = req.params;
        const cleanId = dealerId.trim().toUpperCase();

        const updateData = {
            systemStatus: 'active',
            systemStatusReason: null,
            systemStatusChangedAt: new Date(),
            systemStatusChangedBy: `Revived by ${req.user.name || req.user.email}`
        };

        const mongoose = require('mongoose');
        const isObjectId = mongoose.Types.ObjectId.isValid(dealerId);
        const matchQuery = isObjectId
            ? { $or: [{ _id: dealerId }, { dealerId: cleanId }, { clientDealerId: cleanId }] }
            : { $or: [{ dealerId: cleanId }, { clientDealerId: cleanId }] };

        const updatedLoc = await DealerLocation.findOneAndUpdate(
            matchQuery,
            { $set: updateData },
            { returnDocument: 'after' }
        );

        if (!updatedLoc) {
            return res.status(404).json({ success: false, message: `Dealer ${cleanId} not found` });
        }

        await DealerProfile.findOneAndUpdate(
            { clientDealerId: cleanId },
            { $set: updateData }
        );

        res.json({
            success: true,
            message: `Dealer ${cleanId} revived back to active status`,
            dealer: updatedLoc
        });
    } catch (err) {
        console.error('Error reviving dealer:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── POST /dealers/:dealerId/sync-badger (On-demand sync single dealer from Badger Maps) ──
router.post('/:dealerId/sync-badger', requireAuth, async (req, res) => {
    try {
        const { dealerId } = req.params;
        const result = await syncSingleDealerFromBadger(dealerId);

        res.json({
            success: true,
            message: `Synced contacts for dealer ${dealerId}`,
            data: result
        });
    } catch (err) {
        console.error(`Error syncing dealer ${req.params.dealerId} from Badger:`, err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── POST /dealers/sync-badger-all (Admin: Trigger network-wide Badger Maps sync) ──
router.post('/sync-badger-all', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const status = getSyncStatus();
        if (status.isRunning) {
            return res.json({ success: true, message: 'Sync already running', status });
        }

        // Start in background
        syncAllDealersFromBadger({
            concurrency: 10,
            onProgress: (st) => {
                if (st.processed % 100 === 0) {
                    console.log(`[Badger Sync] ${st.processed}/${st.total} (${st.updated} updated)`);
                }
            }
        }).catch(err => {
            console.error('[Badger Sync Error]:', err);
        });

        res.json({
            success: true,
            message: 'Network-wide Badger Maps sync started in background',
            status: getSyncStatus()
        });
    } catch (err) {
        console.error('Error starting Badger sync:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── GET /dealers/sync-badger-status (Poll sync progress) ──
router.get('/sync-badger-status', requireAuth, async (req, res) => {
    res.json({
        success: true,
        status: getSyncStatus()
    });
});

// ── Valid Check-in Options for Badger Maps ──
const VALID_DISPOSITIONS = [
    'Met with existing contact',
    'Follow up on approvals/stips',
    'Spoke with Sales Manager',
    'Met with new contact',
    'Not able to speak to anyone',
    'Sign up completed',
    'Training completed',
    'Returned phone call'
];

const VALID_FEEDBACK = [
    'Active – Happy',
    'Follow up on approvals/stips',
    'No contact - follow up',
    'Interested in signing up',
    'Terms offered',
    'Not Interested',
    'Approval times',
    'Closing',
    'Interest rates',
    'Funding times',
    'Reserve rates',
    'Lost to competitor',
    'Interested'
];

// ── GET /dealers/:dealerId/badger-activity (Fetch Badger activity for a dealer) ──
router.get('/:dealerId/badger-activity', requireAuth, async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    try {
        const activity = await getDealerBadgerActivity(req.params.dealerId);
        res.json({ success: true, activity });
    } catch (err) {
        console.error(`Error fetching Badger activity for ${req.params.dealerId}:`, err);
        res.status(err.message.includes('not found') ? 404 : 500).json({
            success: false,
            message: err.message
        });
    }
});

// ── POST /dealers/:dealerId/badger-notepad (Update Badger Notepad) ──
router.post('/:dealerId/badger-notepad', requireAuth, async (req, res) => {
    try {
        const { noteText } = req.body;
        if (!noteText || !noteText.trim()) {
            return res.status(400).json({ success: false, message: 'noteText is required' });
        }
        const result = await updateDealerBadgerNotepad(req.params.dealerId, { noteText }, req.user);
        res.json({ success: true, notepad: result.notepad });
    } catch (err) {
        console.error(`Error updating Badger notepad for ${req.params.dealerId}:`, err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── POST /dealers/:dealerId/badger-checkin (Create Badger check-in) ──
router.post('/:dealerId/badger-checkin', requireAuth, async (req, res) => {
    try {
        const { disposition, feedback, notes } = req.body;
        if (!disposition || !VALID_DISPOSITIONS.includes(disposition)) {
            return res.status(400).json({
                success: false,
                message: `Invalid disposition. Must be one of: ${VALID_DISPOSITIONS.join(', ')}`
            });
        }
        if (!feedback || !VALID_FEEDBACK.includes(feedback)) {
            return res.status(400).json({
                success: false,
                message: `Invalid feedback. Must be one of: ${VALID_FEEDBACK.join(', ')}`
            });
        }
        const result = await createDealerBadgerCheckin(req.params.dealerId, { disposition, feedback, notes }, req.user);
        res.status(201).json({
            success: true,
            appointment: result.appointment,
            communicationId: result.communicationId,
            logId: result.logId
        });
    } catch (err) {
        console.error(`Error creating Badger check-in for ${req.params.dealerId}:`, err);
        res.status(err.message.includes('not found') ? 404 : 500).json({
            success: false,
            message: err.message
        });
    }
});

// ── POST /dealers/:dealerId/badger-notepad/undo (Undo last/specified notepad update) ──
router.post('/:dealerId/badger-notepad/undo', requireAuth, async (req, res) => {
    try {
        const { logId } = req.body;
        const result = await undoBadgerNotepadUpdate(req.params.dealerId, logId, req.user);
        res.json(result);
    } catch (err) {
        console.error(`Error reverting Badger notepad for ${req.params.dealerId}:`, err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── POST /dealers/:dealerId/badger-checkin/:appointmentId/undo (Undo/Delete a check-in) ──
router.post('/:dealerId/badger-checkin/:appointmentId/undo', requireAuth, async (req, res) => {
    try {
        const result = await undoBadgerCheckin(req.params.dealerId, req.params.appointmentId, req.user);
        res.json(result);
    } catch (err) {
        console.error(`Error undoing Badger check-in for ${req.params.dealerId}:`, err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── GET /dealers/:dealerId/badger-audit-logs (Fetch audit history of manual updates) ──
router.get('/:dealerId/badger-audit-logs', requireAuth, async (req, res) => {
    try {
        const logs = await getDealerBadgerAuditLogs(req.params.dealerId);
        res.json({ success: true, logs });
    } catch (err) {
        console.error(`Error fetching Badger audit logs for ${req.params.dealerId}:`, err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── GET /dealers/tags (Universal tags catalog with usage counts) ──
router.get('/tags', requireAuth, async (req, res) => {
    try {
        const globalTags = await GlobalTag.find({}).sort({ name: 1 }).lean();
        const tagAgg = await DealerLocation.aggregate([
            { $match: { systemStatus: { $nin: ['closed', 'bought_out', 'no_longer_in_service'] }, tags: { $exists: true, $ne: [] } } },
            { $unwind: '$tags' },
            { $group: { _id: '$tags', count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);

        const countMap = new Map();
        for (const t of (tagAgg || [])) {
            if (t._id && typeof t._id === 'string' && t._id.trim()) {
                countMap.set(t._id.trim().toLowerCase(), {
                    name: t._id.trim(),
                    count: t.count
                });
            }
        }

        const resultMap = new Map();
        // First, add all defined global tags (with count = 0 by default)
        for (const gt of globalTags) {
            const key = gt.name.trim().toLowerCase();
            const existingCount = countMap.get(key)?.count || 0;
            resultMap.set(key, {
                tag: gt.name.trim(),
                count: existingCount,
                color: gt.color || '#38bdf8',
                description: gt.description || '',
                isGlobal: true,
                createdAt: gt.createdAt
            });
        }

        // Second, add any tags that exist on dealers but haven't been registered in GlobalTag yet
        for (const [key, val] of countMap.entries()) {
            if (!resultMap.has(key)) {
                resultMap.set(key, {
                    tag: val.name,
                    count: val.count,
                    color: '#38bdf8',
                    description: '',
                    isGlobal: false
                });
            }
        }

        const tags = Array.from(resultMap.values()).sort((a, b) => a.tag.localeCompare(b.tag, undefined, { sensitivity: 'base' }));

        res.json({ success: true, tags });
    } catch (err) {
        console.error('Error fetching dealer tags:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── POST /dealers/tags (Create a standalone global tag without requiring any dealer assignment) ──
router.post('/tags', requireAuth, async (req, res) => {
    try {
        const { tag, color, description } = req.body;
        if (!tag || typeof tag !== 'string' || !tag.trim()) {
            return res.status(400).json({ success: false, message: 'Tag name is required' });
        }

        const cleanTag = tag.trim();
        if (cleanTag.length > 50) {
            return res.status(400).json({ success: false, message: 'Tag name cannot exceed 50 characters' });
        }

        // Check if already in GlobalTag (case-insensitive)
        let existing = await GlobalTag.findOne({ name: new RegExp('^' + cleanTag + '$', 'i') });
        if (existing) {
            const count = await DealerLocation.countDocuments({
                tags: existing.name,
                systemStatus: { $nin: ['closed', 'bought_out', 'no_longer_in_service'] }
            });
            return res.json({
                success: true,
                alreadyExists: true,
                tag: {
                    tag: existing.name,
                    count,
                    color: existing.color,
                    description: existing.description,
                    isGlobal: true
                }
            });
        }

        const newTag = await GlobalTag.create({
            name: cleanTag,
            color: color || '#38bdf8',
            description: description || '',
            createdBy: req.user?.username || req.user?.email || 'user'
        });

        // Audit log for global tag creation
        const auditLog = await AuditLog.create({
            dealerId: 'GLOBAL',
            dealerName: `Global Tag: ${cleanTag}`,
            action: 'global_tag_create',
            previousState: null,
            newState: {
                tag: cleanTag,
                color: newTag.color,
                description: newTag.description
            },
            changedBy: {
                name: req.user?.name || req.user?.email || 'Sales Rep',
                email: req.user?.email || null
            },
            reason: `Created global tag "${cleanTag}"`
        });

        const currentCount = await DealerLocation.countDocuments({
            tags: cleanTag,
            systemStatus: { $nin: ['closed', 'bought_out', 'no_longer_in_service'] }
        });

        res.status(201).json({
            success: true,
            logId: auditLog._id,
            tag: {
                tag: newTag.name,
                count: currentCount,
                color: newTag.color,
                description: newTag.description,
                isGlobal: true
            }
        });
    } catch (err) {
        console.error('Error creating global tag:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── DELETE /dealers/tags/:tag (Delete global tag, with optional cascade removal from dealers) ──
router.delete('/tags/:tag', requireAuth, async (req, res) => {
    try {
        const cleanTag = decodeURIComponent(req.params.tag).trim();
        if (!cleanTag) {
            return res.status(400).json({ success: false, message: 'Tag name is required' });
        }

        const existingTag = await GlobalTag.findOne({ name: new RegExp('^' + cleanTag + '$', 'i') });
        let affectedDealerKeys = [];
        if (req.query.cascade === 'true') {
            const affectedDealers = await DealerLocation.find({ tags: new RegExp('^' + cleanTag + '$', 'i') }).select('dealerId clientDealerId').lean();
            affectedDealerKeys = affectedDealers.map(d => d.dealerId || d.clientDealerId);
        }

        await GlobalTag.deleteMany({ name: new RegExp('^' + cleanTag + '$', 'i') });

        if (req.query.cascade === 'true') {
            await DealerLocation.updateMany(
                { tags: new RegExp('^' + cleanTag + '$', 'i') },
                { $pull: { tags: cleanTag } }
            );
        }

        const auditLog = await AuditLog.create({
            dealerId: 'GLOBAL',
            dealerName: `Global Tag: ${cleanTag}`,
            action: 'global_tag_delete',
            previousState: {
                tag: cleanTag,
                color: existingTag?.color || '#38bdf8',
                description: existingTag?.description || '',
                affectedDealerKeys
            },
            newState: null,
            changedBy: {
                name: req.user?.name || req.user?.email || 'Sales Rep',
                email: req.user?.email || null
            },
            reason: `Deleted global tag "${cleanTag}"${req.query.cascade === 'true' ? ' with cascade removal' : ''}`
        });

        res.json({ success: true, logId: auditLog._id, message: `Tag "${cleanTag}" removed from catalog` });
    } catch (err) {
        console.error('Error deleting tag:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── PATCH /dealers/:dealerId/quick-action (In-cell quick update for status, type, tags, industry) ──
router.patch('/:dealerId/quick-action', requireAuth, async (req, res) => {
    try {
        const { dealerId } = req.params;
        const { systemStatus, systemStatusReason, businessType, tags, industry } = req.body;

        const cleanId = dealerId.trim().toUpperCase();
        const mongoose = require('mongoose');
        const isObjectId = mongoose.Types.ObjectId.isValid(dealerId);
        const matchQuery = isObjectId
            ? { $or: [{ _id: dealerId }, { dealerId: cleanId }, { clientDealerId: cleanId }] }
            : { $or: [{ dealerId: cleanId }, { clientDealerId: cleanId }] };

        const currentLoc = await DealerLocation.findOne(matchQuery);
        if (!currentLoc) {
            return res.status(404).json({ success: false, message: `Dealer ${cleanId} not found` });
        }

        const previousState = {
            systemStatus: currentLoc.systemStatus || 'active',
            systemStatusReason: currentLoc.systemStatusReason || null,
            businessType: currentLoc.businessType || null,
            tags: currentLoc.tags || [],
            industry: currentLoc.industry || null,
            isManuallyClassified: currentLoc.isManuallyClassified || false
        };

        const updateData = {
            isManuallyClassified: true
        };
        const newState = { ...previousState, isManuallyClassified: true };

        if (systemStatus !== undefined) {
            const validStatuses = ['active', 'closed', 'bought_out', 'no_longer_in_service'];
            if (!validStatuses.includes(systemStatus)) {
                return res.status(400).json({ success: false, message: `Invalid systemStatus: ${systemStatus}` });
            }
            updateData.systemStatus = systemStatus;
            updateData.systemStatusReason = systemStatusReason !== undefined ? systemStatusReason : currentLoc.systemStatusReason;
            updateData.systemStatusChangedAt = new Date();
            updateData.systemStatusChangedBy = req.user?.name || req.user?.email || 'Sales Rep';
            newState.systemStatus = updateData.systemStatus;
            newState.systemStatusReason = updateData.systemStatusReason;
        }

        if (businessType !== undefined) {
            const validTypes = ['franchise', 'non-franchise', 'broker', null, ''];
            if (!validTypes.includes(businessType)) {
                return res.status(400).json({ success: false, message: `Invalid businessType: ${businessType}` });
            }
            updateData.businessType = businessType || null;
            newState.businessType = updateData.businessType;
        }

        if (tags !== undefined) {
            if (!Array.isArray(tags)) {
                return res.status(400).json({ success: false, message: 'tags must be an array of strings' });
            }
            const cleanTags = Array.from(new Set(tags.map(t => String(t).trim()).filter(Boolean)));
            updateData.tags = cleanTags;
            newState.tags = cleanTags;
        }

        if (industry !== undefined) {
            const validIndustries = ['rv', 'marine', 'both', null, ''];
            if (!validIndustries.includes(industry)) {
                return res.status(400).json({ success: false, message: `Invalid industry: ${industry}` });
            }
            updateData.industry = industry || null;
            newState.industry = updateData.industry;
        }

        const updatedLoc = await DealerLocation.findOneAndUpdate(
            matchQuery,
            { $set: updateData },
            { returnDocument: 'after' }
        );

        await DealerProfile.findOneAndUpdate(
            { $or: [{ clientDealerId: cleanId }, { dealerLocation: updatedLoc._id }] },
            { $set: updateData }
        );

        let action = 'quick_action_batch';
        if (systemStatus !== undefined && businessType === undefined && tags === undefined && industry === undefined) {
            action = 'status_change';
        } else if (businessType !== undefined && systemStatus === undefined && tags === undefined && industry === undefined) {
            action = 'business_type_change';
        } else if (tags !== undefined && systemStatus === undefined && businessType === undefined && industry === undefined) {
            action = 'tags_update';
        } else if (industry !== undefined && systemStatus === undefined && businessType === undefined && tags === undefined) {
            action = 'industry_change';
        }

        const auditLog = await AuditLog.create({
            dealerId: updatedLoc.clientDealerId || updatedLoc.dealerId,
            dealerName: updatedLoc.dealerName,
            action,
            user: {
                id: req.user?._id || null,
                name: req.user?.name || req.user?.email || 'Sales Rep',
                email: req.user?.email || null
            },
            previousState,
            newState,
            reason: systemStatusReason || null
        });

        res.json({
            success: true,
            dealer: updatedLoc,
            logId: auditLog._id,
            message: `Updated ${updatedLoc.dealerName}`
        });
    } catch (err) {
        console.error('Error in quick-action update:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── GET /dealers/audit-history (System-wide activity log of all manual operations with undo) ──
router.get('/audit-history', requireAuth, async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
        const skip = (page - 1) * limit;

        const { action, search, showUndone } = req.query;
        let query = {};

        if (action && action !== 'all') {
            if (action === 'status') {
                query.action = { $in: ['status_change', 'batch_status_change'] };
            } else if (action === 'business_type') {
                query.action = { $in: ['business_type_change', 'batch_business_type_change'] };
            } else if (action === 'tags') {
                query.action = { $in: ['tags_update', 'batch_tags_add', 'batch_tags_remove', 'global_tag_create', 'global_tag_delete'] };
            } else if (action === 'hierarchy') {
                query.action = { $in: ['hierarchy_set', 'hierarchy_unlink', 'hierarchy_dissolve'] };
            } else if (action === 'batch') {
                query.action = { $regex: '^batch_' };
            } else if (action === 'group') {
                query.action = { $regex: '^group_' };
            } else {
                query.action = action;
            }
        }

        if (search) {
            const regex = new RegExp(String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            query.$or = [
                { dealerName: regex },
                { dealerId: regex },
                { reason: regex },
                { 'changedBy.name': regex },
                { 'user.name': regex }
            ];
        }

        if (showUndone === 'false') {
            query.isUndone = false;
        }

        const total = await AuditLog.countDocuments(query);
        const rawLogs = await AuditLog.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        // Consolidate any legacy multi-entry batch records sharing a batchId into 1 entry
        const consolidatedLogs = [];
        const seenBatches = new Map();

        for (const log of rawLogs) {
            if (log.batchId && log.dealerId !== 'BULK') {
                if (seenBatches.has(log.batchId)) {
                    const existing = consolidatedLogs[seenBatches.get(log.batchId)];
                    if (!existing.previousState) existing.previousState = {};
                    if (!existing.previousState.dealers) {
                        existing.previousState.dealers = [];
                    }
                    existing.previousState.dealers.push({
                        dealerId: log.dealerId,
                        dealerName: log.dealerName,
                        previous: log.previousState
                    });
                    existing.previousState.affectedCount = existing.previousState.dealers.length;
                    existing.dealerName = `${existing.previousState.affectedCount} Dealerships`;
                    if (!log.isUndone) existing.isUndone = false;
                } else {
                    const cloned = {
                        ...log,
                        dealerId: 'BULK',
                        dealerName: '1 Dealership',
                        previousState: {
                            affectedCount: 1,
                            dealers: [{
                                dealerId: log.dealerId,
                                dealerName: log.dealerName,
                                previous: log.previousState
                            }]
                        }
                    };
                    seenBatches.set(log.batchId, consolidatedLogs.length);
                    consolidatedLogs.push(cloned);
                }
            } else {
                consolidatedLogs.push(log);
            }
        }

        res.json({
            success: true,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            logs: consolidatedLogs
        });
    } catch (err) {
        console.error('Error fetching system audit history:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── POST /dealers/audit-history/:logId/undo (Revert a change from AuditLog) ──
router.post('/audit-history/:logId/undo', requireAuth, async (req, res) => {
    try {
        const { logId } = req.params;
        const log = await AuditLog.findById(logId);
        if (!log) {
            return res.status(404).json({ success: false, message: 'Audit log entry not found' });
        }
        if (log.isUndone) {
            return res.status(400).json({ success: false, message: 'This change has already been undone' });
        }

        const prev = log.previousState;
        let updatedLoc = null;

        if (log.action === 'hierarchy_set') {
            const childId = log.dealerId.trim().toUpperCase();
            const child = await DealerLocation.findOne({
                $or: [{ dealerId: childId }, { clientDealerId: childId }]
            });
            if (child) {
                child.fundingParent = prev.fundingParent || null;
                child.isFundingParent = prev.isFundingParent || false;
                await child.save();
                if (log.metadata?.parentId) {
                    const parent = await DealerLocation.findById(log.metadata.parentId);
                    if (parent) {
                        parent.fundingChildren = (parent.fundingChildren || []).filter(id => id.toString() !== child._id.toString());
                        if (parent.fundingChildren.length === 0) {
                            parent.isFundingParent = false;
                        }
                        await parent.save();
                    }
                }
                updatedLoc = child;
            }
        } else if (log.action === 'hierarchy_unlink') {
            const childId = log.dealerId.trim().toUpperCase();
            const child = await DealerLocation.findOne({
                $or: [{ dealerId: childId }, { clientDealerId: childId }]
            });
            if (child && prev.fundingParent) {
                child.fundingParent = prev.fundingParent;
                await child.save();
                const parent = await DealerLocation.findById(prev.fundingParent);
                if (parent) {
                    parent.isFundingParent = true;
                    if (!parent.fundingChildren.some(id => id.toString() === child._id.toString())) {
                        parent.fundingChildren.push(child._id);
                    }
                    await parent.save();
                }
                updatedLoc = child;
            }
        } else if (log.action === 'hierarchy_dissolve') {
            const parentId = log.dealerId.trim().toUpperCase();
            const parent = await DealerLocation.findOne({
                $or: [{ dealerId: parentId }, { clientDealerId: parentId }]
            });
            if (parent && prev.fundingChildren?.length > 0) {
                parent.isFundingParent = true;
                parent.fundingChildren = prev.fundingChildren;
                await parent.save();
                await DealerLocation.updateMany(
                    { _id: { $in: prev.fundingChildren } },
                    { $set: { fundingParent: parent._id } }
                );
                updatedLoc = parent;
            }
        } else if (log.action === 'global_tag_create') {
            const tagName = log.newState?.tag;
            if (tagName) {
                await GlobalTag.deleteMany({ name: new RegExp('^' + tagName + '$', 'i') });
            }
            updatedLoc = { name: tagName, undone: true };
        } else if (log.action === 'global_tag_delete') {
            const prev = log.previousState;
            if (prev?.tag) {
                await GlobalTag.findOneAndUpdate(
                    { name: prev.tag },
                    { $set: { name: prev.tag, color: prev.color || '#38bdf8', description: prev.description || '' } },
                    { upsert: true }
                );
                if (prev.affectedDealerKeys?.length > 0) {
                    await DealerLocation.updateMany(
                        { $or: [{ dealerId: { $in: prev.affectedDealerKeys } }, { clientDealerId: { $in: prev.affectedDealerKeys } }] },
                        { $addToSet: { tags: prev.tag } }
                    );
                }
            }
            updatedLoc = { name: prev?.tag, restored: true };
        } else if (log.action === 'group_add_dealers') {
            // Rollback added dealers: restore each dealership to its previous group
            if (prev?.previousMemberships && Array.isArray(prev.previousMemberships)) {
                for (const m of prev.previousMemberships) {
                    await DealerLocation.updateOne(
                        { _id: m.dealerLocationId },
                        { $set: { dealerGroup: m.previousGroupId || null, dealerGroupName: m.previousGroupName || null } }
                    );
                    await DailyDealerSnapshot.updateMany(
                        { dealerLocation: m.dealerLocationId },
                        { $set: { dealerGroup: m.previousGroupId || null } }
                    );
                }
                const affectedIds = [prev.groupId, ...prev.previousMemberships.map(m => m.previousGroupId).filter(Boolean)];
                await dealerGroupService.recalculateGroupCounts(affectedIds);
            }
            updatedLoc = { group: prev?.groupName, undone: true };
        } else if (log.action === 'group_remove_dealers') {
            // Rollback removed dealers: restore original dealerGroup
            if (prev?.removedDealers && Array.isArray(prev.removedDealers)) {
                for (const m of prev.removedDealers) {
                    await DealerLocation.updateOne(
                        { _id: m.dealerLocationId },
                        { $set: { dealerGroup: m.previousGroupId, dealerGroupName: m.previousGroupName || null } }
                    );
                    await DailyDealerSnapshot.updateMany(
                        { dealerLocation: m.dealerLocationId },
                        { $set: { dealerGroup: m.previousGroupId } }
                    );
                }
                const affectedIds = prev.removedDealers.map(m => m.previousGroupId).filter(Boolean);
                await dealerGroupService.recalculateGroupCounts(affectedIds);
            }
            updatedLoc = { group: 'Unassigned restored', undone: true };
        } else if (log.action === 'group_create') {
            // Rollback created group: unlink members and delete group
            const groupId = log.newState?.groupId;
            if (groupId) {
                await DealerLocation.updateMany({ dealerGroup: groupId }, { $set: { dealerGroup: null, dealerGroupName: null } });
                await DailyDealerSnapshot.updateMany({ dealerGroup: groupId }, { $set: { dealerGroup: null } });
                await DealerGroup.deleteOne({ _id: groupId });
            }
            updatedLoc = { group: log.newState?.name, undone: true };
        } else if (log.action === 'group_update') {
            // Rollback updated group: restore previous name and description
            const groupId = log.newState?.groupId || log.previousState?.groupId;
            if (groupId && prev) {
                await DealerGroup.updateOne(
                    { _id: groupId },
                    { $set: { name: prev.name, description: prev.description || '' } }
                );
                await DealerLocation.updateMany({ dealerGroup: groupId }, { $set: { dealerGroupName: prev.name } });
            }
            updatedLoc = { group: prev?.name, undone: true };
        } else if (log.action === 'group_delete') {
            // Rollback deleted group: recreate group document and restore member assignments
            if (prev?.groupId) {
                await DealerGroup.create({
                    _id: prev.groupId,
                    name: prev.name,
                    slug: prev.slug,
                    isCustom: prev.isCustom ?? true,
                    description: prev.description || '',
                    dealerCount: (prev.memberIds || []).length
                });
                if (prev.memberIds?.length > 0) {
                    await DealerLocation.updateMany(
                        { _id: { $in: prev.memberIds } },
                        { $set: { dealerGroup: prev.groupId, dealerGroupName: prev.name } }
                    );
                    await DailyDealerSnapshot.updateMany(
                        { dealerLocation: { $in: prev.memberIds } },
                        { $set: { dealerGroup: prev.groupId } }
                    );
                }
            }
            updatedLoc = { group: prev?.name, restored: true };
        } else if (log.action === 'group_proposal_approve') {
            // Rollback proposal approval: revert approved dealerships to their prior group state
            const proposal = await DealerGroupRequest.findById(log.newState?.requestId || log.previousState?.requestId);
            if (proposal) {
                proposal.status = 'pending';
                proposal.reviewedBy = null;
                proposal.reviewerName = null;
                proposal.reviewedAt = null;
                proposal.reviewNote = 'Approval undone by administrator';
                proposal.dealers.forEach(d => { d.status = 'pending'; });
                await proposal.save();
            }
            if (log.newState?.dealers && Array.isArray(log.newState.dealers)) {
                const affectedGroupIds = new Set();
                for (const d of log.newState.dealers) {
                    if (d.status === 'approved') {
                        if (d.action === 'add') {
                            await DealerLocation.updateOne(
                                { _id: d.dealerLocation },
                                { $set: { dealerGroup: d.currentGroupId || null, dealerGroupName: d.currentGroupName || null } }
                            );
                            await DailyDealerSnapshot.updateMany(
                                { dealerLocation: d.dealerLocation },
                                { $set: { dealerGroup: d.currentGroupId || null } }
                            );
                            affectedGroupIds.add(log.newState.groupId?.toString());
                            if (d.currentGroupId) affectedGroupIds.add(d.currentGroupId.toString());
                        } else if (d.action === 'remove') {
                            await DealerLocation.updateOne(
                                { _id: d.dealerLocation },
                                { $set: { dealerGroup: log.newState.groupId, dealerGroupName: log.newState.groupName } }
                            );
                            await DailyDealerSnapshot.updateMany(
                                { dealerLocation: d.dealerLocation },
                                { $set: { dealerGroup: log.newState.groupId } }
                            );
                            affectedGroupIds.add(log.newState.groupId?.toString());
                        }
                    }
                }
                await dealerGroupService.recalculateGroupCounts(Array.from(affectedGroupIds));
            }
            updatedLoc = { proposal: log.newState?.groupName, undone: true };
        } else if (log.action.startsWith('batch_') || (log.previousState?.dealers && Array.isArray(log.previousState.dealers))) {
            const dealersList = log.previousState?.dealers || [];
            const revertedList = [];
            for (const item of dealersList) {
                const prev = item.previous;
                if (!prev) continue;
                const revertData = {
                    systemStatus: prev.systemStatus || 'active',
                    systemStatusReason: prev.systemStatusReason || null,
                    businessType: prev.businessType || null,
                    tags: prev.tags || [],
                    isManuallyClassified: prev.isManuallyClassified || false
                };
                const cleanId = item.dealerId ? item.dealerId.trim().toUpperCase() : null;
                const matchConditions = [];
                if (item.dealerLocationId) matchConditions.push({ _id: item.dealerLocationId });
                if (cleanId) {
                    matchConditions.push({ dealerId: cleanId });
                    matchConditions.push({ clientDealerId: cleanId });
                }
                const updated = await DealerLocation.findOneAndUpdate(
                    { $or: matchConditions },
                    { $set: revertData },
                    { returnDocument: 'after' }
                );
                if (updated) {
                    await DealerProfile.findOneAndUpdate(
                        { $or: [{ clientDealerId: cleanId }, { dealerLocation: updated._id }] },
                        { $set: revertData }
                    );
                    revertedList.push(updated);
                }
            }

            // If there's a batchId, ensure any legacy sibling records are also marked undone
            if (log.batchId) {
                const siblingLogs = await AuditLog.find({ batchId: log.batchId, _id: { $ne: log._id }, isUndone: false });
                for (const sib of siblingLogs) {
                    const sPrev = sib.previousState;
                    if (sPrev) {
                        const sRevert = {
                            systemStatus: sPrev.systemStatus || 'active',
                            systemStatusReason: sPrev.systemStatusReason || null,
                            businessType: sPrev.businessType || null,
                            tags: sPrev.tags || [],
                            isManuallyClassified: sPrev.isManuallyClassified || false
                        };
                        const sClean = sib.dealerId.trim().toUpperCase();
                        const sUpd = await DealerLocation.findOneAndUpdate(
                            { $or: [{ dealerId: sClean }, { clientDealerId: sClean }] },
                            { $set: sRevert },
                            { returnDocument: 'after' }
                        );
                        if (sUpd) {
                            await DealerProfile.findOneAndUpdate(
                                { $or: [{ clientDealerId: sClean }, { dealerLocation: sUpd._id }] },
                                { $set: sRevert }
                            );
                        }
                    }
                    sib.isUndone = true;
                    sib.undoneAt = new Date();
                    sib.undoneBy = { name: req.user?.name || req.user?.email || 'Sales Rep', email: req.user?.email || null };
                    await sib.save();
                }
            }

            updatedLoc = { bulk: true, revertedCount: revertedList.length || dealersList.length, dealerName: log.dealerName };
        } else {
            const revertData = {
                systemStatus: prev.systemStatus || 'active',
                systemStatusReason: prev.systemStatusReason || null,
                businessType: prev.businessType || null,
                tags: prev.tags || [],
                industry: prev.industry || null,
                isManuallyClassified: prev.isManuallyClassified || false
            };

            const cleanId = log.dealerId.trim().toUpperCase();
            updatedLoc = await DealerLocation.findOneAndUpdate(
                { $or: [{ dealerId: cleanId }, { clientDealerId: cleanId }] },
                { $set: revertData },
                { returnDocument: 'after' }
            );

            if (updatedLoc) {
                await DealerProfile.findOneAndUpdate(
                    { $or: [{ clientDealerId: cleanId }, { dealerLocation: updatedLoc._id }] },
                    { $set: revertData }
                );
            }
        }

        log.isUndone = true;
        log.undoneAt = new Date();
        log.undoneBy = {
            name: req.user?.name || req.user?.email || 'Sales Rep',
            email: req.user?.email || null
        };
        await log.save();

        res.json({
            success: true,
            revertedDealer: updatedLoc || prev,
            message: `Reverted changes for ${log.dealerName}`
        });
    } catch (err) {
        console.error('Error undoing audit log:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── POST /dealers/batch-action (Bulk Operations for selected dealers) ──
router.post('/batch-action', requireAuth, async (req, res) => {
    try {
        const { dealerIds, selectAllMatching, filterQuery, action, payload } = req.body;
        if (!selectAllMatching && (!Array.isArray(dealerIds) || dealerIds.length === 0)) {
            return res.status(400).json({ success: false, message: 'dealerIds must be a non-empty array when not selecting all matching' });
        }
        if (!['add_tags', 'remove_tags', 'set_business_type', 'set_status'].includes(action)) {
            return res.status(400).json({ success: false, message: `Invalid batch action: ${action}` });
        }

        const crypto = require('crypto');
        const mongoose = require('mongoose');
        const batchId = `batch_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

        let matchQuery = {};
        if (selectAllMatching && filterQuery) {
            if (filterQuery.scope !== 'all') {
                matchQuery.dealerGroup = null;
            }
            if (filterQuery.state || filterQuery.states) {
                const rawStates = filterQuery.state || filterQuery.states;
                const sList = Array.isArray(rawStates)
                    ? rawStates.map(s => s.trim().toUpperCase())
                    : String(rawStates).split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
                if (sList.length > 0) matchQuery.statePrefix = { $in: sList };
            }
            if (filterQuery.rep) {
                const { getRepHandles } = require('../../utils/repAliases');
                const handles = getRepHandles(filterQuery.rep);
                const handleRegexes = handles.map(h => new RegExp('^' + h + '$', 'i'));
                matchQuery.dealerRepresentative = { $in: handleRegexes };
            }
            if (filterQuery.businessType) {
                matchQuery.businessType = filterQuery.businessType;
            }
            const tList = filterQuery.tags && filterQuery.tags.length > 0
                ? (Array.isArray(filterQuery.tags) ? filterQuery.tags : String(filterQuery.tags).split(',').map(t => t.trim()).filter(Boolean))
                : null;
            const exList = filterQuery.excludeTags && filterQuery.excludeTags.length > 0
                ? (Array.isArray(filterQuery.excludeTags) ? filterQuery.excludeTags : String(filterQuery.excludeTags).split(',').map(t => t.trim()).filter(Boolean))
                : null;
            if (tList && tList.length > 0 && exList && exList.length > 0) {
                matchQuery.tags = { $in: tList, $nin: exList };
            } else if (tList && tList.length > 0) {
                matchQuery.tags = { $in: tList };
            } else if (exList && exList.length > 0) {
                matchQuery.tags = { $nin: exList };
            }
            if (filterQuery.search) {
                matchQuery.dealerName = { $regex: String(filterQuery.search).trim(), $options: 'i' };
            }
            if (filterQuery.status) {
                matchQuery['latestSnapshot.activityStatus'] = filterQuery.status;
            }
        } else {
            // Resolve clean IDs and ObjectIds
            const cleanIds = (dealerIds || []).map(id => String(id).trim().toUpperCase());
            const objectIds = (dealerIds || []).filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));

            matchQuery = {
                $or: [
                    { _id: { $in: objectIds } },
                    { dealerId: { $in: cleanIds } },
                    { clientDealerId: { $in: cleanIds } }
                ]
            };
        }

        const targetLocations = await DealerLocation.find(matchQuery);
        if (targetLocations.length === 0) {
            return res.status(404).json({ success: false, message: 'No matching dealers found for batch action' });
        }

        const auditRecords = [];
        const userSummary = {
            id: req.user?._id || null,
            name: req.user?.name || req.user?.email || 'Sales Rep',
            email: req.user?.email || null
        };

        const updatedDealers = [];

        for (const loc of targetLocations) {
            const prev = {
                systemStatus: loc.systemStatus || 'active',
                systemStatusReason: loc.systemStatusReason || null,
                businessType: loc.businessType || null,
                tags: loc.tags || [],
                isManuallyClassified: loc.isManuallyClassified || false
            };
            const next = { ...prev, isManuallyClassified: true };

            if (action === 'add_tags') {
                const tagsToAdd = (payload?.tags || []).map(t => String(t).trim()).filter(Boolean);
                const mergedTags = Array.from(new Set([...(loc.tags || []), ...tagsToAdd]));
                loc.tags = mergedTags;
                loc.isManuallyClassified = true;
                next.tags = mergedTags;
            } else if (action === 'remove_tags') {
                const tagsToRemove = new Set((payload?.tags || []).map(t => String(t).trim().toLowerCase()));
                const filteredTags = (loc.tags || []).filter(t => !tagsToRemove.has(String(t).toLowerCase()));
                loc.tags = filteredTags;
                loc.isManuallyClassified = true;
                next.tags = filteredTags;
            } else if (action === 'set_business_type') {
                const bt = payload?.businessType || null;
                loc.businessType = bt;
                loc.isManuallyClassified = true;
                next.businessType = bt;
            } else if (action === 'set_status') {
                const st = payload?.systemStatus || 'active';
                loc.systemStatus = st;
                loc.systemStatusReason = st === 'active' ? null : (payload?.systemStatusReason?.trim() || null);
                loc.systemStatusChangedAt = new Date();
                loc.systemStatusChangedBy = userSummary.name;
                loc.isManuallyClassified = true;
                next.systemStatus = loc.systemStatus;
                next.systemStatusReason = loc.systemStatusReason;
            }

            await loc.save();
            updatedDealers.push(loc);

            // Sync with DealerProfile
            const locKey = loc.clientDealerId || loc.dealerId;
            const profileUpdate = {
                businessType: loc.businessType,
                tags: loc.tags,
                systemStatus: loc.systemStatus,
                systemStatusReason: loc.systemStatusReason,
                isManuallyClassified: true
            };
            await DealerProfile.findOneAndUpdate(
                { $or: [{ clientDealerId: locKey }, { dealerLocation: loc._id }] },
                { $set: profileUpdate }
            );

            auditRecords.push({
                dealerLocationId: loc._id,
                dealerId: loc.clientDealerId || loc.dealerId,
                dealerName: loc.dealerName,
                previousState: prev,
                newState: next
            });
        }

        let batchAuditLog = null;
        if (targetLocations.length > 0) {
            const batchAuditAction = action === 'add_tags' ? 'batch_tags_add'
                : action === 'remove_tags' ? 'batch_tags_remove'
                : action === 'set_business_type' ? 'batch_business_type_change'
                : 'batch_status_change';

            const payloadSummary = action === 'add_tags' ? `Added tags: ${(payload?.tags || []).join(', ')}`
                : action === 'remove_tags' ? `Removed tags: ${(payload?.tags || []).join(', ')}`
                : action === 'set_business_type' ? `Set type to ${payload?.businessType || 'none'}`
                : `Set status to ${payload?.systemStatus || 'active'}`;

            batchAuditLog = await AuditLog.create({
                dealerId: 'BULK',
                dealerName: `${targetLocations.length} Dealerships`,
                batchId,
                action: batchAuditAction,
                user: userSummary,
                previousState: {
                    affectedCount: targetLocations.length,
                    dealers: auditRecords.map(r => ({
                        dealerLocationId: r.dealerLocationId,
                        dealerId: r.dealerId,
                        dealerName: r.dealerName,
                        previous: r.previousState
                    }))
                },
                newState: {
                    action,
                    payload,
                    affectedCount: targetLocations.length,
                    sampleDealers: targetLocations.slice(0, 5).map(l => l.dealerName || l.dealerId)
                },
                reason: payload?.systemStatusReason || payloadSummary
            });
        }

        res.json({
            success: true,
            updatedCount: targetLocations.length,
            batchId,
            updatedDealers,
            message: `Updated ${targetLocations.length} dealers in batch`
        });
    } catch (err) {
        console.error('Error in batch action:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── POST /dealers/batch-action/:batchId/undo (Undo a full batch operation) ──
router.post('/batch-action/:batchId/undo', requireAuth, async (req, res) => {
    try {
        const { batchId } = req.params;
        const logs = await AuditLog.find({ batchId, isUndone: false });
        if (!logs || logs.length === 0) {
            return res.status(404).json({ success: false, message: 'No reversible batch operations found for this ID' });
        }

        const revertedDealers = [];
        const undoTime = new Date();
        const undoUser = {
            name: req.user?.name || req.user?.email || 'Sales Rep',
            email: req.user?.email || null
        };

        for (const log of logs) {
            if (log.previousState?.dealers && Array.isArray(log.previousState.dealers)) {
                for (const item of log.previousState.dealers) {
                    const prev = item.previous;
                    if (!prev) continue;
                    const revertData = {
                        systemStatus: prev.systemStatus || 'active',
                        systemStatusReason: prev.systemStatusReason || null,
                        businessType: prev.businessType || null,
                        tags: prev.tags || [],
                        isManuallyClassified: prev.isManuallyClassified || false
                    };
                    const cleanId = item.dealerId ? item.dealerId.trim().toUpperCase() : null;
                    const matchConditions = [];
                    if (item.dealerLocationId) matchConditions.push({ _id: item.dealerLocationId });
                    if (cleanId) {
                        matchConditions.push({ dealerId: cleanId });
                        matchConditions.push({ clientDealerId: cleanId });
                    }
                    const updatedLoc = await DealerLocation.findOneAndUpdate(
                        { $or: matchConditions },
                        { $set: revertData },
                        { returnDocument: 'after' }
                    );
                    if (updatedLoc) {
                        await DealerProfile.findOneAndUpdate(
                            { $or: [{ clientDealerId: cleanId }, { dealerLocation: updatedLoc._id }] },
                            { $set: revertData }
                        );
                        revertedDealers.push(updatedLoc);
                    }
                }
            } else {
                const prev = log.previousState;
                if (prev) {
                    const revertData = {
                        systemStatus: prev.systemStatus || 'active',
                        systemStatusReason: prev.systemStatusReason || null,
                        businessType: prev.businessType || null,
                        tags: prev.tags || [],
                        isManuallyClassified: prev.isManuallyClassified || false
                    };

                    const cleanId = log.dealerId.trim().toUpperCase();
                    const updatedLoc = await DealerLocation.findOneAndUpdate(
                        { $or: [{ dealerId: cleanId }, { clientDealerId: cleanId }] },
                        { $set: revertData },
                        { returnDocument: 'after' }
                    );

                    if (updatedLoc) {
                        await DealerProfile.findOneAndUpdate(
                            { $or: [{ clientDealerId: cleanId }, { dealerLocation: updatedLoc._id }] },
                            { $set: revertData }
                        );
                        revertedDealers.push(updatedLoc);
                    }
                }
            }

            log.isUndone = true;
            log.undoneAt = undoTime;
            log.undoneBy = undoUser;
            await log.save();
        }

        res.json({
            success: true,
            revertedCount: revertedDealers.length,
            revertedDealers,
            message: `Reverted batch action for ${revertedDealers.length} dealers`
        });
    } catch (err) {
        console.error('Error undoing batch action:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── POST /dealers/hierarchy/set-parent (Designate parent and link satellite child stores) ──
router.post('/hierarchy/set-parent', requireAuth, async (req, res) => {
    try {
        const { parentId, childIds } = req.body;
        if (!parentId) {
            return res.status(400).json({ success: false, message: 'parentId is required' });
        }
        if (!Array.isArray(childIds) || childIds.length === 0) {
            return res.status(400).json({ success: false, message: 'childIds must be a non-empty array' });
        }

        const mongoose = require('mongoose');
        const user = {
            name: req.user?.name || req.user?.email || 'Sales Rep',
            email: req.user?.email || null
        };

        // Find parent location
        const parentQuery = mongoose.Types.ObjectId.isValid(parentId) ? { _id: parentId } : {
            $or: [
                { dealerId: String(parentId).trim().toUpperCase() },
                { clientDealerId: String(parentId).trim().toUpperCase() }
            ]
        };
        const parent = await DealerLocation.findOne(parentQuery);
        if (!parent) {
            return res.status(404).json({ success: false, message: 'Parent dealer location not found' });
        }

        // Parent cannot be a satellite of another parent
        if (parent.fundingParent) {
            return res.status(400).json({
                success: false,
                message: 'This dealership is already a satellite of another Central Funder and cannot be designated as a parent.'
            });
        }

        // Resolve child locations
        const childQueries = childIds.map(cid => {
            if (mongoose.Types.ObjectId.isValid(cid)) {
                return { _id: cid };
            }
            const clean = String(cid).trim().toUpperCase();
            return { $or: [{ dealerId: clean }, { clientDealerId: clean }] };
        });

        const children = await DealerLocation.find({ $or: childQueries });
        if (children.length === 0) {
            return res.status(404).json({ success: false, message: 'No valid child dealer locations found' });
        }

        // Ensure parent is not in children
        const parentIdStr = parent._id.toString();
        const invalidSelf = children.find(c => c._id.toString() === parentIdStr);
        if (invalidSelf) {
            return res.status(400).json({ success: false, message: 'Parent dealership cannot be linked to itself as a satellite store' });
        }

        // Ensure children are not parents themselves
        const invalidChildParent = children.find(c => c.isFundingParent && c.fundingChildren?.length > 0);
        if (invalidChildParent) {
            return res.status(400).json({
                success: false,
                message: `Dealership "${invalidChildParent.dealerName}" is already a Central Funder with satellites. Dissolve its satellites first before making it a satellite.`
            });
        }

        const crypto = require('crypto');
        const batchId = `hier_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const updatedChildren = [];

        for (const child of children) {
            const prevParentId = child.fundingParent ? child.fundingParent.toString() : null;
            // If child was previously linked to a different parent, remove from that parent
            if (prevParentId && prevParentId !== parentIdStr) {
                await DealerLocation.findByIdAndUpdate(prevParentId, {
                    $pull: { fundingChildren: child._id }
                });
                const oldParent = await DealerLocation.findById(prevParentId);
                if (oldParent && (!oldParent.fundingChildren || oldParent.fundingChildren.length === 0)) {
                    oldParent.isFundingParent = false;
                    await oldParent.save();
                }
            }

            // Create audit log for child
            await AuditLog.create({
                dealerId: child.dealerId || child.clientDealerId || child._id.toString(),
                dealerName: child.dealerName,
                batchId,
                action: 'hierarchy_set',
                previousState: {
                    fundingParent: child.fundingParent,
                    isFundingParent: child.isFundingParent
                },
                newState: {
                    fundingParent: parent._id,
                    isFundingParent: false
                },
                metadata: {
                    parentId: parent._id,
                    parentName: parent.dealerName,
                    parentDealerId: parent.dealerId || parent.clientDealerId
                },
                changedBy: user,
                reason: `Linked as satellite store to Central Funder "${parent.dealerName}"`
            });

            child.fundingParent = parent._id;
            child.isFundingParent = false;
            await child.save();
            updatedChildren.push(child);
        }

        // Add children to parent
        const childObjectIds = updatedChildren.map(c => c._id);
        const existingChildren = (parent.fundingChildren || []).map(id => id.toString());
        const combinedChildren = Array.from(new Set([...existingChildren, ...childObjectIds.map(id => id.toString())]));

        parent.isFundingParent = true;
        parent.fundingChildren = combinedChildren;
        await parent.save();

        // Populate parent's children for response
        const populatedParent = await DealerLocation.findById(parent._id)
            .populate({
                path: 'fundingChildren',
                select: '_id dealerId clientDealerId dealerName dealerCity dealerState statePrefix dealerRepresentative systemStatus businessType tags'
            })
            .lean();

        res.json({
            success: true,
            parent: populatedParent,
            linkedCount: updatedChildren.length,
            batchId,
            message: `Successfully linked ${updatedChildren.length} store(s) to ${parent.dealerName}`
        });
    } catch (err) {
        console.error('Error setting funding hierarchy:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── POST /dealers/hierarchy/unlink-child (Detach a single satellite store from its parent) ──
router.post('/hierarchy/unlink-child', requireAuth, async (req, res) => {
    try {
        const { childId } = req.body;
        if (!childId) {
            return res.status(400).json({ success: false, message: 'childId is required' });
        }

        const mongoose = require('mongoose');
        const user = {
            name: req.user?.name || req.user?.email || 'Sales Rep',
            email: req.user?.email || null
        };

        const childQuery = mongoose.Types.ObjectId.isValid(childId) ? { _id: childId } : {
            $or: [
                { dealerId: String(childId).trim().toUpperCase() },
                { clientDealerId: String(childId).trim().toUpperCase() }
            ]
        };
        const child = await DealerLocation.findOne(childQuery);
        if (!child) {
            return res.status(404).json({ success: false, message: 'Child dealer location not found' });
        }

        if (!child.fundingParent) {
            return res.status(400).json({ success: false, message: 'Dealer is not linked to any funding parent' });
        }

        const parentId = child.fundingParent;
        const parent = await DealerLocation.findById(parentId);

        // Audit log
        await AuditLog.create({
            dealerId: child.dealerId || child.clientDealerId || child._id.toString(),
            dealerName: child.dealerName,
            action: 'hierarchy_unlink',
            previousState: {
                fundingParent: parentId,
                parentName: parent?.dealerName || 'Unknown Parent'
            },
            newState: {
                fundingParent: null
            },
            metadata: {
                parentId,
                parentName: parent?.dealerName || 'Unknown Parent'
            },
            changedBy: user,
            reason: `Unlinked satellite store from Central Funder "${parent?.dealerName || ''}"`
        });

        // Detach child
        child.fundingParent = null;
        await child.save();

        // Update parent
        if (parent) {
            parent.fundingChildren = (parent.fundingChildren || []).filter(
                id => id.toString() !== child._id.toString()
            );
            if (parent.fundingChildren.length === 0) {
                parent.isFundingParent = false;
            }
            await parent.save();
        }

        res.json({
            success: true,
            child,
            parent,
            message: `Unlinked ${child.dealerName} from ${parent?.dealerName || 'funding parent'}`
        });
    } catch (err) {
        console.error('Error unlinking child dealer:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── POST /dealers/hierarchy/dissolve (Dissolve all satellites for a Central Funder) ──
router.post('/hierarchy/dissolve', requireAuth, async (req, res) => {
    try {
        const { parentId } = req.body;
        if (!parentId) {
            return res.status(400).json({ success: false, message: 'parentId is required' });
        }

        const mongoose = require('mongoose');
        const crypto = require('crypto');
        const user = {
            name: req.user?.name || req.user?.email || 'Sales Rep',
            email: req.user?.email || null
        };

        const parentQuery = mongoose.Types.ObjectId.isValid(parentId) ? { _id: parentId } : {
            $or: [
                { dealerId: String(parentId).trim().toUpperCase() },
                { clientDealerId: String(parentId).trim().toUpperCase() }
            ]
        };
        const parent = await DealerLocation.findOne(parentQuery);
        if (!parent) {
            return res.status(404).json({ success: false, message: 'Parent dealer location not found' });
        }

        const children = await DealerLocation.find({ fundingParent: parent._id });
        const batchId = `dissolve_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

        for (const child of children) {
            await AuditLog.create({
                dealerId: child.dealerId || child.clientDealerId || child._id.toString(),
                dealerName: child.dealerName,
                batchId,
                action: 'hierarchy_unlink',
                previousState: {
                    fundingParent: parent._id,
                    parentName: parent.dealerName
                },
                newState: {
                    fundingParent: null
                },
                metadata: {
                    parentId: parent._id,
                    parentName: parent.dealerName
                },
                changedBy: user,
                reason: `Dissolved hierarchy: unlinked from Central Funder "${parent.dealerName}"`
            });

            child.fundingParent = null;
            await child.save();
        }

        // Also record on parent
        await AuditLog.create({
            dealerId: parent.dealerId || parent.clientDealerId || parent._id.toString(),
            dealerName: parent.dealerName,
            batchId,
            action: 'hierarchy_dissolve',
            previousState: {
                isFundingParent: parent.isFundingParent,
                fundingChildren: parent.fundingChildren
            },
            newState: {
                isFundingParent: false,
                fundingChildren: []
            },
            changedBy: user,
            reason: `Dissolved Central Funder hierarchy of ${children.length} satellite stores`
        });

        parent.isFundingParent = false;
        parent.fundingChildren = [];
        await parent.save();

        res.json({
            success: true,
            dissolvedCount: children.length,
            message: `Dissolved funding hierarchy for ${parent.dealerName}. Unlinked ${children.length} satellite stores.`
        });
    } catch (err) {
        console.error('Error dissolving hierarchy:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── GET /dealers/hierarchy/:dealerId (Inspect dealer's funding hierarchy status) ──
router.get('/hierarchy/:dealerId', requireAuth, async (req, res) => {
    try {
        const { dealerId } = req.params;
        const mongoose = require('mongoose');

        const query = mongoose.Types.ObjectId.isValid(dealerId) ? { _id: dealerId } : {
            $or: [
                { dealerId: String(dealerId).trim().toUpperCase() },
                { clientDealerId: String(dealerId).trim().toUpperCase() }
            ]
        };

        const dealer = await DealerLocation.findOne(query)
            .populate({
                path: 'fundingParent',
                select: '_id dealerId clientDealerId dealerName dealerCity dealerState statePrefix dealerRepresentative systemStatus businessType tags'
            })
            .populate({
                path: 'fundingChildren',
                select: '_id dealerId clientDealerId dealerName dealerCity dealerState statePrefix dealerRepresentative systemStatus businessType tags'
            })
            .lean();

        if (!dealer) {
            return res.status(404).json({ success: false, message: 'Dealer location not found' });
        }

        res.json({
            success: true,
            dealer: {
                _id: dealer._id,
                dealerId: dealer.dealerId,
                clientDealerId: dealer.clientDealerId,
                dealerName: dealer.dealerName,
                isFundingParent: Boolean(dealer.isFundingParent),
                fundingParent: dealer.fundingParent || null,
                fundingChildren: dealer.fundingChildren || []
            }
        });
    } catch (err) {
        console.error('Error fetching dealer hierarchy:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
