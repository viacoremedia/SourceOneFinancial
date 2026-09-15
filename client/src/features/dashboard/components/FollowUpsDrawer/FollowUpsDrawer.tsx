import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  CalendarClock,
  Clock,
  RotateCcw,
  Search,
  Check,
  ExternalLink,
  Trash2,
  Loader2,
  Plus,
  Building2
} from 'lucide-react';
import {
  getFollowUps,
  updateFollowUp,
  deleteFollowUp,
  undoFollowUpAction,
  createFollowUp,
  searchDealers,
  type FollowUpItem
} from '../../../../core/services/api';
import styles from './FollowUpsDrawer.module.css';

export interface FollowUpsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDealer?: (dealerId: string) => void;
  onCountsUpdated?: (counts: { totalActive: number; overdueCount: number; todayCount: number }) => void;
}

export const FollowUpsDrawer: React.FC<FollowUpsDrawerProps> = ({
  isOpen,
  onClose,
  onSelectDealer,
  onCountsUpdated
}) => {
  const [activeTab, setActiveTab] = useState<'active' | 'completed' | 'all'>('active');
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([]);
  const [counts, setCounts] = useState({ totalActive: 0, overdueCount: 0, todayCount: 0 });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [lastActionLogId, setLastActionLogId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // In-drawer scheduling state
  const [isSchedulerOpen, setIsSchedulerOpen] = useState(false);
  const [dealerSearchInput, setDealerSearchInput] = useState('');
  const [dealerResults, setDealerResults] = useState<Array<{ _id: string; dealerName: string; dealerId: string; clientDealerId: string; statePrefix: string }>>([]);
  const [isSearchingDealers, setIsSearchingDealers] = useState(false);
  const [selectedDealer, setSelectedDealer] = useState<{ _id: string; dealerName: string; dealerId: string; clientDealerId?: string; statePrefix?: string } | null>(null);

  const getDefaultDateTime = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [scheduleDateTime, setScheduleDateTime] = useState(getDefaultDateTime());
  const [scheduleNote, setScheduleNote] = useState('');
  const [isSubmittingSchedule, setIsSubmittingSchedule] = useState(false);

  // Search dealers with debounce
  useEffect(() => {
    if (!dealerSearchInput.trim() || selectedDealer) {
      setDealerResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingDealers(true);
      try {
        const res = await searchDealers(dealerSearchInput.trim(), 10);
        if (res?.success) {
          setDealerResults(res.dealers || []);
        }
      } catch (err) {
        console.error('Failed to search dealers in follow-ups drawer:', err);
      } finally {
        setIsSearchingDealers(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [dealerSearchInput, selectedDealer]);

  const applyPreset = (daysAhead: number, hour: number = 10) => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    d.setHours(hour, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    setScheduleDateTime(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
  };

  const applyNextMonday = () => {
    const d = new Date();
    const day = d.getDay();
    const daysUntilNextMonday = (8 - day) % 7 || 7;
    d.setDate(d.getDate() + daysUntilNextMonday);
    d.setHours(9, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    setScheduleDateTime(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
  };

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDealer || !scheduleDateTime) return;

    setIsSubmittingSchedule(true);
    try {
      const res = await createFollowUp({
        dealerId: selectedDealer.clientDealerId || selectedDealer.dealerId,
        dealerName: selectedDealer.dealerName,
        clientDealerId: selectedDealer.clientDealerId || null,
        dueDate: new Date(scheduleDateTime).toISOString(),
        note: scheduleNote.trim()
      });

      setLastActionLogId(res.logId);
      setFeedback(`Follow-up scheduled for ${selectedDealer.dealerName}`);
      setSelectedDealer(null);
      setDealerSearchInput('');
      setScheduleNote('');
      setScheduleDateTime(getDefaultDateTime());
      setIsSchedulerOpen(false);

      fetchFollowUps();
      window.dispatchEvent(new CustomEvent('followups-updated'));
    } catch (err: any) {
      console.error('Failed to schedule follow-up:', err);
      setFeedback(err?.response?.data?.message || err?.message || 'Failed to schedule follow-up');
    } finally {
      setIsSubmittingSchedule(false);
    }
  };

  const fetchFollowUps = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getFollowUps(activeTab);
      if (res.success) {
        setFollowUps(res.followUps || []);
        setCounts(res.counts);
        onCountsUpdated?.(res.counts);
      }
    } catch (err: any) {
      console.error('Failed to fetch follow-ups:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab, onCountsUpdated]);

  useEffect(() => {
    if (isOpen) {
      fetchFollowUps();
    }
  }, [isOpen, fetchFollowUps]);

  if (!isOpen) return null;

  const handleToggleComplete = async (item: FollowUpItem) => {
    const nextStatus = item.status === 'completed' ? 'pending' : 'completed';
    try {
      const res = await updateFollowUp(item._id, { status: nextStatus });
      setLastActionLogId(res.logId);
      setFeedback(
        nextStatus === 'completed'
          ? `Marked follow-up for ${item.dealerName} as complete`
          : `Reopened follow-up for ${item.dealerName}`
      );
      fetchFollowUps();
      window.dispatchEvent(new CustomEvent('followups-updated'));
    } catch (err: any) {
      console.error('Failed to update follow-up:', err);
    }
  };

  const handleDelete = async (item: FollowUpItem) => {
    try {
      const res = await deleteFollowUp(item._id);
      setLastActionLogId(res.logId);
      setFeedback(`Removed follow-up for ${item.dealerName}`);
      fetchFollowUps();
      window.dispatchEvent(new CustomEvent('followups-updated'));
    } catch (err: any) {
      console.error('Failed to delete follow-up:', err);
    }
  };

  const handleUndo = async () => {
    if (!lastActionLogId) return;
    try {
      await undoFollowUpAction(lastActionLogId);
      setLastActionLogId(null);
      setFeedback('Action successfully undone');
      fetchFollowUps();
      window.dispatchEvent(new CustomEvent('followups-updated'));
    } catch (err: any) {
      console.error('Failed to undo:', err);
    }
  };

  const formatDueDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();

    const tomorrow = new Date();
    tomorrow.setDate(now.getDate() + 1);
    const isTomorrow =
      d.getDate() === tomorrow.getDate() &&
      d.getMonth() === tomorrow.getMonth() &&
      d.getFullYear() === tomorrow.getFullYear();

    const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    if (isToday) return `Today at ${timeStr}`;
    if (isTomorrow) return `Tomorrow at ${timeStr}`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  const filteredItems = followUps.filter((f) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      f.dealerName?.toLowerCase().includes(q) ||
      f.dealerId?.toLowerCase().includes(q) ||
      f.note?.toLowerCase().includes(q)
    );
  });

  return (
    <div className={styles.overlay} onClick={onClose}>
      <aside className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <div className={styles.iconWrap}>
              <CalendarClock size={16} color="#fbbf24" />
            </div>
            <div>
              <div className={styles.titleRow}>
                <h3 className={styles.title}>My Rooftop Follow-Ups</h3>
                {counts.totalActive > 0 && (
                  <span className={styles.counterBadge}>{counts.totalActive} Active</span>
                )}
              </div>
              <p className={styles.subtitle}>Scheduled dealer visits, calls & reminders</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className={styles.scheduleToggleBtn}
              onClick={() => setIsSchedulerOpen(prev => !prev)}
              title="Schedule a new follow-up for any rooftop"
            >
              <Plus size={13} />
              <span>{isSchedulerOpen ? 'Close' : '+ Schedule'}</span>
            </button>
            <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* In-Drawer Quick Follow-Up Scheduler */}
        {isSchedulerOpen && (
          <form className={styles.schedulePanel} onSubmit={handleScheduleSubmit}>
            <div className={styles.scheduleHeaderRow}>
              <span className={styles.schedulePanelTitle}>
                <CalendarClock size={14} />
                <span>Schedule Rooftop Follow-Up</span>
              </span>
              <button
                type="button"
                className={styles.changeDealerBtn}
                onClick={() => setIsSchedulerOpen(false)}
              >
                ✕
              </button>
            </div>

            {/* Step 1: Select Dealership */}
            <div className={styles.dealerSearchContainer}>
              <label className={styles.fieldLabel}>Dealership</label>
              {!selectedDealer ? (
                <>
                  <div className={styles.dealerSearchBox}>
                    <Search size={13} style={{ color: '#94a3b8' }} />
                    <input
                      type="text"
                      className={styles.dealerSearchInput}
                      placeholder="Search any dealership by name or code..."
                      value={dealerSearchInput}
                      onChange={(e) => setDealerSearchInput(e.target.value)}
                      autoFocus
                    />
                    {isSearchingDealers && <Loader2 size={13} className={styles.spin} color="#38bdf8" />}
                  </div>

                  {dealerResults.length > 0 && (
                    <div className={styles.dealerSearchDropdown}>
                      {dealerResults.map((d) => (
                        <div
                          key={d._id}
                          className={styles.dealerSearchOption}
                          onClick={() => {
                            setSelectedDealer(d);
                            setDealerSearchInput('');
                            setDealerResults([]);
                          }}
                        >
                          <span className={styles.dealerOptionName}>{d.dealerName}</span>
                          <div className={styles.dealerOptionMeta}>
                            <span className={styles.dealerIdBadge}>{d.clientDealerId || d.dealerId}</span>
                            {d.statePrefix && <span className={styles.dealerStateBadge}>{d.statePrefix}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className={styles.selectedDealerCard}>
                  <div className={styles.selectedDealerInfo}>
                    <Building2 size={13} color="#fbbf24" />
                    <div>
                      <div className={styles.selectedDealerName}>{selectedDealer.dealerName}</div>
                      <span className={styles.dealerIdBadge}>{selectedDealer.clientDealerId || selectedDealer.dealerId}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={styles.changeDealerBtn}
                    onClick={() => setSelectedDealer(null)}
                  >
                    Change
                  </button>
                </div>
              )}
            </div>

            {/* Step 2: Date & Time */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label className={styles.fieldLabel}>Due Date & Time</label>
              <div className={styles.presetBar}>
                <button type="button" className={styles.presetChip} onClick={() => applyPreset(1, 10)}>+1 Day</button>
                <button type="button" className={styles.presetChip} onClick={() => applyPreset(2, 10)}>+2 Days</button>
                <button type="button" className={styles.presetChip} onClick={() => applyPreset(7, 10)}>+1 Week</button>
                <button type="button" className={styles.presetChip} onClick={applyNextMonday}>Next Mon</button>
              </div>
              <input
                type="datetime-local"
                className={styles.dateTimeField}
                value={scheduleDateTime}
                onChange={(e) => setScheduleDateTime(e.target.value)}
                required
              />
            </div>

            {/* Step 3: Note (Optional) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label className={styles.fieldLabel}>Reminder Note (Optional)</label>
              <textarea
                className={styles.noteTextarea}
                placeholder="e.g., Check on submitted applications, follow up on stips..."
                value={scheduleNote}
                onChange={(e) => setScheduleNote(e.target.value)}
              />
            </div>

            {/* Actions */}
            <div className={styles.scheduleSubmitRow}>
              <button
                type="button"
                className={styles.cancelScheduleBtn}
                onClick={() => setIsSchedulerOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.submitScheduleBtn}
                disabled={!selectedDealer || !scheduleDateTime || isSubmittingSchedule}
              >
                {isSubmittingSchedule ? (
                  <>
                    <Loader2 size={13} className={styles.spin} />
                    <span>Scheduling...</span>
                  </>
                ) : (
                  <>
                    <CalendarClock size={13} />
                    <span>Schedule Follow-Up</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Feedback / Undo Banner */}
        {feedback && (
          <div className={styles.feedbackBanner}>
            <span>{feedback}</span>
            {lastActionLogId && (
              <button type="button" className={styles.undoBtn} onClick={handleUndo}>
                <RotateCcw size={11} />
                <span>Undo</span>
              </button>
            )}
          </div>
        )}

        {/* Tab Filters */}
        <div className={styles.tabRow}>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'active' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('active')}
          >
            <span>Active</span>
            {counts.totalActive > 0 && <span className={styles.tabBadge}>{counts.totalActive}</span>}
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'completed' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('completed')}
          >
            <span>Completed</span>
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'all' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('all')}
          >
            <span>All History</span>
          </button>
        </div>

        {/* Search */}
        <div className={styles.searchBar}>
          <Search size={13} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search follow-ups by dealer or note..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Follow-Ups List (Nearest to Furthest) */}
        <div className={styles.list}>
          {loading ? (
            <div className={styles.loadingState}>
              <Loader2 size={20} className={styles.spin} color="#38bdf8" />
              <span>Loading follow-ups...</span>
            </div>
          ) : filteredItems.length > 0 ? (
            filteredItems.map((item) => {
              const isOverdue = item.isOverdue;
              const isToday = item.isToday;
              const isCompleted = item.status === 'completed';

              return (
                <div
                  key={item._id}
                  className={`${styles.card} ${
                    isCompleted
                      ? styles.completedCard
                      : isOverdue
                      ? styles.overdueCard
                      : isToday
                      ? styles.todayCard
                      : ''
                  }`}
                >
                  <div className={styles.cardTop}>
                    <button
                      type="button"
                      className={`${styles.checkboxBtn} ${isCompleted ? styles.checkboxBtnChecked : ''}`}
                      onClick={() => handleToggleComplete(item)}
                      title={isCompleted ? 'Mark as pending' : 'Mark as completed'}
                    >
                      {isCompleted && <Check size={12} />}
                    </button>

                    <div className={styles.cardIdentity}>
                      <div className={styles.dealerRow}>
                        <span className={styles.dealerName} title={item.dealerName}>
                          {item.dealerName}
                        </span>
                        <span className={styles.dealerIdBadge}>{item.dealerId}</span>
                      </div>

                      <div className={styles.dateRow}>
                        <span
                          className={`${styles.urgencyPill} ${
                            isCompleted
                              ? styles.pillCompleted
                              : isOverdue
                              ? styles.pillOverdue
                              : isToday
                              ? styles.pillToday
                              : styles.pillUpcoming
                          }`}
                        >
                          <Clock size={10} />
                          <span>
                            {isCompleted
                              ? 'Completed'
                              : isOverdue
                              ? 'OVERDUE'
                              : isToday
                              ? 'DUE TODAY'
                              : 'UPCOMING'}
                          </span>
                        </span>
                        <span className={styles.dateText}>{formatDueDate(item.dueDate)}</span>
                      </div>
                    </div>

                    <div className={styles.cardActions}>
                      {onSelectDealer && (
                        <button
                          type="button"
                          className={styles.jumpBtn}
                          onClick={() => {
                            onSelectDealer(item.dealerId);
                            onClose();
                          }}
                          title="Jump to Dealer"
                        >
                          <ExternalLink size={12} />
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.deleteBtn}
                        onClick={() => handleDelete(item)}
                        title="Delete follow-up (Reversible)"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Note */}
                  {item.note && (
                    <div className={styles.noteBox}>
                      <span>{item.note}</span>
                    </div>
                  )}

                  {/* Completed info */}
                  {isCompleted && item.completedAt && (
                    <div className={styles.completedMeta}>
                      Completed on {new Date(item.completedAt).toLocaleDateString()}{' '}
                      {item.completedBy ? `by ${item.completedBy}` : ''}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className={styles.emptyState}>
              <CalendarClock size={28} color="#64748b" />
              <p>
                {searchQuery
                  ? `No follow-ups matching "${searchQuery}"`
                  : activeTab === 'active'
                  ? 'No pending follow-ups scheduled.'
                  : 'No follow-up history found.'}
              </p>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};
