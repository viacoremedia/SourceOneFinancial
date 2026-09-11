const DealerGroup = require('../models/DealerGroup');
const DealerLocation = require('../models/DealerLocation');
const DailyDealerSnapshot = require('../models/DailyDealerSnapshot');
const AuditLog = require('../models/AuditLog');
const DealerGroupRequest = require('../models/DealerGroupRequest');

/**
 * Recalculate rooftop counts for one or more groups.
 * Keeps DealerGroup.dealerCount synchronized with actual DealerLocation records.
 */
async function recalculateGroupCounts(groupIds) {
    if (!groupIds) return;
    const ids = Array.isArray(groupIds) ? groupIds : [groupIds];
    const uniqueIds = [...new Set(ids.filter(Boolean).map(id => id.toString()))];

    for (const gId of uniqueIds) {
        const count = await DealerLocation.countDocuments({ dealerGroup: gId });
        await DealerGroup.updateOne({ _id: gId }, { $set: { dealerCount: count } });
    }
}

/**
 * Apply membership additions or removals for a group.
 * 
 * In enterprise dealership operations, a rooftop can belong to at most one group.
 * When reassigned, the previous group count decrements and the new group count increments.
 * Historical DailyDealerSnapshot records are retroactively updated so all MoM metrics reflect the new grouping.
 * All changes are written to AuditLog with detailed previous states to allow 1-click revert.
 */
async function applyGroupMemberships({ targetGroupId, dealerLocationIds, action, user, reason }) {
    if (!Array.isArray(dealerLocationIds) || dealerLocationIds.length === 0) {
        return { success: true, updatedCount: 0 };
    }

    if (action === 'add') {
        const targetGroup = await DealerGroup.findById(targetGroupId);
        if (!targetGroup) {
            throw new Error(`Target DealerGroup not found: ${targetGroupId}`);
        }

        // Find existing locations and their current groups
        const locations = await DealerLocation.find({ _id: { $in: dealerLocationIds } })
            .populate('dealerGroup', 'name');

        const previousMemberships = locations.map(l => ({
            dealerLocationId: l._id,
            dealerId: l.dealerId,
            dealerName: l.dealerName,
            previousGroupId: l.dealerGroup?._id || null,
            previousGroupName: l.dealerGroup?.name || null
        }));

        const affectedGroupIds = new Set([targetGroupId.toString()]);
        for (const prev of previousMemberships) {
            if (prev.previousGroupId) {
                affectedGroupIds.add(prev.previousGroupId.toString());
            }
        }

        // 1. Update DealerLocation
        await DealerLocation.updateMany(
            { _id: { $in: dealerLocationIds } },
            { $set: { dealerGroup: targetGroupId, dealerGroupName: targetGroup.name, isManuallyGrouped: true } }
        );

        // 2. Retroactive snapshot update (Requirement 26)
        await DailyDealerSnapshot.updateMany(
            { dealerLocation: { $in: dealerLocationIds } },
            { $set: { dealerGroup: targetGroupId } }
        );

        // 3. Recalculate rooftop counts for all affected groups
        await recalculateGroupCounts(Array.from(affectedGroupIds));

        // 4. Record in AuditLog
        const audit = await AuditLog.create({
            dealerId: 'GLOBAL',
            dealerName: `Group: ${targetGroup.name}`,
            action: 'group_add_dealers',
            user: {
                id: user?._id || null,
                name: user?.name || user?.email || 'Admin',
                email: user?.email || null
            },
            previousState: {
                groupId: targetGroupId,
                groupName: targetGroup.name,
                previousMemberships
            },
            newState: {
                groupId: targetGroupId,
                groupName: targetGroup.name,
                addedDealerLocationIds: dealerLocationIds,
                dealers: previousMemberships.map(p => ({
                    dealerLocationId: p.dealerLocationId,
                    dealerId: p.dealerId,
                    dealerName: p.dealerName
                }))
            },
            reason: reason || `Assigned ${dealerLocationIds.length} rooftop(s) to group ${targetGroup.name}`
        });

        return {
            success: true,
            updatedCount: dealerLocationIds.length,
            targetGroup,
            auditLogId: audit._id
        };
    } else if (action === 'remove') {
        const locations = await DealerLocation.find({ _id: { $in: dealerLocationIds } })
            .populate('dealerGroup', 'name');

        const previousMemberships = locations.map(l => ({
            dealerLocationId: l._id,
            dealerId: l.dealerId,
            dealerName: l.dealerName,
            previousGroupId: l.dealerGroup?._id || null,
            previousGroupName: l.dealerGroup?.name || null
        }));

        const affectedGroupIds = new Set();
        for (const prev of previousMemberships) {
            if (prev.previousGroupId) {
                affectedGroupIds.add(prev.previousGroupId.toString());
            }
        }
        if (targetGroupId) affectedGroupIds.add(targetGroupId.toString());

        // 1. Update DealerLocation
        await DealerLocation.updateMany(
            { _id: { $in: dealerLocationIds } },
            { $set: { dealerGroup: null, dealerGroupName: null, isManuallyGrouped: true } }
        );

        // 2. Retroactive snapshot update
        await DailyDealerSnapshot.updateMany(
            { dealerLocation: { $in: dealerLocationIds } },
            { $set: { dealerGroup: null } }
        );

        // 3. Recalculate group counts
        await recalculateGroupCounts(Array.from(affectedGroupIds));

        // 4. Record in AuditLog
        const audit = await AuditLog.create({
            dealerId: 'GLOBAL',
            dealerName: 'Dealer Group Unassignment',
            action: 'group_remove_dealers',
            user: {
                id: user?._id || null,
                name: user?.name || user?.email || 'Admin',
                email: user?.email || null
            },
            previousState: {
                removedDealers: previousMemberships
            },
            newState: {
                unassignedDealerLocationIds: dealerLocationIds
            },
            reason: reason || `Removed ${dealerLocationIds.length} rooftop(s) from group`
        });

        return {
            success: true,
            removedCount: dealerLocationIds.length,
            auditLogId: audit._id
        };
    }

    throw new Error(`Unsupported action: ${action}`);
}

/**
 * Direct group creation by Admin
 */
async function createGroupDirect({ name, description }, user) {
    if (!name || !name.trim()) {
        throw new Error('Group name is required');
    }
    const cleanName = name.trim();
    const existing = await DealerGroup.findOne({
        name: new RegExp(`^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
    });
    if (existing) {
        throw new Error(`Dealer group "${cleanName}" already exists`);
    }

    const group = await DealerGroup.create({
        name: cleanName,
        description: description?.trim() || '',
        isCustom: true,
        createdBy: user?._id || null,
        dealerCount: 0
    });

    const audit = await AuditLog.create({
        dealerId: 'GLOBAL',
        dealerName: `Group: ${group.name}`,
        action: 'group_create',
        user: {
            id: user?._id || null,
            name: user?.name || user?.email || 'Admin',
            email: user?.email || null
        },
        previousState: null,
        newState: {
            groupId: group._id,
            name: group.name,
            slug: group.slug,
            description: group.description,
            isCustom: true
        },
        reason: `Created custom dealer group "${group.name}"`
    });

    return { group, auditLogId: audit._id };
}

/**
 * Direct group update by Admin
 */
async function updateGroupDirect(groupId, { name, description }, user) {
    const group = await DealerGroup.findById(groupId);
    if (!group) {
        throw new Error('Dealer group not found');
    }

    const previousState = {
        groupId: group._id,
        name: group.name,
        description: group.description,
        isCustom: group.isCustom
    };

    if (name && name.trim() && name.trim().toLowerCase() !== group.name.toLowerCase()) {
        const cleanName = name.trim();
        const duplicate = await DealerGroup.findOne({
            _id: { $ne: groupId },
            name: new RegExp(`^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
        });
        if (duplicate) {
            throw new Error(`Another dealer group with name "${cleanName}" already exists`);
        }
        group.name = cleanName;
        // Update denormalized dealerGroupName on member locations
        await DealerLocation.updateMany({ dealerGroup: groupId }, { $set: { dealerGroupName: cleanName } });
    }

    if (description !== undefined) {
        group.description = description.trim();
    }
    group.updatedAt = new Date();
    await group.save();

    const audit = await AuditLog.create({
        dealerId: 'GLOBAL',
        dealerName: `Group: ${group.name}`,
        action: 'group_update',
        user: {
            id: user?._id || null,
            name: user?.name || user?.email || 'Admin',
            email: user?.email || null
        },
        previousState,
        newState: {
            groupId: group._id,
            name: group.name,
            description: group.description,
            isCustom: group.isCustom
        },
        reason: `Updated dealer group "${group.name}"`
    });

    return { group, auditLogId: audit._id };
}

/**
 * Direct group deletion by Admin
 */
async function deleteGroupDirect(groupId, user) {
    const group = await DealerGroup.findById(groupId);
    if (!group) {
        throw new Error('Dealer group not found');
    }

    const members = await DealerLocation.find({ dealerGroup: groupId }).select('_id dealerId dealerName');
    const memberIds = members.map(m => m._id);

    // Unassign all members and retroactively clear snapshots
    await DealerLocation.updateMany({ dealerGroup: groupId }, { $set: { dealerGroup: null, dealerGroupName: null } });
    await DailyDealerSnapshot.updateMany({ dealerGroup: groupId }, { $set: { dealerGroup: null } });
    await DealerGroup.deleteOne({ _id: groupId });

    const audit = await AuditLog.create({
        dealerId: 'GLOBAL',
        dealerName: `Group: ${group.name}`,
        action: 'group_delete',
        user: {
            id: user?._id || null,
            name: user?.name || user?.email || 'Admin',
            email: user?.email || null
        },
        previousState: {
            groupId: group._id,
            name: group.name,
            slug: group.slug,
            description: group.description,
            isCustom: group.isCustom,
            memberIds,
            members: members.map(m => ({ dealerLocationId: m._id, dealerId: m.dealerId, dealerName: m.dealerName }))
        },
        newState: null,
        reason: `Deleted dealer group "${group.name}" and unassigned ${memberIds.length} rooftop(s)`
    });

    return { success: true, deletedGroupName: group.name, unassignedCount: memberIds.length, auditLogId: audit._id };
}

/**
 * Rep Proposal Submission
 */
async function createProposal(data, user) {
    const { requestType, groupId, groupName, groupDescription, repNote, dealers } = data;

    if (!groupName || !groupName.trim()) {
        throw new Error('Group name is required');
    }
    if (!repNote || !repNote.trim()) {
        throw new Error('Please provide an explanation or context note for this proposal');
    }

    const request = await DealerGroupRequest.create({
        requestType,
        groupId: groupId || null,
        groupName: groupName.trim(),
        groupDescription: groupDescription?.trim() || '',
        dealers: (dealers || []).map(d => ({
            dealerLocation: d.dealerLocation,
            dealerId: d.dealerId,
            dealerName: d.dealerName,
            currentGroupName: d.currentGroupName || null,
            currentGroupId: d.currentGroupId || null,
            action: d.action || 'add',
            status: 'pending'
        })),
        requestedBy: user?._id,
        requesterName: user?.name || user?.email || 'Sales Rep',
        requesterEmail: user?.email || '',
        repNote: repNote.trim(),
        status: 'pending'
    });

    const audit = await AuditLog.create({
        dealerId: 'GLOBAL',
        dealerName: `Group Proposal: ${request.groupName}`,
        action: 'group_proposal_create',
        user: {
            id: user?._id || null,
            name: user?.name || user?.email || 'Sales Rep',
            email: user?.email || null
        },
        previousState: null,
        newState: {
            requestId: request._id,
            requestType: request.requestType,
            groupName: request.groupName,
            repNote: request.repNote,
            dealersCount: request.dealers.length,
            dealers: request.dealers
        },
        reason: `Rep proposal submitted: "${request.repNote}"`
    });

    return { request, auditLogId: audit._id };
}

/**
 * Admin Proposal Review (Approve, Reject, or Granular Cherry-Picking)
 */
async function reviewProposal(requestId, { decision, reviewNote, itemDecisions }, adminUser) {
    const proposal = await DealerGroupRequest.findById(requestId);
    if (!proposal) {
        throw new Error('Proposal not found');
    }
    if (proposal.status !== 'pending') {
        throw new Error(`This proposal has already been ${proposal.status}`);
    }

    if (decision === 'rejected') {
        proposal.status = 'rejected';
        proposal.reviewedBy = adminUser?._id || null;
        proposal.reviewerName = adminUser?.name || adminUser?.email || 'Admin';
        proposal.reviewNote = reviewNote?.trim() || 'Rejected by administrator';
        proposal.reviewedAt = new Date();
        proposal.dealers.forEach(d => { d.status = 'rejected'; });
        await proposal.save();

        const audit = await AuditLog.create({
            dealerId: 'GLOBAL',
            dealerName: `Group Proposal: ${proposal.groupName}`,
            action: 'group_proposal_reject',
            user: {
                id: adminUser?._id || null,
                name: adminUser?.name || adminUser?.email || 'Admin',
                email: adminUser?.email || null
            },
            previousState: { status: 'pending', requestId: proposal._id },
            newState: { status: 'rejected', reviewNote: proposal.reviewNote },
            reason: proposal.reviewNote
        });

        return { proposal, auditLogId: audit._id };
    }

    // Process approval or partial approval
    let targetGroupId = proposal.groupId;

    // If creating a brand new group, instantiate it now
    if (proposal.requestType === 'create_group' || !targetGroupId) {
        let group = await DealerGroup.findOne({
            name: new RegExp(`^${proposal.groupName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
        });
        if (!group) {
            group = await DealerGroup.create({
                name: proposal.groupName.trim(),
                description: proposal.groupDescription || '',
                isCustom: true,
                createdBy: adminUser?._id || null,
                dealerCount: 0
            });
        }
        targetGroupId = group._id;
        proposal.groupId = group._id;
    }

    const approvedAddIds = [];
    const approvedRemoveIds = [];
    let hasRejections = false;
    let hasApprovals = false;

    // Check item-level decisions if provided, otherwise approve all
    proposal.dealers.forEach(d => {
        const itemDecision = itemDecisions ? itemDecisions[d.dealerLocation.toString()] : 'approved';
        if (itemDecision === 'approved') {
            d.status = 'approved';
            hasApprovals = true;
            if (d.action === 'add') {
                approvedAddIds.push(d.dealerLocation);
            } else if (d.action === 'remove') {
                approvedRemoveIds.push(d.dealerLocation);
            }
        } else {
            d.status = 'rejected';
            hasRejections = true;
        }
    });

    const overallStatus = hasApprovals && hasRejections
        ? 'partially_approved'
        : hasApprovals
            ? 'approved'
            : 'rejected';

    proposal.status = overallStatus;
    proposal.reviewedBy = adminUser?._id || null;
    proposal.reviewerName = adminUser?.name || adminUser?.email || 'Admin';
    proposal.reviewNote = reviewNote?.trim() || (overallStatus === 'approved' ? 'Approved by administrator' : 'Partially approved');
    proposal.reviewedAt = new Date();
    await proposal.save();

    // Apply approved additions
    let previousMembershipSnapshots = [];
    if (approvedAddIds.length > 0) {
        const addResult = await applyGroupMemberships({
            targetGroupId,
            dealerLocationIds: approvedAddIds,
            action: 'add',
            user: adminUser,
            reason: `Approved proposal (${proposal.status}): ${proposal.repNote}`
        });
    }

    // Apply approved removals
    if (approvedRemoveIds.length > 0) {
        await applyGroupMemberships({
            targetGroupId,
            dealerLocationIds: approvedRemoveIds,
            action: 'remove',
            user: adminUser,
            reason: `Approved proposal removal: ${proposal.repNote}`
        });
    }

    const audit = await AuditLog.create({
        dealerId: 'GLOBAL',
        dealerName: `Group Proposal: ${proposal.groupName}`,
        action: 'group_proposal_approve',
        user: {
            id: adminUser?._id || null,
            name: adminUser?.name || adminUser?.email || 'Admin',
            email: adminUser?.email || null
        },
        previousState: {
            status: 'pending',
            requestId: proposal._id
        },
        newState: {
            status: proposal.status,
            groupId: targetGroupId,
            groupName: proposal.groupName,
            approvedAddCount: approvedAddIds.length,
            approvedRemoveCount: approvedRemoveIds.length,
            reviewNote: proposal.reviewNote,
            dealers: proposal.dealers
        },
        reason: proposal.reviewNote
    });

    return { proposal, auditLogId: audit._id };
}

module.exports = {
    recalculateGroupCounts,
    applyGroupMemberships,
    createGroupDirect,
    updateGroupDirect,
    deleteGroupDirect,
    createProposal,
    reviewProposal
};
