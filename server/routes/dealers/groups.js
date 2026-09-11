const express = require('express');
const router = express.Router();
const DealerGroup = require('../../models/DealerGroup');
const DealerLocation = require('../../models/DealerLocation');
const DealerGroupRequest = require('../../models/DealerGroupRequest');
const dealerGroupService = require('../../services/dealerGroupService');
const { requireAuth, requireRole, ROLE_HIERARCHY } = require('../../middleware/authMiddleware');

/**
 * Helper to check if current user has admin role
 */
function isUserAdmin(user) {
    if (!user) return false;
    return (ROLE_HIERARCHY[user.role] ?? 0) >= 1;
}

// ── GET /dealers/groups (List all groups with counts and custom status) ──
router.get('/', requireAuth, async (req, res) => {
    try {
        const { search, sortBy = 'dealerCount', order = 'desc' } = req.query;
        let query = {};

        if (search && search.trim()) {
            const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            query.$or = [{ name: regex }, { description: regex }];
        }

        const sortOptions = {};
        sortOptions[sortBy] = order === 'asc' ? 1 : -1;
        if (sortBy !== 'name') {
            sortOptions.name = 1;
        }

        const groups = await DealerGroup.find(query).sort(sortOptions).lean();

        // Also fetch pending proposals count for notification badge
        const pendingCount = await DealerGroupRequest.countDocuments({ status: 'pending' });

        res.json({
            success: true,
            total: groups.length,
            groups,
            pendingRequestsCount: pendingCount
        });
    } catch (err) {
        console.error('Error fetching dealer groups:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── GET /dealers/groups/requests (List group proposals) ──
router.get('/requests', requireAuth, async (req, res) => {
    try {
        const { status } = req.query;
        const isAdmin = isUserAdmin(req.user);
        let query = {};

        if (status && status !== 'all') {
            query.status = status;
        }

        // If not admin, rep sees their own requests
        if (!isAdmin) {
            query.requestedBy = req.user._id;
        }

        const requests = await DealerGroupRequest.find(query)
            .sort({ createdAt: -1 })
            .lean();

        const pendingCount = await DealerGroupRequest.countDocuments({ status: 'pending' });

        res.json({
            success: true,
            total: requests.length,
            pendingCount,
            requests
        });
    } catch (err) {
        console.error('Error fetching group requests:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── GET /dealers/groups/:groupId/members (List rooftops belonging to a group) ──
router.get('/:groupId/members', requireAuth, async (req, res) => {
    try {
        const { groupId } = req.params;
        const group = await DealerGroup.findById(groupId).lean();
        if (!group) {
            return res.status(404).json({ success: false, message: 'Dealer group not found' });
        }

        const members = await DealerLocation.find({ dealerGroup: groupId })
            .select('dealerId dealerName dealerCity dealerState systemStatus businessType tags fundingParent isFundingParent createdAt')
            .sort({ dealerName: 1 })
            .lean();

        res.json({
            success: true,
            group,
            total: members.length,
            members
        });
    } catch (err) {
        console.error('Error fetching group members:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── POST /dealers/groups (Dual-Path: Direct Create for Admin, Proposal for Rep) ──
router.post('/', requireAuth, async (req, res) => {
    try {
        const { name, description, dealerLocationIds, dealers, repNote } = req.body;
        const isAdmin = isUserAdmin(req.user);

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: 'Group name is required' });
        }

        if (isAdmin) {
            // Admin direct execution
            const { group, auditLogId } = await dealerGroupService.createGroupDirect(
                { name, description },
                req.user
            );

            // If initial locations were provided, assign them now
            const locIds = dealerLocationIds || (dealers || []).map(d => d.dealerLocation);
            if (Array.isArray(locIds) && locIds.length > 0) {
                await dealerGroupService.applyGroupMemberships({
                    targetGroupId: group._id,
                    dealerLocationIds: locIds,
                    action: 'add',
                    user: req.user,
                    reason: `Initial group membership for ${group.name}`
                });
            }

            // Refresh group count
            const refreshed = await DealerGroup.findById(group._id).lean();

            return res.status(201).json({
                success: true,
                isProposal: false,
                group: refreshed,
                auditLogId,
                message: `Created dealer group "${group.name}"`
            });
        }

        // Rep proposal flow
        if (!repNote || !repNote.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Please provide an explanation or context note for your proposal'
            });
        }

        const proposalDealers = (dealers || []).map(d => ({
            dealerLocation: d.dealerLocation,
            dealerId: d.dealerId,
            dealerName: d.dealerName,
            currentGroupName: d.currentGroupName || null,
            currentGroupId: d.currentGroupId || null,
            action: d.action || 'add'
        }));

        const { request, auditLogId } = await dealerGroupService.createProposal({
            requestType: 'create_group',
            groupId: null,
            groupName: name,
            groupDescription: description,
            repNote,
            dealers: proposalDealers
        }, req.user);

        return res.status(201).json({
            success: true,
            isProposal: true,
            proposal: request,
            auditLogId,
            message: `Proposal submitted for group "${request.groupName}". Pending Admin review.`
        });
    } catch (err) {
        console.error('Error creating/proposing dealer group:', err);
        res.status(400).json({ success: false, message: err.message });
    }
});

// ── PUT /dealers/groups/:groupId (Dual-Path: Direct Update for Admin, Proposal for Rep) ──
router.put('/:groupId', requireAuth, async (req, res) => {
    try {
        const { groupId } = req.params;
        const { name, description, addDealerLocationIds, removeDealerLocationIds, dealers, repNote } = req.body;
        const isAdmin = isUserAdmin(req.user);

        const group = await DealerGroup.findById(groupId);
        if (!group) {
            return res.status(404).json({ success: false, message: 'Dealer group not found' });
        }

        if (isAdmin) {
            // Admin direct update
            let updatedGroup = group;
            if (name || description !== undefined) {
                const resUpdate = await dealerGroupService.updateGroupDirect(
                    groupId,
                    { name, description },
                    req.user
                );
                updatedGroup = resUpdate.group;
            }

            if (Array.isArray(addDealerLocationIds) && addDealerLocationIds.length > 0) {
                await dealerGroupService.applyGroupMemberships({
                    targetGroupId: groupId,
                    dealerLocationIds: addDealerLocationIds,
                    action: 'add',
                    user: req.user,
                    reason: `Admin added rooftops to ${updatedGroup.name}`
                });
            }

            if (Array.isArray(removeDealerLocationIds) && removeDealerLocationIds.length > 0) {
                await dealerGroupService.applyGroupMemberships({
                    targetGroupId: groupId,
                    dealerLocationIds: removeDealerLocationIds,
                    action: 'remove',
                    user: req.user,
                    reason: `Admin removed rooftops from ${updatedGroup.name}`
                });
            }

            const refreshed = await DealerGroup.findById(groupId).lean();
            return res.json({
                success: true,
                isProposal: false,
                group: refreshed,
                message: `Updated dealer group "${refreshed.name}"`
            });
        }

        // Rep proposal flow
        if (!repNote || !repNote.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Please provide an explanation or context note for your proposal'
            });
        }

        const proposalDealers = (dealers || []).map(d => ({
            dealerLocation: d.dealerLocation,
            dealerId: d.dealerId,
            dealerName: d.dealerName,
            currentGroupName: d.currentGroupName || group.name,
            currentGroupId: d.currentGroupId || group._id,
            action: d.action || 'add'
        }));

        const { request, auditLogId } = await dealerGroupService.createProposal({
            requestType: 'transfer_dealers',
            groupId: group._id,
            groupName: group.name,
            groupDescription: description || group.description,
            repNote,
            dealers: proposalDealers
        }, req.user);

        return res.json({
            success: true,
            isProposal: true,
            proposal: request,
            auditLogId,
            message: `Proposal submitted for group "${group.name}". Pending Admin review.`
        });
    } catch (err) {
        console.error('Error updating/proposing dealer group:', err);
        res.status(400).json({ success: false, message: err.message });
    }
});

// ── DELETE /dealers/groups/:groupId (Dual-Path: Direct Delete for Admin, Proposal for Rep) ──
router.delete('/:groupId', requireAuth, async (req, res) => {
    try {
        const { groupId } = req.params;
        const { repNote } = req.body;
        const isAdmin = isUserAdmin(req.user);

        const group = await DealerGroup.findById(groupId);
        if (!group) {
            return res.status(404).json({ success: false, message: 'Dealer group not found' });
        }

        if (isAdmin) {
            const result = await dealerGroupService.deleteGroupDirect(groupId, req.user);
            return res.json({
                success: true,
                isProposal: false,
                deletedGroupName: result.deletedGroupName,
                unassignedCount: result.unassignedCount,
                message: `Deleted dealer group "${result.deletedGroupName}"`
            });
        }

        // Rep proposal
        if (!repNote || !repNote.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Please provide an explanation note for why this group should be deleted'
            });
        }

        const { request } = await dealerGroupService.createProposal({
            requestType: 'delete_group',
            groupId: group._id,
            groupName: group.name,
            repNote,
            dealers: []
        }, req.user);

        return res.json({
            success: true,
            isProposal: true,
            proposal: request,
            message: `Proposal to delete "${group.name}" submitted for Admin review.`
        });
    } catch (err) {
        console.error('Error deleting/proposing dealer group deletion:', err);
        res.status(400).json({ success: false, message: err.message });
    }
});

// ── POST /dealers/groups/requests/:requestId/review (Admin Approval/Cherry-Picking) ──
router.post('/requests/:requestId/review', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const { requestId } = req.params;
        const { decision, reviewNote, itemDecisions } = req.body;

        if (!['approved', 'rejected', 'partially_approved'].includes(decision)) {
            return res.status(400).json({
                success: false,
                message: 'Decision must be approved or rejected'
            });
        }

        const result = await dealerGroupService.reviewProposal(
            requestId,
            { decision, reviewNote, itemDecisions },
            req.user
        );

        res.json({
            success: true,
            proposal: result.proposal,
            auditLogId: result.auditLogId,
            message: `Proposal ${result.proposal.status.replace('_', ' ')} successfully`
        });
    } catch (err) {
        console.error('Error reviewing group proposal:', err);
        res.status(400).json({ success: false, message: err.message });
    }
});

module.exports = router;
