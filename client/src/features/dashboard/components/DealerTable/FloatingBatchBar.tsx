import React, { useState, useRef, useEffect } from 'react';
import {
  Tag,
  Flag,
  X,
  Check,
  Loader2,
  Trash2,
  Plus,
  Zap,
  CheckCircle2,
  XCircle,
  Handshake,
  AlertTriangle
} from 'lucide-react';
import {
  executeBatchDealerAction,
  type BatchActionPayload,
  type UniversalTag
} from '../../../../core/services/api';
import styles from './FloatingBatchBar.module.css';

export interface FloatingBatchBarProps {
  selectedIds: string[];
  totalSelectedCount?: number;
  selectAllAcrossPages?: boolean;
  filterQuery?: Record<string, any>;
  availableTags: UniversalTag[];
  onClearSelection: () => void;
  onBatchSuccess: (updatedDealers: any[], batchId: string, actionLabel: string) => void;
}

type FlyoutType = 'tags' | 'status' | null;

export const FloatingBatchBar: React.FC<FloatingBatchBarProps> = ({
  selectedIds,
  totalSelectedCount,
  selectAllAcrossPages,
  filterQuery,
  availableTags,
  onClearSelection,
  onBatchSuccess
}) => {
  const [activeFlyout, setActiveFlyout] = useState<FlyoutType>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Tag flyout state
  const [tagMode, setTagMode] = useState<'add' | 'remove'>('add');
  const [pendingTags, setPendingTags] = useState<string[]>([]);
  const [tagInputText, setTagInputText] = useState('');

  // Status flyout state
  const [selectedStatus, setSelectedStatus] = useState<'active' | 'closed' | 'bought_out' | 'no_longer_in_service'>('closed');
  const [statusReason, setStatusReason] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);

  // Close flyout on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActiveFlyout(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeFlyout) {
          setActiveFlyout(null);
        } else {
          onClearSelection();
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeFlyout, onClearSelection]);

  const handleAddPendingTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    if (!pendingTags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      setPendingTags([...pendingTags, trimmed]);
    }
    setTagInputText('');
  };

  const handleRemovePendingTag = (tag: string) => {
    setPendingTags(pendingTags.filter((t) => t !== tag));
  };

  const effectiveCount = selectAllAcrossPages && totalSelectedCount ? totalSelectedCount : selectedIds.length;

  const executeBatch = async (
    action: BatchActionPayload['action'],
    payload: BatchActionPayload['payload'],
    label: string
  ) => {
    if (!selectAllAcrossPages && selectedIds.length === 0) return;
    setIsSubmitting(true);
    try {
      const res = await executeBatchDealerAction({
        dealerIds: selectAllAcrossPages ? undefined : selectedIds,
        selectAllMatching: Boolean(selectAllAcrossPages),
        filterQuery: selectAllAcrossPages ? filterQuery : undefined,
        action,
        payload
      });
      onBatchSuccess(res.updatedDealers || [], res.batchId, label);
      setActiveFlyout(null);
      setPendingTags([]);
      setStatusReason('');
    } catch (err: any) {
      console.error('Batch execution error:', err);
      alert(err.response?.data?.message || err.message || 'Batch action failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter tag suggestions
  const tagSuggestions = availableTags
    .map((t) => t.tag)
    .filter(
      (t) =>
        tagInputText.trim() &&
        t.toLowerCase().includes(tagInputText.toLowerCase().trim()) &&
        !pendingTags.includes(t)
    );

  return (
    <div className={styles.floatingBarContainer} ref={containerRef}>
      {/* Pill count */}
      <div className={styles.countPill}>
        <Zap size={13} color="#38bdf8" />
        <span>{effectiveCount} Selected</span>
        {selectAllAcrossPages && (
          <span style={{ fontSize: '10px', background: 'rgba(56, 189, 248, 0.2)', padding: '1px 5px', borderRadius: '4px', color: '#38bdf8' }}>
            All matching
          </span>
        )}
      </div>

      {/* Action buttons */}
      <div className={styles.actionsGroup}>
        {/* Tags action */}
        <button
          type="button"
          className={`${styles.actionBtn} ${activeFlyout === 'tags' ? styles.actionBtnActive : ''}`}
          onClick={() => setActiveFlyout(activeFlyout === 'tags' ? null : 'tags')}
          disabled={isSubmitting}
        >
          <Tag size={13} />
          <span>Tags</span>
        </button>


        {/* Status action */}
        <button
          type="button"
          className={`${styles.actionBtn} ${activeFlyout === 'status' ? styles.actionBtnActive : ''}`}
          onClick={() => setActiveFlyout(activeFlyout === 'status' ? null : 'status')}
          disabled={isSubmitting}
        >
          <Flag size={13} />
          <span>Status</span>
        </button>
      </div>

      {/* Clear selection */}
      <button
        type="button"
        className={styles.clearBtn}
        onClick={onClearSelection}
        title="Deselect all (Esc)"
        disabled={isSubmitting}
      >
        <X size={14} />
      </button>

      {/* ── Flyout: Tags ── */}
      {activeFlyout === 'tags' && (
        <div className={styles.popoverFlyout}>
          <div className={styles.popoverHeader}>
            <div className={styles.popoverTitle}>
              <Tag size={14} color="#2dd4bf" />
              <span>Bulk Tagging ({selectedIds.length} stores)</span>
            </div>
            <button
              type="button"
              className={styles.popoverClose}
              onClick={() => setActiveFlyout(null)}
            >
              <X size={13} />
            </button>
          </div>

          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
            <button
              type="button"
              className={`${styles.actionBtn} ${tagMode === 'add' ? styles.actionBtnActive : ''}`}
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => setTagMode('add')}
            >
              <Plus size={12} />
              <span>Apply Tags</span>
            </button>
            <button
              type="button"
              className={`${styles.actionBtn} ${tagMode === 'remove' ? styles.actionBtnActive : ''}`}
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => setTagMode('remove')}
            >
              <Trash2 size={12} />
              <span>Remove Tags</span>
            </button>
          </div>

          <div className={styles.tagInputBox}>
            {pendingTags.map((t) => (
              <span key={t} className={styles.tagPill}>
                <span>{t}</span>
                <button
                  type="button"
                  className={styles.tagPillRemove}
                  onClick={() => handleRemovePendingTag(t)}
                >
                  <X size={10} />
                </button>
              </span>
            ))}
            <input
              type="text"
              className={styles.tagInputField}
              placeholder={pendingTags.length === 0 ? 'Type or pick tags...' : 'Add more...'}
              value={tagInputText}
              onChange={(e) => setTagInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  handleAddPendingTag(tagInputText);
                }
              }}
              autoFocus
            />
          </div>

          {tagSuggestions.length > 0 && (
            <div className={styles.suggestionsList}>
              {tagSuggestions.slice(0, 5).map((sug) => (
                <div
                  key={sug}
                  className={styles.suggestionItem}
                  onClick={() => handleAddPendingTag(sug)}
                >
                  <span>{sug}</span>
                  <span style={{ fontSize: '10px', opacity: 0.6 }}>existing</span>
                </div>
              ))}
            </div>
          )}

          {/* Quick preset tags */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', flexWrap: 'wrap' }}>
            {['Franchise', 'Non-Franchise', 'Broker'].map(sysTag => (
              <button
                key={sysTag}
                type="button"
                className={styles.actionBtn}
                style={{ padding: '2px 8px', fontSize: '10px', height: 'auto', lineHeight: '1.4' }}
                onClick={() => handleAddPendingTag(sysTag)}
                title={`Add ${sysTag} to batch selection`}
              >
                + {sysTag}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={styles.submitBtn}
            disabled={isSubmitting || pendingTags.length === 0}
            onClick={() => {
              if (tagMode === 'remove') {
                const confirmed = window.confirm(
                  `Warning: Removing tag(s) "${pendingTags.join(', ')}" across ${selectedIds.length} dealerships will alter dashboard filters, segmentation, and reports.\n\nAre you sure you want to proceed?`
                );
                if (!confirmed) return;
              }
              executeBatch(
                tagMode === 'add' ? 'add_tags' : 'remove_tags',
                { tags: pendingTags },
                tagMode === 'add' ? `Added ${pendingTags.join(', ')}` : `Removed ${pendingTags.join(', ')}`
              );
            }}
          >
            {isSubmitting ? (
              <Loader2 size={13} className={styles.spin} />
            ) : (
              <Check size={13} />
            )}
            <span>{tagMode === 'add' ? 'Apply Tags to All' : 'Remove Tags from All'}</span>
          </button>
        </div>
      )}


      {/* ── Flyout: Status ── */}
      {activeFlyout === 'status' && (
        <div className={styles.popoverFlyout}>
          <div className={styles.popoverHeader}>
            <div className={styles.popoverTitle}>
              <Flag size={14} color="#f87171" />
              <span>Set Status ({selectedIds.length} stores)</span>
            </div>
            <button
              type="button"
              className={styles.popoverClose}
              onClick={() => setActiveFlyout(null)}
            >
              <X size={13} />
            </button>
          </div>

          <div className={styles.optionsGrid}>
            <div
              className={`${styles.optionCard} ${selectedStatus === 'active' ? styles.optionCardSelected : ''}`}
              onClick={() => setSelectedStatus('active')}
            >
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <CheckCircle2 size={13} color="#34d399" />
                <span>Active</span>
              </div>
            </div>
            <div
              className={`${styles.optionCard} ${selectedStatus === 'closed' ? styles.optionCardSelected : ''}`}
              onClick={() => setSelectedStatus('closed')}
            >
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <XCircle size={13} color="#f87171" />
                <span>Closed</span>
              </div>
            </div>
            <div
              className={`${styles.optionCard} ${selectedStatus === 'bought_out' ? styles.optionCardSelected : ''}`}
              onClick={() => setSelectedStatus('bought_out')}
            >
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <Handshake size={13} color="#fbbf24" />
                <span>Bought Out</span>
              </div>
            </div>
            <div
              className={`${styles.optionCard} ${selectedStatus === 'no_longer_in_service' ? styles.optionCardSelected : ''}`}
              onClick={() => setSelectedStatus('no_longer_in_service')}
            >
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <AlertTriangle size={13} color="#f59e0b" />
                <span>Out of Service</span>
              </div>
            </div>
          </div>

          {selectedStatus !== 'active' && (
            <input
              type="text"
              className={styles.reasonInput}
              placeholder="Reason for flag (e.g. acquired by Camping World)..."
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
            />
          )}

          <button
            type="button"
            className={styles.submitBtn}
            disabled={isSubmitting}
            onClick={() =>
              executeBatch(
                'set_status',
                { systemStatus: selectedStatus, systemStatusReason: statusReason },
                `Set status to ${selectedStatus}`
              )
            }
          >
            {isSubmitting ? (
              <Loader2 size={13} className={styles.spin} />
            ) : (
              <Check size={13} />
            )}
            <span>Apply Status Flag</span>
          </button>
        </div>
      )}
    </div>
  );
};
