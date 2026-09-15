const express = require('express');
const mongoose = require('mongoose');
const FollowUp = require('../../models/FollowUp');
const DealerLocation = require('../../models/DealerLocation');
const BadgerUpdateLog = require('../../models/BadgerUpdateLog');
const AuditLog = require('../../models/AuditLog');
const { requireAuth } = require('../../middleware/authMiddleware');

const router = express.Router();

/**
 * Check if two dates are in the same local day
 */
function isSameDay(d1, d2) {
    return (
        d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate()
    );
}

// ── GET /followups (Fetch user-specific follow-ups sorted nearest to furthest) ──
router.get('/', requireAuth, async (req, res) => {
    try {
        const { filter = 'active', dealerId } = req.query;
        const now = new Date();

        const query = { userId: req.user._id };

        if (dealerId) {
            query.dealerId = String(dealerId).trim().toUpperCase();
        }

        if (filter === 'active') {
            query.status = 'pending';
        } else if (filter === 'completed') {
            query.status = 'completed';
        } else if (filter === 'all') {
            // No status filter
        }

        const sortOrder = filter === 'completed' ? { completedAt: -1 } : { dueDate: 1 };

        const followUps = await FollowUp.find(query)
            .sort(sortOrder)
            .lean();

        // Calculate summary counts for user
        const allPending = await FollowUp.find({ userId: req.user._id, status: 'pending' }).lean();
        const overdueCount = allPending.filter(f => new Date(f.dueDate) < now).length;
        const todayCount = allPending.filter(f => isSameDay(new Date(f.dueDate), now)).length;

        const enrichedFollowUps = followUps.map(f => {
            const due = new Date(f.dueDate);
            return {
                ...f,
                isOverdue: f.status === 'pending' && due < now,
                isToday: f.status === 'pending' && isSameDay(due, now)
            };
        });

        res.json({
            success: true,
            followUps: enrichedFollowUps,
            counts: {
                totalActive: allPending.length,
                overdueCount,
                todayCount
            }
        });
    } catch (err) {
        console.error('Error fetching follow-ups:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── POST /followups (Schedule a new follow-up) ──
router.post('/', requireAuth, async (req, res) => {
    try {
        const { dealerId, dealerName, dueDate, note = '', clientDealerId = null } = req.body;

        if (!dealerId || !dueDate) {
            return res.status(400).json({ success: false, message: 'dealerId and dueDate are required' });
        }

        const parsedDate = new Date(dueDate);
        if (isNaN(parsedDate.getTime())) {
            return res.status(400).json({ success: false, message: 'Invalid dueDate format' });
        }

        const cleanDealerId = String(dealerId).trim().toUpperCase();
        let finalDealerName = dealerName ? String(dealerName).trim() : cleanDealerId;

        // Verify dealer exists or get dealerName if missing
        const loc = await DealerLocation.findOne({
            $or: [
                { dealerId: cleanDealerId },
                { clientDealerId: cleanDealerId },
                ...(mongoose.Types.ObjectId.isValid(cleanDealerId) ? [{ _id: cleanDealerId }] : [])
            ]
        }).select('dealerId dealerName badgerData clientDealerId');

        if (loc) {
            finalDealerName = loc.dealerName || finalDealerName;
        }

        const followUp = await FollowUp.create({
            dealerId: loc ? loc.dealerId : cleanDealerId,
            dealerName: finalDealerName,
            clientDealerId: clientDealerId || loc?.clientDealerId || null,
            userId: req.user._id,
            userName: req.user.name || req.user.email || 'Sales Rep',
            userEmail: req.user.email || '',
            dueDate: parsedDate,
            note: String(note || '').trim(),
            status: 'pending'
        });

        // Audit log in BadgerUpdateLog (for rooftop-specific audit tab)
        const log = await BadgerUpdateLog.create({
            dealerId: followUp.dealerId,
            dealerLocation: loc?._id || null,
            badgerId: loc?.badgerData?.badgerId || 0,
            action: 'followup_create',
            user: {
                id: req.user._id,
                name: req.user.name || req.user.email || 'User',
                email: req.user.email || null
            },
            payload: {
                followUpId: followUp._id,
                dueDate: followUp.dueDate,
                note: followUp.note,
                dealerName: finalDealerName,
                followUp: followUp.toObject()
            }
        });

        // Audit log in AuditLog (for system-wide Operations Audit Trail)
        await AuditLog.create({
            dealerId: followUp.dealerId,
            dealerName: finalDealerName,
            action: 'followup_create',
            user: {
                id: req.user._id,
                name: req.user.name || req.user.email || 'Sales Rep',
                email: req.user.email || null
            },
            previousState: null,
            newState: {
                followUpId: followUp._id,
                dueDate: followUp.dueDate,
                note: followUp.note,
                status: followUp.status,
                dealerName: finalDealerName
            },
            reason: `Scheduled follow-up for ${new Date(followUp.dueDate).toLocaleString()}${followUp.note ? ` - Note: "${followUp.note}"` : ''}`
        }).catch(err => console.error('Failed to create AuditLog for follow-up:', err.message));

        res.status(201).json({
            success: true,
            followUp,
            logId: log._id,
            message: `Follow-up scheduled for ${finalDealerName}`
        });
    } catch (err) {
        console.error('Error creating follow-up:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── PATCH /followups/:id (Update status, dueDate, or note) ──
router.patch('/:id', requireAuth, async (req, res) => {
    try {
        const followUp = await FollowUp.findOne({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!followUp) {
            return res.status(404).json({ success: false, message: 'Follow-up not found' });
        }

        const previousFollowUp = followUp.toObject();
        const { status, dueDate, note } = req.body;

        if (status !== undefined) {
            followUp.status = status;
            if (status === 'completed') {
                followUp.completedAt = new Date();
                followUp.completedBy = req.user.name || req.user.email || 'User';
            } else if (status === 'pending') {
                followUp.completedAt = null;
                followUp.completedBy = null;
            }
        }

        if (dueDate !== undefined) {
            const parsed = new Date(dueDate);
            if (!isNaN(parsed.getTime())) {
                followUp.dueDate = parsed;
            }
        }

        if (note !== undefined) {
            followUp.note = String(note).trim();
        }

        followUp.updatedAt = new Date();
        await followUp.save();

        const loc = await DealerLocation.findOne({
            $or: [
                { dealerId: followUp.dealerId },
                { clientDealerId: followUp.dealerId },
                ...(followUp.clientDealerId ? [{ clientDealerId: followUp.clientDealerId }] : [])
            ]
        }).select('_id badgerData dealerName');

        const isCompleted = followUp.status === 'completed';
        const actionType = isCompleted ? 'followup_complete' : 'followup_create';

        const log = await BadgerUpdateLog.create({
            dealerId: followUp.dealerId,
            dealerLocation: loc?._id || null,
            badgerId: loc?.badgerData?.badgerId || 0,
            action: actionType,
            user: {
                id: req.user._id,
                name: req.user.name || req.user.email || 'User',
                email: req.user.email || null
            },
            payload: {
                followUpId: followUp._id,
                dealerName: followUp.dealerName || loc?.dealerName || followUp.dealerId,
                dueDate: followUp.dueDate,
                note: followUp.note,
                status: followUp.status,
                followUp: followUp.toObject(),
                previousFollowUp
            }
        });

        await AuditLog.create({
            dealerId: followUp.dealerId,
            dealerName: followUp.dealerName || loc?.dealerName || followUp.dealerId,
            action: actionType,
            user: {
                id: req.user._id,
                name: req.user.name || req.user.email || 'Sales Rep',
                email: req.user.email || null
            },
            previousState: previousFollowUp,
            newState: followUp.toObject(),
            reason: isCompleted
                ? `Completed follow-up for ${followUp.dealerName || followUp.dealerId}`
                : `Updated follow-up schedule/note for ${followUp.dealerName || followUp.dealerId}`
        }).catch(err => console.error('Failed to create AuditLog for follow-up update:', err.message));

        res.json({
            success: true,
            followUp,
            logId: log._id,
            message: followUp.status === 'completed' ? 'Follow-up marked as completed' : 'Follow-up updated'
        });
    } catch (err) {
        console.error('Error updating follow-up:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── DELETE /followups/:id (Delete follow-up, reversible) ──
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const followUp = await FollowUp.findOne({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!followUp) {
            return res.status(404).json({ success: false, message: 'Follow-up not found' });
        }

        const previousFollowUp = followUp.toObject();
        await FollowUp.deleteOne({ _id: followUp._id });

        const loc = await DealerLocation.findOne({
            $or: [
                { dealerId: followUp.dealerId },
                { clientDealerId: followUp.dealerId },
                ...(followUp.clientDealerId ? [{ clientDealerId: followUp.clientDealerId }] : [])
            ]
        }).select('_id badgerData dealerName');

        const log = await BadgerUpdateLog.create({
            dealerId: followUp.dealerId,
            dealerLocation: loc?._id || null,
            badgerId: loc?.badgerData?.badgerId || 0,
            action: 'followup_delete',
            user: {
                id: req.user._id,
                name: req.user.name || req.user.email || 'User',
                email: req.user.email || null
            },
            payload: {
                followUpId: followUp._id,
                dealerName: followUp.dealerName || loc?.dealerName || followUp.dealerId,
                dueDate: previousFollowUp.dueDate,
                note: previousFollowUp.note,
                previousFollowUp
            }
        });

        await AuditLog.create({
            dealerId: followUp.dealerId,
            dealerName: followUp.dealerName || loc?.dealerName || followUp.dealerId,
            action: 'followup_delete',
            user: {
                id: req.user._id,
                name: req.user.name || req.user.email || 'Sales Rep',
                email: req.user.email || null
            },
            previousState: previousFollowUp,
            newState: null,
            reason: `Removed follow-up for ${followUp.dealerName || followUp.dealerId}`
        }).catch(err => console.error('Failed to create AuditLog for follow-up delete:', err.message));

        res.json({
            success: true,
            logId: log._id,
            message: 'Follow-up removed (Reversible)'
        });
    } catch (err) {
        console.error('Error deleting follow-up:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── POST /followups/undo (Undo follow-up mutation) ──
router.post('/undo', requireAuth, async (req, res) => {
    try {
        const { logId } = req.body;
        const query = {
            'user.id': req.user._id,
            action: { $in: ['followup_create', 'followup_complete', 'followup_delete'] },
            isUndone: false
        };
        if (logId) query._id = logId;

        const log = await BadgerUpdateLog.findOne(query).sort({ createdAt: -1 });
        if (!log) {
            return res.status(404).json({ success: false, message: 'No undoable follow-up action found' });
        }

        if (log.action === 'followup_create' && log.payload?.followUpId) {
            await FollowUp.deleteOne({ _id: log.payload.followUpId });
        } else if (log.action === 'followup_complete' && log.payload?.followUpId && log.payload?.previousFollowUp) {
            await FollowUp.updateOne(
                { _id: log.payload.followUpId },
                { $set: { ...log.payload.previousFollowUp, status: 'pending', completedAt: null, completedBy: null } }
            );
        } else if (log.action === 'followup_delete' && log.payload?.previousFollowUp) {
            await FollowUp.create(log.payload.previousFollowUp);
        }

        log.isUndone = true;
        log.undoneAt = new Date();
        log.undoneBy = {
            name: req.user.name || req.user.email || 'User',
            email: req.user.email || null
        };
        await log.save();

        // Also sync any AuditLog entries for this follow-up
        if (log.payload?.followUpId) {
            await AuditLog.updateMany(
                {
                    $or: [
                        { 'newState.followUpId': log.payload.followUpId },
                        { 'previousState._id': log.payload.followUpId },
                        { 'previousState.followUpId': log.payload.followUpId }
                    ],
                    isUndone: false
                },
                {
                    $set: {
                        isUndone: true,
                        undoneAt: new Date(),
                        undoneBy: { name: req.user.name || req.user.email || 'User', email: req.user.email || null }
                    }
                }
            ).catch(() => {});
        }

        res.json({
            success: true,
            message: 'Follow-up action successfully reverted'
        });
    } catch (err) {
        console.error('Error reverting follow-up action:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
