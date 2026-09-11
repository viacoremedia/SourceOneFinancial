import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  History,
  RotateCcw,
  Search,
  RefreshCw,
  Tag,
  Building2,
  Flag,
  Layers,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import {
  getSystemAuditLogs,
  undoAuditLogAction,
  type SystemAuditLogItem
} from '../../../../core/services/api';
import styles from './SystemAuditModal.module.css';

export interface SystemAuditModalProps {
  isOpen?: boolean;
  onClose: () => void;
  onUndoSuccess?: () => void;
}

export const SystemAuditModal: React.FC<SystemAuditModalProps> = ({
  isOpen = true,
  onClose,
  onUndoSuccess
}) => {
  if (!isOpen) return null;
  const [logs, setLogs] = useState<SystemAuditLogItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(30);
  const [category, setCategory] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [undoingLogId, setUndoingLogId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getSystemAuditLogs({
        page,
        limit,
        action: category !== 'all' ? category : undefined,
        search: debouncedSearch.trim() || undefined
      });
      if (res?.success) {
        setLogs(res.logs || []);
        setTotal(res.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch system audit logs:', err);
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, category, debouncedSearch]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleUndo = async (log: SystemAuditLogItem) => {
    const isBatch = log.action.startsWith('batch_') || log.dealerId === 'BULK' || (log.previousState?.dealers && log.previousState.dealers.length > 0);
    const confirmPrompt = isBatch
      ? `Undo batch action "${formatActionName(log.action)}" for ${log.dealerName}? This will revert all dealerships in this batch back to their previous states.`
      : `Undo action "${formatActionName(log.action)}" for ${log.dealerName}?`;
    if (!window.confirm(confirmPrompt)) {
      return;
    }
    setUndoingLogId(log._id);
    try {
      const res = await undoAuditLogAction(log._id);
      if (res?.success) {
        setToastMsg(`Successfully reverted: ${log.dealerName}`);
        // Mark as undone locally
        setLogs((prev) =>
          prev.map((l) => (l._id === log._id || (log.batchId && l.batchId === log.batchId) ? { ...l, isUndone: true, undoneAt: new Date().toISOString() } : l))
        );
        onUndoSuccess?.();
      }
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || 'Failed to undo action');
    } finally {
      setUndoingLogId(null);
    }
  };

  const formatActionName = (action: string) => {
    switch (action) {
      case 'status_change': return 'Status Changed';
      case 'business_type_change': return 'Business Type Changed';
      case 'tags_update': return 'Tags Updated';
      case 'global_tag_create': return 'Global Tag Created';
      case 'global_tag_delete': return 'Global Tag Deleted';
      case 'hierarchy_set': return 'Satellite Linked';
      case 'hierarchy_unlink': return 'Satellite Unlinked';
      case 'hierarchy_dissolve': return 'Hierarchy Dissolved';
      case 'batch_status_change': return 'Batch Status Changed';
      case 'batch_business_type_change': return 'Batch Type Changed';
      case 'batch_tags_add': return 'Batch Tags Added';
      case 'batch_tags_remove': return 'Batch Tags Removed';
      case 'batch_update': return 'Batch Update';
      case 'group_create': return 'Group Created';
      case 'group_update': return 'Group Updated';
      case 'group_delete': return 'Group Deleted';
      case 'group_add_dealers': return 'Stores Added to Group';
      case 'group_remove_dealers': return 'Stores Removed from Group';
      case 'group_proposal_create': return 'Group Proposal Submitted';
      case 'group_proposal_approve': return 'Group Proposal Approved';
      case 'group_proposal_reject': return 'Group Proposal Rejected';
      default: return action.replace(/_/g, ' ');
    }
  };

  const getActionBadgeClass = (action: string) => {
    if (action.includes('status') || action.includes('dissolve')) {
      return styles.actionStatusRed;
    }
    if (action.includes('tag')) {
      return styles.actionTagBlue;
    }
    if (action.includes('hierarchy') || action.includes('group')) {
      return styles.actionHierarchyPurple;
    }
    if (action.includes('batch')) {
      return styles.actionBatchAmber;
    }
    return styles.actionStatusGreen;
  };

  const formatDiff = (log: SystemAuditLogItem) => {
    const prev = log.previousState;
    const next = log.newState;

    if (log.action.startsWith('batch_')) {
      const count = prev?.affectedCount || prev?.dealers?.length || next?.affectedCount || 'Bulk';
      if (log.action === 'batch_tags_add') {
        const tags = next?.payload?.tags || next?.tags || [];
        return (
          <div className={styles.diffContainer}>
            <span className={styles.diffPillNew}>+{tags.join(', ')} ({count} dealers)</span>
          </div>
        );
      }
      if (log.action === 'batch_tags_remove') {
        const tags = next?.payload?.tags || next?.tags || [];
        return (
          <div className={styles.diffContainer}>
            <span className={styles.diffPill}>-{tags.join(', ')} ({count} dealers)</span>
          </div>
        );
      }
      if (log.action === 'batch_status_change') {
        const st = next?.payload?.systemStatus || next?.systemStatus || 'active';
        return (
          <div className={styles.diffContainer}>
            <span className={styles.diffPillNew}>Status: {st} ({count} dealers)</span>
          </div>
        );
      }
      if (log.action === 'batch_business_type_change') {
        const bt = next?.payload?.businessType || next?.businessType || 'none';
        return (
          <div className={styles.diffContainer}>
            <span className={styles.diffPillNew}>Type: {bt} ({count} dealers)</span>
          </div>
        );
      }
    }

    if (log.action.includes('status')) {
      return (
        <div className={styles.diffContainer}>
          <span className={styles.diffPill}>{prev?.systemStatus || 'active'}</span>
          <span>→</span>
          <span className={styles.diffPillNew}>{next?.systemStatus || 'active'}</span>
        </div>
      );
    }

    if (log.action.includes('business_type')) {
      return (
        <div className={styles.diffContainer}>
          <span className={styles.diffPill}>{prev?.businessType || 'none'}</span>
          <span>→</span>
          <span className={styles.diffPillNew}>{next?.businessType || 'none'}</span>
        </div>
      );
    }

    if (log.action === 'global_tag_create') {
      return (
        <div className={styles.diffContainer}>
          <span className={styles.diffPillNew}>+{next?.tag}</span>
        </div>
      );
    }

    if (log.action === 'global_tag_delete') {
      return (
        <div className={styles.diffContainer}>
          <span className={styles.diffPill}>-{prev?.tag}</span>
        </div>
      );
    }

    if (log.action.includes('hierarchy')) {
      if (log.action === 'hierarchy_set') {
        return (
          <div className={styles.diffContainer}>
            <span className={styles.diffPillNew}>Parent: {log.metadata?.parentName || 'Corporate'}</span>
          </div>
        );
      }
      if (log.action === 'hierarchy_unlink') {
        return (
          <div className={styles.diffContainer}>
            <span className={styles.diffPill}>Unlinked from parent</span>
          </div>
        );
      }
      if (log.action === 'hierarchy_dissolve') {
        return (
          <div className={styles.diffContainer}>
            <span className={styles.diffPill}>All satellites detached</span>
          </div>
        );
      }
    }

    if (log.action.includes('tag')) {
      const prevTags = Array.isArray(prev?.tags) ? prev.tags : [];
      const nextTags = Array.isArray(next?.tags) ? next.tags : [];
      return (
        <div className={styles.diffContainer}>
          <span className={styles.diffPill}>{prevTags.length} tag(s)</span>
          <span>→</span>
          <span className={styles.diffPillNew}>{nextTags.length} tag(s)</span>
        </div>
      );
    }

    if (log.action.startsWith('group_')) {
      if (log.action === 'group_create') {
        return (
          <div className={styles.diffContainer}>
            <span className={styles.diffPillNew}>+{next?.name || 'Group'}</span>
          </div>
        );
      }
      if (log.action === 'group_delete') {
        return (
          <div className={styles.diffContainer}>
            <span className={styles.diffPill}>-{prev?.name || 'Group'} ({prev?.memberIds?.length || 0} stores)</span>
          </div>
        );
      }
      if (log.action === 'group_update') {
        return (
          <div className={styles.diffContainer}>
            <span className={styles.diffPill}>{prev?.name || 'Group'}</span>
            <span>→</span>
            <span className={styles.diffPillNew}>{next?.name || 'Group'}</span>
          </div>
        );
      }
      if (log.action === 'group_add_dealers') {
        const count = next?.dealers?.length || next?.addedDealerLocationIds?.length || 1;
        return (
          <div className={styles.diffContainer}>
            <span className={styles.diffPillNew}>+{count} store(s) to {next?.groupName}</span>
          </div>
        );
      }
      if (log.action === 'group_remove_dealers') {
        const count = prev?.removedDealers?.length || next?.unassignedDealerLocationIds?.length || 1;
        return (
          <div className={styles.diffContainer}>
            <span className={styles.diffPill}>-{count} store(s) from group</span>
          </div>
        );
      }
      if (log.action === 'group_proposal_create') {
        return (
          <div className={styles.diffContainer}>
            <span className={styles.diffPill}>{next?.groupName} ({next?.dealersCount || 0} stores proposed)</span>
          </div>
        );
      }
      if (log.action === 'group_proposal_approve') {
        return (
          <div className={styles.diffContainer}>
            <span className={styles.diffPillNew}>Approved: {next?.groupName} (+{next?.approvedAddCount || 0})</span>
          </div>
        );
      }
      if (log.action === 'group_proposal_reject') {
        return (
          <div className={styles.diffContainer}>
            <span className={styles.diffPill}>Proposal Rejected</span>
          </div>
        );
      }
    }

    return null;
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.title}>
              <History size={18} color="#38bdf8" />
              <span>System Operations & Audit Trail</span>
            </div>
            <span className={styles.subtitle}>
              Complete audit log of status red-flags, business types, global tags, funding hierarchies, and 1-click undos.
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

        {/* Toolbar */}
        <div className={styles.toolbar}>
          <div className={styles.filterTabs}>
            <button
              type="button"
              className={`${styles.filterTab} ${category === 'all' ? styles.filterTabActive : ''}`}
              onClick={() => { setCategory('all'); setPage(1); }}
            >
              All Operations
            </button>
            <button
              type="button"
              className={`${styles.filterTab} ${category === 'status' ? styles.filterTabActive : ''}`}
              onClick={() => { setCategory('status'); setPage(1); }}
            >
              <Flag size={11} style={{ display: 'inline', marginRight: '4px' }} />
              Status Flags
            </button>
            <button
              type="button"
              className={`${styles.filterTab} ${category === 'tags' ? styles.filterTabActive : ''}`}
              onClick={() => { setCategory('tags'); setPage(1); }}
            >
              <Tag size={11} style={{ display: 'inline', marginRight: '4px' }} />
              Tags
            </button>
            <button
              type="button"
              className={`${styles.filterTab} ${category === 'hierarchy' ? styles.filterTabActive : ''}`}
              onClick={() => { setCategory('hierarchy'); setPage(1); }}
            >
              <Building2 size={11} style={{ display: 'inline', marginRight: '4px' }} />
              Hierarchy
            </button>
            <button
              type="button"
              className={`${styles.filterTab} ${category === 'group' ? styles.filterTabActive : ''}`}
              onClick={() => { setCategory('group'); setPage(1); }}
            >
              <Building2 size={11} style={{ display: 'inline', marginRight: '4px' }} />
              Dealer Groups
            </button>
            <button
              type="button"
              className={`${styles.filterTab} ${category === 'batch' ? styles.filterTabActive : ''}`}
              onClick={() => { setCategory('batch'); setPage(1); }}
            >
              <Layers size={11} style={{ display: 'inline', marginRight: '4px' }} />
              Batch Actions
            </button>
          </div>

          <div className={styles.toolbarRight}>
            <div className={styles.searchInputWrapper}>
              <Search size={14} className={styles.searchIcon} />
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Search dealer, ID, user, or reason..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <button
              type="button"
              className={styles.refreshBtn}
              onClick={fetchLogs}
              title="Refresh audit history"
            >
              <RefreshCw size={13} className={isLoading ? styles.spin : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Content Table */}
        <div className={styles.contentArea}>
          {toastMsg && (
            <div style={{
              background: 'rgba(16, 185, 129, 0.15)',
              borderBottom: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#34d399',
              padding: '8px 20px',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <CheckCircle2 size={14} />
              <span>{toastMsg}</span>
            </div>
          )}

          {isLoading ? (
            <div className={styles.emptyState}>
              <Loader2 size={24} className={styles.spin} color="#38bdf8" />
              <span>Loading system audit trail...</span>
            </div>
          ) : logs.length === 0 ? (
            <div className={styles.emptyState}>
              <History size={32} />
              <span style={{ fontWeight: 600, color: '#94a3b8' }}>No audit history records found</span>
              <span style={{ fontSize: '12px' }}>Try switching category filters or clearing your search term.</span>
            </div>
          ) : (
            <table className={styles.logTable}>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Operator</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Change Details</th>
                  <th>Reason / Notes</th>
                  <th style={{ textAlign: 'right' }}>Undo Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const dateObj = new Date(log.createdAt);
                  const timeStr = dateObj.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  });
                  const operatorName = log.changedBy?.name || log.user?.name || 'Sales Rep';

                  return (
                    <tr
                      key={log._id}
                      className={`${styles.logRow} ${log.isUndone ? styles.logRowUndone : ''}`}
                    >
                      <td className={styles.logCell}>
                        <span className={styles.timestamp}>{timeStr}</span>
                      </td>

                      <td className={styles.logCell}>
                        <span className={styles.operatorBadge}>{operatorName}</span>
                      </td>

                      <td className={styles.logCell}>
                        <span className={`${styles.actionBadge} ${getActionBadgeClass(log.action)}`}>
                          {formatActionName(log.action)}
                        </span>
                      </td>

                      <td className={styles.logCell}>
                        <div className={styles.targetInfo}>
                          <span className={styles.targetName}>
                            {log.dealerId === 'BULK' && (
                              <Layers size={11} style={{ display: 'inline', marginRight: '4px', verticalAlign: '-1px', color: '#f59e0b' }} />
                            )}
                            {log.dealerName}
                          </span>
                          {log.dealerId && log.dealerId !== 'GLOBAL' && (
                            <span className={styles.targetId}>{log.dealerId}</span>
                          )}
                        </div>
                      </td>

                      <td className={styles.logCell}>
                        {formatDiff(log)}
                      </td>

                      <td className={styles.logCell}>
                        <span className={styles.reasonText} title={log.reason || undefined}>
                          {log.reason || '—'}
                        </span>
                      </td>

                      <td className={styles.logCell} style={{ textAlign: 'right' }}>
                        {log.isUndone ? (
                          <span className={styles.undoneTag}>
                            <RotateCcw size={10} />
                            <span>Undone</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className={styles.undoBtn}
                            onClick={() => handleUndo(log)}
                            disabled={undoingLogId === log._id}
                            title="Revert this action to its previous state"
                          >
                            {undoingLogId === log._id ? (
                              <Loader2 size={11} className={styles.spin} />
                            ) : (
                              <RotateCcw size={11} />
                            )}
                            <span>Undo</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer / Pagination */}
        <div className={styles.footer}>
          <span className={styles.paginationText}>
            Showing {logs.length} of {total} operations recorded
          </span>

          <div className={styles.pageBtns}>
            <button
              type="button"
              className={styles.pageBtn}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isLoading}
            >
              Previous
            </button>
            <span style={{ fontSize: '11px', color: '#cbd5e1', alignSelf: 'center', padding: '0 4px' }}>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className={styles.pageBtn}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isLoading}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
