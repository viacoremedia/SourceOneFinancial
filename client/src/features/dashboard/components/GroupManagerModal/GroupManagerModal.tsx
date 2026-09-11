import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Building2,
  CheckCircle2,
  Plus,
  Search,
  Check,
  ChevronDown,
  ChevronUp,
  Trash2,
  Edit2,
  Users,
  Loader2
} from 'lucide-react';
import { useAuth } from '../../../auth/hooks/useAuth';
import {
  getDealerGroupsList,
  getDealerGroupMembers,
  createOrProposeDealerGroup,
  updateOrProposeDealerGroup,
  deleteOrProposeDealerGroup,
  getDealerGroupRequests,
  reviewDealerGroupRequest,
  searchDealers,
  type DealerGroupItem,
  type GroupMemberLocation,
  type DealerGroupRequestItem
} from '../../../../core/services/api';
import styles from './GroupManagerModal.module.css';

export interface GroupManagerModalProps {
  isOpen?: boolean;
  initialTab?: 'groups' | 'approvals';
  onClose: () => void;
  onSuccess?: () => void;
}

export const GroupManagerModal: React.FC<GroupManagerModalProps> = ({
  isOpen = true,
  initialTab = 'groups',
  onClose,
  onSuccess
}) => {
  if (!isOpen) return null;

  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  // Navigation tab
  const [activeTab, setActiveTab] = useState<'groups' | 'approvals'>(initialTab);

  // Group list state
  const [groups, setGroups] = useState<DealerGroupItem[]>([]);
  const [pendingRequestsCount, setPendingRequestsCount] = useState<number>(0);
  const [groupSearch, setGroupSearch] = useState<string>('');
  const [isLoadingGroups, setIsLoadingGroups] = useState<boolean>(true);

  // Expanded rooftop members
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<Record<string, GroupMemberLocation[]>>({});
  const [loadingMembers, setLoadingMembers] = useState<Record<string, boolean>>({});

  // Approval desk proposals state
  const [proposals, setProposals] = useState<DealerGroupRequestItem[]>([]);
  const [proposalFilter, setProposalFilter] = useState<string>('pending');
  const [isLoadingProposals, setIsLoadingProposals] = useState<boolean>(false);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [cherryPickDecisions, setCherryPickDecisions] = useState<Record<string, Record<string, 'approved' | 'rejected'>>>({});
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  // Sub-modal states: Create Group
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newGroupName, setNewGroupName] = useState<string>('');
  const [newGroupDescription, setNewGroupDescription] = useState<string>('');
  const [newGroupRepNote, setNewGroupRepNote] = useState<string>('');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState<boolean>(false);

  // Sub-modal states: Edit Group
  const [editingGroup, setEditingGroup] = useState<DealerGroupItem | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');
  const [editRepNote, setEditRepNote] = useState<string>('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState<boolean>(false);

  // Sub-modal states: Add Store to Group
  const [addingToGroup, setAddingToGroup] = useState<DealerGroupItem | null>(null);
  const [storeSearchQuery, setStoreSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<Array<{ _id: string; dealerId: string; dealerName: string; statePrefix: string }>>([]);
  const [selectedStoresToAdd, setSelectedStoresToAdd] = useState<Array<{ _id: string; dealerId: string; dealerName: string }>>([]);
  const [addStoreRepNote, setAddStoreRepNote] = useState<string>('');
  const [isSearchingStores, setIsSearchingStores] = useState<boolean>(false);
  const [isSubmittingAddStores, setIsSubmittingAddStores] = useState<boolean>(false);

  // Success toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Fetch groups
  const fetchGroups = useCallback(async () => {
    setIsLoadingGroups(true);
    try {
      const res = await getDealerGroupsList({ search: groupSearch.trim() || undefined });
      if (res?.success) {
        setGroups(res.groups || []);
        setPendingRequestsCount(res.pendingRequestsCount || 0);
      }
    } catch (err) {
      console.error('Failed to load dealer groups:', err);
    } finally {
      setIsLoadingGroups(false);
    }
  }, [groupSearch]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  // Fetch proposals
  const fetchProposals = useCallback(async () => {
    setIsLoadingProposals(true);
    try {
      const res = await getDealerGroupRequests({ status: proposalFilter !== 'all' ? proposalFilter : undefined });
      if (res?.success) {
        setProposals(res.requests || []);
        setPendingRequestsCount(res.pendingCount || 0);

        // Initialize cherry pick decisions: default all dealers to 'approved'
        const initialDecisions: Record<string, Record<string, 'approved' | 'rejected'>> = {};
        res.requests?.forEach((req) => {
          if (req.status === 'pending' && req.dealers?.length > 0) {
            initialDecisions[req._id] = {};
            req.dealers.forEach((d) => {
              initialDecisions[req._id][d.dealerLocation] = 'approved';
            });
          }
        });
        setCherryPickDecisions((prev) => ({ ...prev, ...initialDecisions }));
      }
    } catch (err) {
      console.error('Failed to load proposals:', err);
    } finally {
      setIsLoadingProposals(false);
    }
  }, [proposalFilter]);

  useEffect(() => {
    if (activeTab === 'approvals') {
      fetchProposals();
    }
  }, [activeTab, fetchProposals]);

  // Toggle Rooftop Members expansion
  const toggleGroupExpand = async (group: DealerGroupItem) => {
    if (expandedGroupId === group._id) {
      setExpandedGroupId(null);
      return;
    }
    setExpandedGroupId(group._id);
    if (!groupMembers[group._id]) {
      setLoadingMembers((prev) => ({ ...prev, [group._id]: true }));
      try {
        const res = await getDealerGroupMembers(group._id);
        if (res?.success) {
          setGroupMembers((prev) => ({ ...prev, [group._id]: res.members || [] }));
        }
      } catch (err) {
        console.error('Failed to load group members:', err);
      } finally {
        setLoadingMembers((prev) => ({ ...prev, [group._id]: false }));
      }
    }
  };

  // Search dealers to add
  useEffect(() => {
    if (!addingToGroup || !storeSearchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingStores(true);
      try {
        const res = await searchDealers(storeSearchQuery.trim(), 20);
        if (res?.success) {
          setSearchResults(res.dealers || []);
        }
      } catch (err) {
        console.error('Store search error:', err);
      } finally {
        setIsSearchingStores(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [addingToGroup, storeSearchQuery]);

  // Handle Create Group Submission
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) {
      alert('Please enter a group name');
      return;
    }
    if (!isAdmin && !newGroupRepNote.trim()) {
      alert('Please provide an explanation or context note for your proposal');
      return;
    }

    setIsSubmittingCreate(true);
    try {
      const res = await createOrProposeDealerGroup({
        name: newGroupName.trim(),
        description: newGroupDescription.trim(),
        repNote: newGroupRepNote.trim() || undefined
      });
      if (res?.success) {
        showToast(res.message || 'Dealer group submitted successfully');
        setShowCreateModal(false);
        setNewGroupName('');
        setNewGroupDescription('');
        setNewGroupRepNote('');
        fetchGroups();
        onSuccess?.();
      }
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || 'Failed to create group');
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  // Handle Edit Group Submission
  const handleEditGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGroup) return;
    if (!editName.trim()) {
      alert('Please enter a group name');
      return;
    }
    if (!isAdmin && !editRepNote.trim()) {
      alert('Please provide an explanation or context note for your proposal');
      return;
    }

    setIsSubmittingEdit(true);
    try {
      const res = await updateOrProposeDealerGroup(editingGroup._id, {
        name: editName.trim(),
        description: editDescription.trim(),
        repNote: editRepNote.trim() || undefined
      });
      if (res?.success) {
        showToast(res.message || 'Group updated successfully');
        setEditingGroup(null);
        fetchGroups();
        onSuccess?.();
      }
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || 'Failed to update group');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // Handle Add Stores Submission
  const handleAddStoresSubmit = async () => {
    if (!addingToGroup) return;
    if (selectedStoresToAdd.length === 0) {
      alert('Please select at least one dealership');
      return;
    }
    if (!isAdmin && !addStoreRepNote.trim()) {
      alert('Please provide an explanation or context note for your proposal');
      return;
    }

    setIsSubmittingAddStores(true);
    try {
      if (isAdmin) {
        const res = await updateOrProposeDealerGroup(addingToGroup._id, {
          addDealerLocationIds: selectedStoresToAdd.map((s) => s._id)
        });
        if (res?.success) {
          showToast(`Assigned ${selectedStoresToAdd.length} rooftop(s) to ${addingToGroup.name}`);
          setAddingToGroup(null);
          setSelectedStoresToAdd([]);
          setStoreSearchQuery('');
          // Invalidate members cache
          setGroupMembers((prev) => {
            const next = { ...prev };
            delete next[addingToGroup._id];
            return next;
          });
          fetchGroups();
          onSuccess?.();
        }
      } else {
        const proposalDealers = selectedStoresToAdd.map((s) => ({
          dealerLocation: s._id,
          dealerId: s.dealerId,
          dealerName: s.dealerName,
          action: 'add' as const
        }));
        const res = await updateOrProposeDealerGroup(addingToGroup._id, {
          dealers: proposalDealers,
          repNote: addStoreRepNote.trim()
        });
        if (res?.success) {
          showToast(res.message || 'Proposal submitted for Admin approval');
          setAddingToGroup(null);
          setSelectedStoresToAdd([]);
          setStoreSearchQuery('');
          setAddStoreRepNote('');
          fetchGroups();
          onSuccess?.();
        }
      }
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || 'Failed to add stores');
    } finally {
      setIsSubmittingAddStores(false);
    }
  };

  // Handle Remove Rooftop from Group
  const handleRemoveStore = async (group: DealerGroupItem, store: GroupMemberLocation) => {
    if (!isAdmin) {
      const repNote = window.prompt(`Propose removal of ${store.dealerName} from ${group.name}. Provide reason:`);
      if (!repNote || !repNote.trim()) return;

      try {
        const res = await updateOrProposeDealerGroup(group._id, {
          dealers: [{
            dealerLocation: store._id,
            dealerId: store.dealerId,
            dealerName: store.dealerName,
            action: 'remove'
          }],
          repNote: repNote.trim()
        });
        if (res?.success) {
          showToast(`Removal proposal submitted for ${store.dealerName}`);
          onSuccess?.();
        }
      } catch (err: any) {
        alert(err.response?.data?.message || err.message || 'Failed to submit removal proposal');
      }
      return;
    }

    if (!window.confirm(`Remove ${store.dealerName} (${store.dealerId}) from ${group.name}?`)) {
      return;
    }

    try {
      const res = await updateOrProposeDealerGroup(group._id, {
        removeDealerLocationIds: [store._id]
      });
      if (res?.success) {
        showToast(`Removed ${store.dealerName} from ${group.name}`);
        setGroupMembers((prev) => ({
          ...prev,
          [group._id]: (prev[group._id] || []).filter((m) => m._id !== store._id)
        }));
        fetchGroups();
        onSuccess?.();
      }
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || 'Failed to remove store');
    }
  };

  // Handle Delete Group
  const handleDeleteGroup = async (group: DealerGroupItem) => {
    if (!isAdmin) {
      const repNote = window.prompt(`Propose deletion of group "${group.name}". Provide justification:`);
      if (!repNote || !repNote.trim()) return;
      try {
        const res = await deleteOrProposeDealerGroup(group._id, repNote.trim());
        if (res?.success) {
          showToast(`Deletion proposal for "${group.name}" submitted`);
          onSuccess?.();
        }
      } catch (err: any) {
        alert(err.response?.data?.message || err.message || 'Failed to propose deletion');
      }
      return;
    }

    if (!window.confirm(`Permanently delete dealer group "${group.name}"? All ${group.dealerCount} rooftops will be unassigned.`)) {
      return;
    }

    try {
      const res = await deleteOrProposeDealerGroup(group._id);
      if (res?.success) {
        showToast(`Deleted group "${group.name}"`);
        fetchGroups();
        onSuccess?.();
      }
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || 'Failed to delete group');
    }
  };

  // Toggle Cherry-pick item decision
  const toggleItemCherryPick = (proposalId: string, locationId: string) => {
    setCherryPickDecisions((prev) => {
      const current = prev[proposalId]?.[locationId] ?? 'approved';
      const updated = current === 'approved' ? 'rejected' : 'approved';
      return {
        ...prev,
        [proposalId]: {
          ...(prev[proposalId] || {}),
          [locationId]: updated
        }
      };
    });
  };

  // Admin Review Decision
  const handleReviewProposal = async (proposal: DealerGroupRequestItem, decision: 'approved' | 'rejected') => {
    setReviewingId(proposal._id);
    const note = reviewNotes[proposal._id] || '';
    const itemDecisions = cherryPickDecisions[proposal._id];

    try {
      const res = await reviewDealerGroupRequest(proposal._id, {
        decision,
        reviewNote: note.trim() || undefined,
        itemDecisions: decision === 'approved' ? itemDecisions : undefined
      });
      if (res?.success) {
        showToast(res.message || `Proposal ${decision}`);
        fetchProposals();
        fetchGroups();
        onSuccess?.();
      }
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || 'Failed to review proposal');
    } finally {
      setReviewingId(null);
    }
  };

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.title}>
              <Building2 size={19} color="#38bdf8" />
              <span>Dealer Groups & Rooftop Governance</span>
            </div>
            <span className={styles.subtitle}>
              Manage corporate umbrellas, rooftop assignments, and rep proposal approvals with retroactive historical updates.
            </span>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            title="Close (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Bar */}
        <div className={styles.navBar}>
          <div className={styles.navTabs}>
            <button
              type="button"
              className={`${styles.navTab} ${activeTab === 'groups' ? styles.navTabActive : ''}`}
              onClick={() => setActiveTab('groups')}
            >
              <Users size={14} />
              <span>Dealer Groups ({groups.length})</span>
            </button>
            <button
              type="button"
              className={`${styles.navTab} ${activeTab === 'approvals' ? styles.navTabActive : ''}`}
              onClick={() => setActiveTab('approvals')}
            >
              <CheckCircle2 size={14} />
              <span>{isAdmin ? 'Approval Desk' : 'My Proposals'}</span>
              {pendingRequestsCount > 0 && (
                <span className={styles.badgePill}>{pendingRequestsCount}</span>
              )}
            </button>
          </div>

          <div className={styles.navActions}>
            <button
              type="button"
              className={styles.createBtn}
              onClick={() => setShowCreateModal(true)}
            >
              <Plus size={14} />
              <span>{isAdmin ? 'Create Dealer Group' : 'Propose New Group'}</span>
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className={styles.contentArea}>
          {toastMsg && (
            <div style={{
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              color: '#34d399',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '12.5px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <CheckCircle2 size={15} />
              <span>{toastMsg}</span>
            </div>
          )}

          {/* TAB 1: DEALER GROUPS */}
          {activeTab === 'groups' && (
            <>
              {/* Search Bar */}
              <div className={styles.searchFilterRow}>
                <div className={styles.searchBox}>
                  <Search size={14} className={styles.searchIcon} />
                  <input
                    type="text"
                    className={styles.searchInput}
                    placeholder="Search dealer groups by name or description..."
                    value={groupSearch}
                    onChange={(e) => setGroupSearch(e.target.value)}
                  />
                </div>
                <span className={styles.countLabel}>
                  Showing {groups.length} group{groups.length === 1 ? '' : 's'}
                </span>
              </div>

              {/* Groups List */}
              {isLoadingGroups ? (
                <div className={styles.emptyState}>
                  <Loader2 size={24} className="spin" color="#38bdf8" />
                  <span>Loading dealer groups...</span>
                </div>
              ) : groups.length === 0 ? (
                <div className={styles.emptyState}>
                  <Building2 size={32} />
                  <div className={styles.emptyStateTitle}>No dealer groups found</div>
                  <span>{groupSearch ? 'Try a different search term' : 'Click "Create Dealer Group" to get started'}</span>
                </div>
              ) : (
                <div className={styles.groupsGrid}>
                  {groups.map((grp) => {
                    const isExpanded = expandedGroupId === grp._id;
                    const members = groupMembers[grp._id] || [];
                    const isLoadingMem = loadingMembers[grp._id];

                    return (
                      <div key={grp._id} className={styles.groupCard}>
                        <div className={styles.groupHeader}>
                          <div className={styles.groupTitleArea}>
                            <span className={styles.groupName}>{grp.name}</span>
                            {grp.isCustom ? (
                              <span className={styles.customBadge}>Custom Group</span>
                            ) : (
                              <span className={styles.autoBadge}>Auto-Detected</span>
                            )}
                            <span className={styles.storeCountPill}>
                              {grp.dealerCount} rooftop{grp.dealerCount === 1 ? '' : 's'}
                            </span>
                          </div>

                          <div className={styles.groupCardActions}>
                            <button
                              type="button"
                              className={styles.actionBtnAdd}
                              onClick={() => {
                                setAddingToGroup(grp);
                                setSelectedStoresToAdd([]);
                                setStoreSearchQuery('');
                              }}
                              title={isAdmin ? 'Add stores to group' : 'Propose stores for group'}
                            >
                              <Plus size={12} />
                              <span>{isAdmin ? 'Add Rooftop' : 'Propose Stores'}</span>
                            </button>

                            <button
                              type="button"
                              className={styles.actionBtnSmall}
                              onClick={() => {
                                setEditingGroup(grp);
                                setEditName(grp.name);
                                setEditDescription(grp.description || '');
                                setEditRepNote('');
                              }}
                              title="Edit group details"
                            >
                              <Edit2 size={12} />
                              <span>Edit</span>
                            </button>

                            <button
                              type="button"
                              className={styles.actionBtnDelete}
                              onClick={() => handleDeleteGroup(grp)}
                              title="Delete group"
                            >
                              <Trash2 size={12} />
                            </button>

                            <button
                              type="button"
                              className={styles.actionBtnSmall}
                              onClick={() => toggleGroupExpand(grp)}
                              title={isExpanded ? 'Hide rooftops' : 'View member rooftops'}
                            >
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              <span>{isExpanded ? 'Hide Stores' : 'Stores'}</span>
                            </button>
                          </div>
                        </div>

                        {grp.description && (
                          <div className={styles.groupDescription}>{grp.description}</div>
                        )}

                        {/* Expandable Rooftops View */}
                        {isExpanded && (
                          <div className={styles.membersDrawer}>
                            <div className={styles.membersHeader}>
                              <span>Member Rooftops ({members.length})</span>
                              <span>Click "x" to detach rooftop</span>
                            </div>

                            {isLoadingMem ? (
                              <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                                Loading member rooftops...
                              </div>
                            ) : members.length === 0 ? (
                              <div style={{ padding: '14px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
                                No rooftop locations currently assigned to this group. Click "Add Rooftop" above.
                              </div>
                            ) : (
                              <div className={styles.membersList}>
                                {members.map((mem) => (
                                  <div key={mem._id} className={styles.memberItem}>
                                    <div className={styles.memberInfo}>
                                      <span className={styles.memberName} title={mem.dealerName}>
                                        {mem.dealerName}
                                      </span>
                                      <div className={styles.memberSub}>
                                        <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{mem.dealerId}</span>
                                        {mem.dealerCity && mem.dealerState && (
                                          <span>• {mem.dealerCity}, {mem.dealerState}</span>
                                        )}
                                        {mem.businessType && (
                                          <span>• {mem.businessType}</span>
                                        )}
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      className={styles.removeMemberBtn}
                                      onClick={() => handleRemoveStore(grp, mem)}
                                      title="Remove rooftop from this group"
                                    >
                                      <X size={13} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* TAB 2: APPROVAL DESK (ADMIN) / MY PROPOSALS (REP) */}
          {activeTab === 'approvals' && (
            <>
              {/* Filter Tabs */}
              <div className={styles.searchFilterRow}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {['pending', 'approved', 'rejected', 'all'].map((st) => (
                    <button
                      key={st}
                      type="button"
                      className={`${styles.navTab} ${proposalFilter === st ? styles.navTabActive : ''}`}
                      onClick={() => setProposalFilter(st)}
                      style={{ textTransform: 'capitalize' }}
                    >
                      {st === 'pending' ? 'Pending Review' : st}
                    </button>
                  ))}
                </div>
                <span className={styles.countLabel}>
                  {proposals.length} proposal{proposals.length === 1 ? '' : 's'}
                </span>
              </div>

              {isLoadingProposals ? (
                <div className={styles.emptyState}>
                  <Loader2 size={24} className="spin" color="#38bdf8" />
                  <span>Loading proposals...</span>
                </div>
              ) : proposals.length === 0 ? (
                <div className={styles.emptyState}>
                  <CheckCircle2 size={32} color="#10b981" />
                  <div className={styles.emptyStateTitle}>No proposals in this queue</div>
                  <span>{proposalFilter === 'pending' ? 'All proposals have been reviewed!' : 'No proposals found for selected filter.'}</span>
                </div>
              ) : (
                <div className={styles.proposalsList}>
                  {proposals.map((prop) => {
                    const isPending = prop.status === 'pending';
                    const decisions = cherryPickDecisions[prop._id] || {};
                    const approvedCount = Object.values(decisions).filter((v) => v === 'approved').length;
                    const isReviewingThis = reviewingId === prop._id;

                    return (
                      <div key={prop._id} className={styles.proposalCard}>
                        {/* Top Row */}
                        <div className={styles.proposalTopRow}>
                          <div className={styles.proposalBadgeGroup}>
                            <span className={styles.requestTypeBadge}>
                              {prop.requestType.replace('_', ' ')}
                            </span>
                            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                              {prop.groupName}
                            </span>
                            <span className={
                              prop.status === 'pending'
                                ? styles.proposalStatusPending
                                : prop.status === 'approved' || prop.status === 'partially_approved'
                                ? styles.proposalStatusApproved
                                : styles.proposalStatusRejected
                            }>
                              {prop.status.replace('_', ' ')}
                            </span>
                          </div>

                          <span className={styles.proposalMeta}>
                            Proposed by <strong>{prop.requesterName || prop.requesterEmail || 'Sales Rep'}</strong> • {new Date(prop.createdAt).toLocaleDateString()}
                          </span>
                        </div>

                        {/* Rep Note */}
                        {prop.repNote && (
                          <div className={styles.repNoteQuote}>
                            "{prop.repNote}"
                          </div>
                        )}

                        {/* Dealerships Visual Diff */}
                        {prop.dealers && prop.dealers.length > 0 && (
                          <div className={styles.diffList}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '4px' }}>
                              Proposed Rooftop Changes ({prop.dealers.length}):
                            </div>
                            {prop.dealers.map((d) => {
                              const isAddition = d.action === 'add';
                              const isChecked = decisions[d.dealerLocation] === 'approved';

                              return (
                                <div key={d.dealerLocation} className={styles.diffItem}>
                                  <div className={styles.diffItemLeft}>
                                    {isPending && isAdmin && (
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => toggleItemCherryPick(prop._id, d.dealerLocation)}
                                        title="Check to approve this store, uncheck to reject"
                                        style={{ cursor: 'pointer' }}
                                      />
                                    )}
                                    {isAddition ? (
                                      <span className={styles.diffActionAdd}>+ ADD</span>
                                    ) : (
                                      <span className={styles.diffActionRemove}>- REMOVE</span>
                                    )}
                                    <span className={styles.diffDealerName}>
                                      {d.dealerName}
                                    </span>
                                    <span className={styles.diffDealerId}>({d.dealerId})</span>
                                  </div>

                                  {d.currentGroupName && (
                                    <span className={styles.diffCurrentGroup}>
                                      Current: {d.currentGroupName}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Reviewer note if already reviewed */}
                        {prop.reviewNote && !isPending && (
                          <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', padding: '6px 10px', background: 'var(--bg-surface-raised, rgba(30,41,59,0.4))', borderRadius: '6px' }}>
                            <strong>Reviewer Note ({prop.reviewerName || 'Admin'}):</strong> {prop.reviewNote}
                          </div>
                        )}

                        {/* Admin Action Controls for Pending Proposals */}
                        {isPending && isAdmin && (
                          <div className={styles.reviewActionsRow}>
                            <input
                              type="text"
                              className={styles.reviewNoteInput}
                              placeholder="Optional decision note for rep..."
                              value={reviewNotes[prop._id] || ''}
                              onChange={(e) => setReviewNotes({ ...reviewNotes, [prop._id]: e.target.value })}
                            />

                            <div className={styles.reviewButtons}>
                              <button
                                type="button"
                                className={styles.approveBtn}
                                onClick={() => handleReviewProposal(prop, 'approved')}
                                disabled={isReviewingThis}
                              >
                                <Check size={13} />
                                <span>
                                  {approvedCount === prop.dealers?.length
                                    ? 'Approve All'
                                    : `Approve Selected (${approvedCount})`}
                                </span>
                              </button>

                              <button
                                type="button"
                                className={styles.rejectBtn}
                                onClick={() => handleReviewProposal(prop, 'rejected')}
                                disabled={isReviewingThis}
                              >
                                <X size={13} />
                                <span>Reject Proposal</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* SUB-MODAL: CREATE GROUP */}
        {showCreateModal && (
          <div className={styles.subModalOverlay} onClick={() => setShowCreateModal(false)}>
            <div className={styles.subModalCard} onClick={(e) => e.stopPropagation()}>
              <div className={styles.subModalHeader}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {isAdmin ? 'Create Custom Dealer Group' : 'Propose New Dealer Group'}
                </span>
                <button type="button" className={styles.closeBtn} onClick={() => setShowCreateModal(false)}>
                  <X size={15} />
                </button>
              </div>

              <form onSubmit={handleCreateGroup}>
                <div className={styles.subModalBody}>
                  <label className={styles.formLabel}>
                    Group Name *
                    <input
                      type="text"
                      className={styles.formInput}
                      placeholder="e.g. Blue Compass RV, Southeast Campers..."
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      required
                    />
                  </label>

                  <label className={styles.formLabel}>
                    Description / Region
                    <input
                      type="text"
                      className={styles.formInput}
                      placeholder="Optional notes or regional scope..."
                      value={newGroupDescription}
                      onChange={(e) => setNewGroupDescription(e.target.value)}
                    />
                  </label>

                  {!isAdmin && (
                    <label className={styles.formLabel}>
                      Rep Justification Note *
                      <textarea
                        className={styles.formTextarea}
                        placeholder="Explain why this group is being proposed (e.g. corporate acquisition, new rooftop alliance)..."
                        value={newGroupRepNote}
                        onChange={(e) => setNewGroupRepNote(e.target.value)}
                        required
                      />
                    </label>
                  )}
                </div>

                <div className={styles.subModalFooter}>
                  <button type="button" className={styles.cancelBtn} onClick={() => setShowCreateModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className={styles.createBtn} disabled={isSubmittingCreate}>
                    {isSubmittingCreate ? <Loader2 size={13} className="spin" /> : <Plus size={13} />}
                    <span>{isAdmin ? 'Create Group' : 'Submit Proposal'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* SUB-MODAL: EDIT GROUP */}
        {editingGroup && (
          <div className={styles.subModalOverlay} onClick={() => setEditingGroup(null)}>
            <div className={styles.subModalCard} onClick={(e) => e.stopPropagation()}>
              <div className={styles.subModalHeader}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {isAdmin ? `Edit Group: ${editingGroup.name}` : `Propose Edit: ${editingGroup.name}`}
                </span>
                <button type="button" className={styles.closeBtn} onClick={() => setEditingGroup(null)}>
                  <X size={15} />
                </button>
              </div>

              <form onSubmit={handleEditGroup}>
                <div className={styles.subModalBody}>
                  <label className={styles.formLabel}>
                    Group Name *
                    <input
                      type="text"
                      className={styles.formInput}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      required
                    />
                  </label>

                  <label className={styles.formLabel}>
                    Description / Region
                    <input
                      type="text"
                      className={styles.formInput}
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                    />
                  </label>

                  {!isAdmin && (
                    <label className={styles.formLabel}>
                      Rep Justification Note *
                      <textarea
                        className={styles.formTextarea}
                        placeholder="Explain why this group modification is being proposed..."
                        value={editRepNote}
                        onChange={(e) => setEditRepNote(e.target.value)}
                        required
                      />
                    </label>
                  )}
                </div>

                <div className={styles.subModalFooter}>
                  <button type="button" className={styles.cancelBtn} onClick={() => setEditingGroup(null)}>
                    Cancel
                  </button>
                  <button type="submit" className={styles.createBtn} disabled={isSubmittingEdit}>
                    {isSubmittingEdit ? <Loader2 size={13} className="spin" /> : <Check size={13} />}
                    <span>{isAdmin ? 'Save Changes' : 'Submit Proposal'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* SUB-MODAL: ADD STORE PICKER */}
        {addingToGroup && (
          <div className={styles.subModalOverlay} onClick={() => setAddingToGroup(null)}>
            <div className={styles.subModalCard} onClick={(e) => e.stopPropagation()} style={{ width: '580px' }}>
              <div className={styles.subModalHeader}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {isAdmin ? `Add Rooftops to ${addingToGroup.name}` : `Propose Rooftops for ${addingToGroup.name}`}
                </span>
                <button type="button" className={styles.closeBtn} onClick={() => setAddingToGroup(null)}>
                  <X size={15} />
                </button>
              </div>

              <div className={styles.subModalBody}>
                <label className={styles.formLabel}>
                  Search Dealerships
                  <input
                    type="text"
                    className={styles.formInput}
                    placeholder="Search by name, ID (e.g. TX400, Campers...)"
                    value={storeSearchQuery}
                    onChange={(e) => setStoreSearchQuery(e.target.value)}
                    autoFocus
                  />
                </label>

                {/* Search Results */}
                {isSearchingStores ? (
                  <div style={{ padding: '10px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                    Searching network...
                  </div>
                ) : searchResults.length > 0 ? (
                  <div style={{
                    maxHeight: '180px',
                    overflowY: 'auto',
                    border: '1px solid rgba(51,65,85,0.6)',
                    borderRadius: '6px',
                    padding: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}>
                    {searchResults.map((d) => {
                      const isSelected = selectedStoresToAdd.some((s) => s._id === d._id);
                      return (
                        <div
                          key={d._id}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedStoresToAdd(selectedStoresToAdd.filter((s) => s._id !== d._id));
                            } else {
                              setSelectedStoresToAdd([...selectedStoresToAdd, { _id: d._id, dealerId: d.dealerId, dealerName: d.dealerName }]);
                            }
                          }}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '4px',
                            background: isSelected ? 'rgba(14, 165, 233, 0.15)' : 'var(--bg-surface-raised, rgba(15, 23, 42, 0.6))',
                            border: isSelected ? '1px solid #1e40af' : '1px solid var(--border-subtle, transparent)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: '12px'
                          }}
                        >
                          <div>
                            <strong style={{ color: 'var(--text-primary)' }}>{d.dealerName}</strong>
                            <span style={{ color: 'var(--text-secondary)', marginLeft: '6px', fontFamily: 'monospace' }}>({d.dealerId})</span>
                          </div>
                          {isSelected && <Check size={14} color="#38bdf8" />}
                        </div>
                      );
                    })}
                  </div>
                ) : storeSearchQuery.trim() ? (
                  <div style={{ padding: '8px', textAlign: 'center', color: '#64748b', fontSize: '11.5px' }}>
                    No dealers matching "{storeSearchQuery}"
                  </div>
                ) : null}

                {/* Selected Stores Chips */}
                {selectedStoresToAdd.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                    {selectedStoresToAdd.map((s) => (
                      <span
                        key={s._id}
                        style={{
                          background: 'rgba(14, 165, 233, 0.15)',
                          border: '1px solid rgba(14, 165, 233, 0.3)',
                          color: '#38bdf8',
                          padding: '3px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        {s.dealerName} ({s.dealerId})
                        <X
                          size={11}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setSelectedStoresToAdd(selectedStoresToAdd.filter((item) => item._id !== s._id))}
                        />
                      </span>
                    ))}
                  </div>
                )}

                {!isAdmin && (
                  <label className={styles.formLabel}>
                    Rep Justification Note *
                    <textarea
                      className={styles.formTextarea}
                      placeholder="Explain why these rooftops belong to this group (e.g. acquisition announcement, shared corporate ownership)..."
                      value={addStoreRepNote}
                      onChange={(e) => setAddStoreRepNote(e.target.value)}
                      required
                    />
                  </label>
                )}
              </div>

              <div className={styles.subModalFooter}>
                <button type="button" className={styles.cancelBtn} onClick={() => setAddingToGroup(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.createBtn}
                  onClick={handleAddStoresSubmit}
                  disabled={isSubmittingAddStores || selectedStoresToAdd.length === 0}
                >
                  {isSubmittingAddStores ? <Loader2 size={13} className="spin" /> : <Plus size={13} />}
                  <span>{isAdmin ? `Assign (${selectedStoresToAdd.length}) Stores` : `Propose (${selectedStoresToAdd.length}) Stores`}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
