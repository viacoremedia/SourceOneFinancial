const express = require('express');
const DealerLocation = require('../../models/DealerLocation');
const DealerProfile = require('../../models/DealerProfile');
const { requireAuth, requireRole } = require('../../middleware/authMiddleware');
const {
    getSyncStatus,
    syncSingleDealerFromBadger,
    syncAllDealersFromBadger
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

module.exports = router;
