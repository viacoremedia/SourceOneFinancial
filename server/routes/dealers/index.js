const express = require('express');
const DealerLocation = require('../../models/DealerLocation');
const DealerProfile = require('../../models/DealerProfile');
const { requireAuth, requireRole } = require('../../middleware/authMiddleware');
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

module.exports = router;
