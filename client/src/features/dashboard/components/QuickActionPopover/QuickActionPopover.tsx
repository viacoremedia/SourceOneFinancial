import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Flag,
  Check,
  Tag,
  AlertTriangle,
  Loader2,
  Building2,
  Radio,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Handshake,
  Briefcase
} from 'lucide-react';
import {
  updateDealerQuickAction,
  getDealerTags,
  setFundingHierarchy,
  unlinkFundingChild,
  dissolveFundingHierarchy,
  getDealerHierarchy,
  searchDealers,
  type QuickActionPayload
} from '../../../../core/services/api';
import styles from './QuickActionPopover.module.css';

export interface QuickActionDealer {
  _id: string;
  dealerId?: string;
  clientDealerId?: string;
  dealerName: string;
  systemStatus?: 'active' | 'closed' | 'bought_out' | 'no_longer_in_service';
  systemStatusReason?: string | null;
  businessType?: 'franchise' | 'non-franchise' | 'broker' | null;
  tags?: string[];
  isFundingParent?: boolean;
  fundingParent?: any;
  fundingChildren?: string[];
  fundingChildrenDetails?: any[];
}

export interface QuickActionPopoverProps {
  dealer: QuickActionDealer;
  onClose: () => void;
  onSaveSuccess: (updatedDealer: any, logId?: string) => void;
}

export const QuickActionPopover: React.FC<QuickActionPopoverProps> = ({
  dealer,
  onClose,
  onSaveSuccess
}) => {
  const [status, setStatus] = useState<'active' | 'closed' | 'bought_out' | 'no_longer_in_service'>(
    dealer.systemStatus || 'active'
  );
  const [reason, setReason] = useState<string>(dealer.systemStatusReason || '');
  const [businessType, setBusinessType] = useState<'franchise' | 'non-franchise' | 'broker' | null>(
    dealer.businessType || null
  );
  const [tags, setTags] = useState<string[]>(dealer.tags || []);

  const [tagInput, setTagInput] = useState<string>('');
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Hierarchy state
  const [isFundingParent, setIsFundingParent] = useState<boolean>(Boolean(dealer.isFundingParent));
  const [fundingParent, setFundingParent] = useState<any>(dealer.fundingParent || null);
  const [fundingChildren, setFundingChildren] = useState<any[]>(dealer.fundingChildrenDetails || []);
  const [hierarchyMsg, setHierarchyMsg] = useState<string | null>(null);

  // Hierarchy search states
  const [showChildSearch, setShowChildSearch] = useState<boolean>(false);
  const [childSearchQuery, setChildSearchQuery] = useState<string>('');
  const [childSearchResults, setChildSearchResults] = useState<any[]>([]);
  const [isSearchingChild, setIsSearchingChild] = useState<boolean>(false);

  const [showParentSearch, setShowParentSearch] = useState<boolean>(false);
  const [parentSearchQuery, setParentSearchQuery] = useState<string>('');
  const [parentSearchResults, setParentSearchResults] = useState<any[]>([]);
  const [isSearchingParent, setIsSearchingParent] = useState<boolean>(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getDealerTags()
      .then((res) => {
        if (res?.tags) {
          setAvailableTags(res.tags.map((t: any) => (typeof t === 'string' ? t : t.tag)));
        }
      })
      .catch((err) => {
        console.warn('Failed to load dealer tags for autocomplete:', err);
      });

    // Load full hierarchy state
    getDealerHierarchy(dealer._id)
      .then((res) => {
        if (res?.dealer) {
          setIsFundingParent(Boolean(res.dealer.isFundingParent));
          setFundingParent(res.dealer.fundingParent || null);
          setFundingChildren(res.dealer.fundingChildren || []);
        }
      })
      .catch((err) => {
        console.warn('Failed to load dealer hierarchy:', err);
      });
  }, [dealer._id]);

  // Debounced satellite store search
  useEffect(() => {
    if (!childSearchQuery.trim()) {
      setChildSearchResults([]);
      return;
    }
    setIsSearchingChild(true);
    const timer = setTimeout(() => {
      searchDealers(childSearchQuery, 10)
        .then((res) => {
          const linkedIds = new Set(fundingChildren.map((c: any) => c._id));
          const filtered = (res?.dealers || []).filter(
            (d: any) => d._id !== dealer._id && !linkedIds.has(d._id)
          );
          setChildSearchResults(filtered);
        })
        .catch(console.error)
        .finally(() => setIsSearchingChild(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [childSearchQuery, dealer._id, fundingChildren]);

  // Debounced parent store search
  useEffect(() => {
    if (!parentSearchQuery.trim()) {
      setParentSearchResults([]);
      return;
    }
    setIsSearchingParent(true);
    const timer = setTimeout(() => {
      searchDealers(parentSearchQuery, 10)
        .then((res) => {
          const filtered = (res?.dealers || []).filter((d: any) => d._id !== dealer._id);
          setParentSearchResults(filtered);
        })
        .catch(console.error)
        .finally(() => setIsSearchingParent(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [parentSearchQuery, dealer._id]);

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

  const handleAddTag = (tagToAdd: string) => {
    const trimmed = tagToAdd.trim();
    if (!trimmed) return;
    if (!tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      const nextTags = [...tags, trimmed];
      setTags(nextTags);
      const lower = trimmed.toLowerCase();
      if (lower === 'franchise') setBusinessType('franchise');
      else if (lower === 'non-franchise') setBusinessType('non-franchise');
      else if (lower === 'broker') setBusinessType('broker');
    }
    setTagInput('');
    setShowAutocomplete(false);
  };

  const handleRemoveTag = (indexToRemove: number) => {
    const tagToRemove = tags[indexToRemove];
    const confirmed = window.confirm(
      `Warning: Removing the tag "${tagToRemove}" will update dashboard filters, portfolio segmentation, and reports for this dealership.\n\nAre you sure you want to proceed?`
    );
    if (!confirmed) return;

    const nextTags = tags.filter((_, idx) => idx !== indexToRemove);
    setTags(nextTags);
    if (businessType && tagToRemove.toLowerCase() === businessType.toLowerCase()) {
      setBusinessType(null);
    }
  };

  const toggleSystemTag = (tagName: string, typeVal: 'franchise' | 'non-franchise' | 'broker') => {
    const hasTag = tags.some((t) => t.toLowerCase() === tagName.toLowerCase());
    if (hasTag) {
      const confirmed = window.confirm(
        `Warning: Removing the tag "${tagName}" will update dashboard filters, portfolio segmentation, and reports for this dealership.\n\nAre you sure you want to proceed?`
      );
      if (!confirmed) return;

      const nextTags = tags.filter((t) => t.toLowerCase() !== tagName.toLowerCase());
      setTags(nextTags);
      if (businessType === typeVal) {
        setBusinessType(null);
      }
    } else {
      // Add tag and sync businessType
      const filtered = tags.filter((t) => !['franchise', 'non-franchise', 'broker'].includes(t.toLowerCase()));
      setTags([...filtered, tagName]);
      setBusinessType(typeVal);
    }
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddTag(tagInput);
    }
  };

  const filteredAutocomplete = availableTags.filter(
    (t) =>
      tagInput.trim() &&
      t.toLowerCase().includes(tagInput.toLowerCase().trim()) &&
      !tags.some((cur) => cur.toLowerCase() === t.toLowerCase())
  );

  const handleLinkChild = async (childDealer: any) => {
    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      setHierarchyMsg(null);
      const res = await setFundingHierarchy(dealer._id, [childDealer._id]);
      if (res.success) {
        setIsFundingParent(true);
        const nextChildren = res.parent?.fundingChildren || [...fundingChildren, childDealer];
        setFundingChildren(nextChildren);
        setChildSearchQuery('');
        setShowChildSearch(false);
        setHierarchyMsg(`Linked "${childDealer.dealerName}" as satellite store`);
        onSaveSuccess(res.parent);
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to link satellite store');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnlinkChild = async (childId: string, childName: string) => {
    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      setHierarchyMsg(null);
      const res = await unlinkFundingChild(childId);
      if (res.success) {
        const remaining = fundingChildren.filter((c: any) => c._id !== childId);
        setFundingChildren(remaining);
        if (remaining.length === 0) {
          setIsFundingParent(false);
        }
        setHierarchyMsg(`Unlinked "${childName}"`);
        onSaveSuccess(res.parent || { ...dealer, isFundingParent: remaining.length > 0, fundingChildren: remaining });
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to unlink satellite store');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDissolveHierarchy = async () => {
    if (!window.confirm(`Dissolve Central Funder hierarchy for ${dealer.dealerName}? All satellite stores will return to standalone rooftop status.`)) {
      return;
    }
    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      setHierarchyMsg(null);
      const res = await dissolveFundingHierarchy(dealer._id);
      if (res.success) {
        setIsFundingParent(false);
        setFundingChildren([]);
        setHierarchyMsg('Funding hierarchy dissolved');
        onSaveSuccess({ ...dealer, isFundingParent: false, fundingChildren: [] });
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to dissolve hierarchy');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLinkToParent = async (parentDealer: any) => {
    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      setHierarchyMsg(null);
      const res = await setFundingHierarchy(parentDealer._id, [dealer._id]);
      if (res.success) {
        setFundingParent(parentDealer);
        setIsFundingParent(false);
        setShowParentSearch(false);
        setParentSearchQuery('');
        setHierarchyMsg(`Linked as satellite under "${parentDealer.dealerName}"`);
        onSaveSuccess({ ...dealer, fundingParent: parentDealer, isFundingParent: false });
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to link to parent store');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDetachFromParent = async () => {
    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      setHierarchyMsg(null);
      const res = await unlinkFundingChild(dealer._id);
      if (res.success) {
        setFundingParent(null);
        setHierarchyMsg('Detached from Central Funder');
        onSaveSuccess({ ...dealer, fundingParent: null });
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to detach from parent');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSave = async () => {
    const targetId = dealer.clientDealerId || dealer.dealerId || dealer._id;
    if (!targetId) return;

    setIsSubmitting(true);
    setErrorMsg(null);

    const payload: QuickActionPayload = {
      systemStatus: status,
      systemStatusReason: status === 'active' ? null : reason.trim() || null,
      businessType,
      tags
    };

    try {
      const res = await updateDealerQuickAction(targetId, payload);
      onSaveSuccess(res.dealer, res.logId);
      onClose();
    } catch (err: any) {
      console.error('Quick action update failed:', err);
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to save changes');
      setIsSubmitting(false);
    }
  };

  const dealerIdentifier = dealer.clientDealerId || dealer.dealerId || dealer._id;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        ref={cardRef}
        className={styles.popoverCard}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.titleArea}>
            <div className={styles.title}>
              <Flag size={15} color={status !== 'active' ? '#f87171' : '#38bdf8'} />
              <span>{dealer.dealerName}</span>
              <span className={styles.dealerIdBadge}>{dealerIdentifier}</span>
            </div>
            <span className={styles.subtitle}>In-cell classification & quick actions</span>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {errorMsg && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#f87171',
              padding: '6px 10px',
              borderRadius: '6px',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <AlertTriangle size={14} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Section 1: Lifecycle Status (Red Flag) */}
          <div className={styles.section}>
            <span className={styles.sectionLabel}>
              <Flag size={12} />
              <span>Dealership Lifecycle Status</span>
            </span>
            <div className={styles.statusGrid}>
              <button
                type="button"
                className={`${styles.statusBtn} ${status === 'active' ? styles.statusBtnActive : ''}`}
                onClick={() => setStatus('active')}
              >
                <CheckCircle2 size={12} color="#34d399" />
                <span>Active</span>
              </button>

              <button
                type="button"
                className={`${styles.statusBtn} ${status === 'closed' ? styles.statusBtnClosed : ''}`}
                onClick={() => setStatus('closed')}
              >
                <XCircle size={12} color="#f87171" />
                <span>Closed</span>
              </button>

              <button
                type="button"
                className={`${styles.statusBtn} ${status === 'bought_out' ? styles.statusBtnBoughtOut : ''}`}
                onClick={() => setStatus('bought_out')}
              >
                <Handshake size={12} color="#fbbf24" />
                <span>Bought Out</span>
              </button>

              <button
                type="button"
                className={`${styles.statusBtn} ${status === 'no_longer_in_service' ? styles.statusBtnOutOfService : ''}`}
                onClick={() => setStatus('no_longer_in_service')}
              >
                <AlertTriangle size={12} color="#f59e0b" />
                <span>Out of Service</span>
              </button>
            </div>

            {status !== 'active' && (
              <textarea
                className={styles.reasonInput}
                placeholder="Reason / notes (e.g. permanently closed, acquired by competitor)..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
              />
            )}
          </div>

          {/* Section 2: Classification & Tags (Consolidated) */}
          <div className={styles.section}>
            <span className={styles.sectionLabel}>
              <Tag size={12} />
              <span>Classification & Custom Tags</span>
            </span>

            {/* Default System Classification Tags */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
              <button
                type="button"
                className={`${styles.segmentBtn} ${tags.some(t => t.toLowerCase() === 'franchise') ? styles.segmentBtnSelected : ''}`}
                onClick={() => toggleSystemTag('Franchise', 'franchise')}
                style={{ flex: 1, padding: '4px 8px', fontSize: '11px', justifyContent: 'center' }}
                title="Toggle Franchise classification tag"
              >
                {tags.some(t => t.toLowerCase() === 'franchise') ? <Check size={11} /> : <Building2 size={11} />}
                <span>Franchise</span>
              </button>

              <button
                type="button"
                className={`${styles.segmentBtn} ${tags.some(t => t.toLowerCase() === 'non-franchise') ? styles.segmentBtnSelected : ''}`}
                onClick={() => toggleSystemTag('Non-Franchise', 'non-franchise')}
                style={{ flex: 1, padding: '4px 8px', fontSize: '11px', justifyContent: 'center' }}
                title="Toggle Non-Franchise classification tag"
              >
                {tags.some(t => t.toLowerCase() === 'non-franchise') && <Check size={11} />}
                <span>Non-Franchise</span>
              </button>

              <button
                type="button"
                className={`${styles.segmentBtn} ${tags.some(t => t.toLowerCase() === 'broker') ? styles.segmentBtnSelected : ''}`}
                onClick={() => toggleSystemTag('Broker', 'broker')}
                style={{ flex: 1, padding: '4px 8px', fontSize: '11px', justifyContent: 'center' }}
                title="Toggle Broker classification tag"
              >
                {tags.some(t => t.toLowerCase() === 'broker') ? <Check size={11} /> : <Briefcase size={11} />}
                <span>Broker</span>
              </button>
            </div>
            <div className={styles.tagBox}>
              {tags.length > 0 && (
                <div className={styles.tagChips}>
                  {tags.map((t, idx) => (
                    <span key={idx} className={styles.tagChip}>
                      <span>{t}</span>
                      <button
                        type="button"
                        className={styles.tagRemoveBtn}
                        onClick={() => handleRemoveTag(idx)}
                        title={`Remove tag "${t}"`}
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className={styles.tagInputWrapper}>
                <input
                  ref={tagInputRef}
                  type="text"
                  className={styles.tagInput}
                  placeholder={tags.length === 0 ? "Type tag name and press Enter..." : "Add another tag..."}
                  value={tagInput}
                  onChange={(e) => {
                    setTagInput(e.target.value);
                    setShowAutocomplete(true);
                  }}
                  onFocus={() => setShowAutocomplete(true)}
                  onKeyDown={handleTagKeyDown}
                />

                {showAutocomplete && filteredAutocomplete.length > 0 && (
                  <div className={styles.autocompleteDropdown}>
                    {filteredAutocomplete.slice(0, 5).map((sug, i) => (
                      <div
                        key={i}
                        className={styles.autocompleteItem}
                        onClick={() => handleAddTag(sug)}
                      >
                        <span>{sug}</span>
                        <span style={{ fontSize: '9px', opacity: 0.6 }}>existing tag</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 4: Funding Hierarchy (Central Funder vs Satellite Stores) */}
          <div className={styles.section}>
            <span className={styles.sectionLabel}>
              <Building2 size={12} />
              <span>Parent-Child Funding Hierarchy</span>
            </span>

            <div className={styles.hierarchyBox}>
              <div className={styles.hierarchyHeader}>
                {isFundingParent ? (
                  <span className={styles.hierarchyBadgeParent}>
                    <Building2 size={12} />
                    <span>Central Funder ({fundingChildren.length} satellite{fundingChildren.length === 1 ? '' : 's'})</span>
                  </span>
                ) : fundingParent ? (
                  <span className={styles.hierarchyBadgeChild}>
                    <Radio size={12} />
                    <span>Satellite Store</span>
                  </span>
                ) : (
                  <span className={styles.hierarchyBadgeStandalone}>
                    <span>Independent Rooftop</span>
                  </span>
                )}

                {isFundingParent && fundingChildren.length > 0 && (
                  <button
                    type="button"
                    className={styles.dissolveBtn}
                    onClick={handleDissolveHierarchy}
                    disabled={isSubmitting}
                    title="Dissolve all satellite links for this Central Funder"
                  >
                    <Trash2 size={11} />
                    <span>Dissolve</span>
                  </button>
                )}
              </div>

              {/* Central Funder view */}
              {isFundingParent && (
                <>
                  <div className={styles.hierarchyDescription}>
                    All loan applications and bookings for linked satellite stores route through this rooftop account.
                  </div>

                  {fundingChildren.length > 0 && (
                    <div className={styles.childrenList}>
                      {fundingChildren.map((c: any) => {
                        const cKey = c.dealerId || c.clientDealerId || c._id;
                        return (
                          <div key={c._id} className={styles.childItem}>
                            <div>
                              <span className={styles.childName}>{c.dealerName}</span>
                              <span className={styles.childId}>{cKey}</span>
                              {c.dealerCity && (
                                <span style={{ fontSize: '10px', color: '#64748b', marginLeft: '6px' }}>
                                  {c.dealerCity}, {c.statePrefix || c.dealerState}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              className={styles.unlinkBtn}
                              onClick={() => handleUnlinkChild(c._id, c.dealerName)}
                              disabled={isSubmitting}
                              title={`Detach ${c.dealerName} from Central Funder`}
                            >
                              <X size={12} />
                              <span>Detach</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add satellite store search picker */}
                  {!showChildSearch ? (
                    <button
                      type="button"
                      className={styles.actionBtnSmall}
                      onClick={() => setShowChildSearch(true)}
                      style={{ alignSelf: 'flex-start', marginTop: '4px' }}
                    >
                      <Plus size={12} />
                      <span>Add Satellite Store</span>
                    </button>
                  ) : (
                    <div className={styles.searchPickerWrapper}>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <input
                          type="text"
                          className={styles.searchPickerInput}
                          placeholder="Search rooftop name or dealer ID to link..."
                          value={childSearchQuery}
                          onChange={(e) => setChildSearchQuery(e.target.value)}
                          autoFocus
                        />
                        <button
                          type="button"
                          className={styles.cancelBtn}
                          onClick={() => {
                            setShowChildSearch(false);
                            setChildSearchQuery('');
                          }}
                          style={{ padding: '5px 8px', fontSize: '11px' }}
                        >
                          Cancel
                        </button>
                      </div>

                      {isSearchingChild && (
                        <div style={{ fontSize: '11px', color: '#94a3b8', padding: '4px 0' }}>Searching...</div>
                      )}

                      {childSearchResults.length > 0 && (
                        <div className={styles.searchPickerResults}>
                          {childSearchResults.map((deal) => (
                            <div
                              key={deal._id}
                              className={styles.searchPickerRow}
                              onClick={() => handleLinkChild(deal)}
                            >
                              <div>
                                <span style={{ fontWeight: 600, color: '#f1f5f9' }}>{deal.dealerName}</span>
                                <span style={{ color: '#38bdf8', fontSize: '10px', marginLeft: '6px' }}>
                                  {deal.dealerId || deal.clientDealerId}
                                </span>
                                {deal.statePrefix && (
                                  <span style={{ color: '#64748b', fontSize: '10px', marginLeft: '4px' }}>
                                    ({deal.statePrefix})
                                  </span>
                                )}
                              </div>
                              <span style={{ color: '#38bdf8', fontSize: '11px', fontWeight: 600 }}>+ Link</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Satellite Store view */}
              {!isFundingParent && fundingParent && (
                <>
                  <div className={styles.hierarchyDescription}>
                    Funds all financing and contracts through Central Funder:{' '}
                    <strong style={{ color: '#c084fc' }}>
                      {fundingParent.dealerName || 'Corporate Parent'}
                    </strong>
                    {' '}
                    <span className={styles.childId}>
                      ({fundingParent.dealerId || fundingParent.clientDealerId || 'Parent'})
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <button
                      type="button"
                      className={styles.unlinkBtn}
                      onClick={handleDetachFromParent}
                      disabled={isSubmitting}
                      style={{
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        background: 'rgba(239, 68, 68, 0.1)',
                        padding: '4px 8px',
                        borderRadius: '4px'
                      }}
                    >
                      <X size={12} />
                      <span>Detach from Central Funder</span>
                    </button>
                  </div>
                </>
              )}

              {/* Standalone Store view */}
              {!isFundingParent && !fundingParent && (
                <>
                  <div className={styles.hierarchyDescription}>
                    Currently funds independently under its own rooftop account.
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                    {!showChildSearch && !showParentSearch && (
                      <>
                        <button
                          type="button"
                          className={styles.actionBtnSmall}
                          onClick={() => setShowChildSearch(true)}
                        >
                          <Building2 size={12} />
                          <span>Designate as Central Funder</span>
                        </button>
                        <button
                          type="button"
                          className={styles.actionBtnSmall}
                          onClick={() => setShowParentSearch(true)}
                          style={{
                            background: 'rgba(148, 163, 184, 0.1)',
                            borderColor: 'rgba(148, 163, 184, 0.3)',
                            color: '#cbd5e1'
                          }}
                        >
                          <Radio size={12} />
                          <span>Link to Central Funder</span>
                        </button>
                      </>
                    )}

                    {showChildSearch && (
                      <div className={styles.searchPickerWrapper} style={{ width: '100%' }}>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <input
                            type="text"
                            className={styles.searchPickerInput}
                            placeholder="Search rooftop name or ID to add as satellite store..."
                            value={childSearchQuery}
                            onChange={(e) => setChildSearchQuery(e.target.value)}
                            autoFocus
                          />
                          <button
                            type="button"
                            className={styles.cancelBtn}
                            onClick={() => {
                              setShowChildSearch(false);
                              setChildSearchQuery('');
                            }}
                            style={{ padding: '5px 8px', fontSize: '11px' }}
                          >
                            Cancel
                          </button>
                        </div>

                        {isSearchingChild && (
                          <div style={{ fontSize: '11px', color: '#94a3b8', padding: '4px 0' }}>Searching...</div>
                        )}

                        {childSearchResults.length > 0 && (
                          <div className={styles.searchPickerResults}>
                            {childSearchResults.map((deal) => (
                              <div
                                key={deal._id}
                                className={styles.searchPickerRow}
                                onClick={() => handleLinkChild(deal)}
                              >
                                <div>
                                  <span style={{ fontWeight: 600, color: '#f1f5f9' }}>{deal.dealerName}</span>
                                  <span style={{ color: '#38bdf8', fontSize: '10px', marginLeft: '6px' }}>
                                    {deal.dealerId || deal.clientDealerId}
                                  </span>
                                  {deal.statePrefix && (
                                    <span style={{ color: '#64748b', fontSize: '10px', marginLeft: '4px' }}>
                                      ({deal.statePrefix})
                                    </span>
                                  )}
                                </div>
                                <span style={{ color: '#38bdf8', fontSize: '11px', fontWeight: 600 }}>+ Add Satellite</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {showParentSearch && (
                      <div className={styles.searchPickerWrapper} style={{ width: '100%' }}>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <input
                            type="text"
                            className={styles.searchPickerInput}
                            placeholder="Search Central Funder rooftop name or ID to fund through..."
                            value={parentSearchQuery}
                            onChange={(e) => setParentSearchQuery(e.target.value)}
                            autoFocus
                          />
                          <button
                            type="button"
                            className={styles.cancelBtn}
                            onClick={() => {
                              setShowParentSearch(false);
                              setParentSearchQuery('');
                            }}
                            style={{ padding: '5px 8px', fontSize: '11px' }}
                          >
                            Cancel
                          </button>
                        </div>

                        {isSearchingParent && (
                          <div style={{ fontSize: '11px', color: '#94a3b8', padding: '4px 0' }}>Searching...</div>
                        )}

                        {parentSearchResults.length > 0 && (
                          <div className={styles.searchPickerResults}>
                            {parentSearchResults.map((deal) => (
                              <div
                                key={deal._id}
                                className={styles.searchPickerRow}
                                onClick={() => handleLinkToParent(deal)}
                              >
                                <div>
                                  <span style={{ fontWeight: 600, color: '#f1f5f9' }}>{deal.dealerName}</span>
                                  <span style={{ color: '#c084fc', fontSize: '10px', marginLeft: '6px' }}>
                                    {deal.dealerId || deal.clientDealerId}
                                  </span>
                                  {deal.isFundingParent && (
                                    <span style={{ color: '#c084fc', fontSize: '10px', marginLeft: '6px', fontWeight: 700 }}>
                                      [Central Funder]
                                    </span>
                                  )}
                                </div>
                                <span style={{ color: '#c084fc', fontSize: '11px', fontWeight: 600 }}>Link as Parent</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}

              {hierarchyMsg && (
                <div style={{
                  fontSize: '11px',
                  color: '#34d399',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  marginTop: '4px'
                }}>
                  <CheckCircle2 size={12} />
                  <span>{hierarchyMsg}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={13} className={styles.spin} />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Check size={13} />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
