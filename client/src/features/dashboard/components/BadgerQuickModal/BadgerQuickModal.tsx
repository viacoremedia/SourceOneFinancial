import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  MapPin,
  User,
  PlusCircle,
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Send,
  RotateCcw,
  Sparkles,
  ArrowDown,
  ChevronDown,
  ChevronUp,
  Phone,
  Mail,
  Copy,
  Check
} from 'lucide-react';
import {
  getDealerBadgerActivity,
  updateDealerBadgerNotepad,
  createDealerBadgerCheckin,
  undoBadgerNotepadUpdate,
  undoBadgerCheckin,
  syncDealerBadger,
  type BadgerActivityData,
  type BadgerContact
} from '../../../../core/services/api';
import { useAuth } from '../../../auth/hooks/useAuth';
import styles from './BadgerQuickModal.module.css';

export interface BadgerQuickModalProps {
  dealerId: string;
  dealerName: string;
  onClose: () => void;
}

interface ParsedNoteEntry {
  id: string;
  author: string;
  date: string;
  text: string;
}

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

/**
 * Parses raw concatenated Badger notepad text into individual structured note entries.
 */
function parseNotepadEntries(rawText: string | null | undefined): ParsedNoteEntry[] {
  if (!rawText || !rawText.trim()) return [];

  const entryRegex = /(?:^|\s{2,}|\n+)(?:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+|[A-Za-z0-9. ]+?)[\s\-_]+)?((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)?)\s*[-:]\s*/gi;

  const headers: { index: number; headerLength: number; author: string; date: string }[] = [];
  let match: RegExpExecArray | null;

  while ((match = entryRegex.exec(rawText)) !== null) {
    headers.push({
      index: match.index,
      headerLength: match[0].length,
      author: (match[1] || '').trim(),
      date: (match[2] || '').trim()
    });
  }

  if (headers.length === 0) {
    const paragraphs = rawText.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    return paragraphs.map((p, idx) => ({
      id: `fallback-${idx}`,
      author: '',
      date: '',
      text: p
    }));
  }

  const entries: ParsedNoteEntry[] = [];

  if (headers[0].index > 0) {
    const preamble = rawText.substring(0, headers[0].index).trim();
    if (preamble) {
      entries.push({
        id: 'preamble',
        author: '',
        date: '',
        text: preamble
      });
    }
  }

  for (let i = 0; i < headers.length; i++) {
    const current = headers[i];
    const start = current.index + current.headerLength;
    const end = i + 1 < headers.length ? headers[i + 1].index : rawText.length;
    const text = rawText.substring(start, end).trim();
    entries.push({
      id: `note-${i}`,
      author: current.author,
      date: current.date,
      text: text
    });
  }

  return entries;
}

export const BadgerQuickModal: React.FC<BadgerQuickModalProps> = ({
  dealerId,
  dealerName,
  onClose
}) => {
  const { user } = useAuth();

  // Screen width detection for responsive tabs
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 850);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 850);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Desktop active tab: 'workspace' (Everything on 1 view: Notes, Check-In Form, Past Check-Ins) or 'audit' (Source One Edit History & Undos)
  const [desktopTab, setDesktopTab] = useState<'workspace' | 'audit'>('workspace');

  // Mobile active tab: 'checkin' | 'history' | 'notepad' | 'audit'
  const [mobileTab, setMobileTab] = useState<'checkin' | 'history' | 'notepad' | 'audit'>('checkin');

  // Notepad states & bottom-start scroll handling
  const [sortOrder, setSortOrder] = useState<'chronological' | 'reverse'>('chronological');
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const notesStackRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback((smooth = false) => {
    if (notesStackRef.current) {
      notesStackRef.current.scrollTo({
        top: notesStackRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      });
    }
  }, []);

  const scrollToTop = useCallback((smooth = false) => {
    if (notesStackRef.current) {
      notesStackRef.current.scrollTo({
        top: 0,
        behavior: smooth ? 'smooth' : 'auto'
      });
    }
  }, []);

  const handleNotesScroll = () => {
    if (!notesStackRef.current || sortOrder !== 'chronological') {
      setShowJumpToLatest(false);
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = notesStackRef.current;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
    setShowJumpToLatest(distanceFromBottom > 140);
  };

  const [activity, setActivity] = useState<BadgerActivityData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [disposition, setDisposition] = useState('');
  const [feedback, setFeedback] = useState('');
  const [checkinNotes, setCheckinNotes] = useState('');
  const [isSubmittingCheckin, setIsSubmittingCheckin] = useState(false);
  const [checkinSuccessMsg, setCheckinSuccessMsg] = useState<string | null>(null);
  const [isCheckinExpanded, setIsCheckinExpanded] = useState(true);

  // Notepad states
  const [noteText, setNoteText] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [noteSuccessMsg, setNoteSuccessMsg] = useState<string | null>(null);
  const [lastNoteLogId, setLastNoteLogId] = useState<string | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);

  // Contacts states (Condensed All-In-One Roster)
  const [contacts, setContacts] = useState<BadgerContact[]>([]);
  const [isSyncingContacts, setIsSyncingContacts] = useState(false);
  const [contactsSyncMsg, setContactsSyncMsg] = useState<string | null>(null);
  const [copiedContactField, setCopiedContactField] = useState<string | null>(null);
  const [isContactsCollapsed, setIsContactsCollapsed] = useState(false);

  // Sync contacts from activity on load
  useEffect(() => {
    if (activity?.contacts) {
      setContacts(activity.contacts);
    }
  }, [activity?.contacts]);

  const copyContactEmail = (email: string, id: string) => {
    navigator.clipboard.writeText(email);
    setCopiedContactField(id);
    setTimeout(() => setCopiedContactField(null), 2000);
  };

  const handleSyncContacts = async () => {
    if (isSyncingContacts || !dealerId) return;
    setIsSyncingContacts(true);
    setContactsSyncMsg(null);
    try {
      const res = await syncDealerBadger(dealerId);
      const syncedContacts = res.data?.contacts || [];
      setContacts(syncedContacts);
      const count = syncedContacts.length;
      setContactsSyncMsg(`✅ Synced ${count} contact${count === 1 ? '' : 's'}`);
      setTimeout(() => setContactsSyncMsg(null), 4000);
      loadActivity();
    } catch (err: any) {
      setContactsSyncMsg(`❌ ${err.message || 'Failed to sync contacts'}`);
      setTimeout(() => setContactsSyncMsg(null), 5000);
    } finally {
      setIsSyncingContacts(false);
    }
  };

  // Fetch activity data
  const loadActivity = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getDealerBadgerActivity(dealerId);
      if (res.success && res.activity) {
        setActivity(res.activity);
      } else {
        setError('Failed to retrieve Badger activity.');
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Error communicating with Badger Maps');
    } finally {
      setIsLoading(false);
    }
  }, [dealerId]);

  useEffect(() => {
    setActivity(null);
    loadActivity();
  }, [loadActivity]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Submit Check-In
  const handleCheckinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disposition || !feedback || isSubmittingCheckin) return;

    setIsSubmittingCheckin(true);
    setError(null);
    setCheckinSuccessMsg(null);

    try {
      const res = await createDealerBadgerCheckin(dealerId, {
        disposition,
        feedback,
        notes: checkinNotes.trim() || undefined
      });

      if (res.success) {
        setCheckinSuccessMsg('Check-in logged successfully in Badger Maps & Source One!');
        setDisposition('');
        setFeedback('');
        setCheckinNotes('');
        await loadActivity();
        setTimeout(() => {
          setCheckinSuccessMsg(null);
        }, 3000);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to submit check-in to Badger Maps');
    } finally {
      setIsSubmittingCheckin(false);
    }
  };

  // Submit Notepad
  const handleNotepadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim() || isSubmittingNote) return;

    setIsSubmittingNote(true);
    setError(null);
    setNoteSuccessMsg(null);

    try {
      const res = await updateDealerBadgerNotepad(dealerId, noteText.trim());
      if (res.success) {
        setNoteSuccessMsg('Note saved to Badger Maps!');
        if (res.logId) setLastNoteLogId(res.logId);
        setNoteText('');
        if (activity) {
          setActivity({
            ...activity,
            notepad: res.notepad
          });
        }
        await loadActivity();
        if (sortOrder === 'chronological') {
          setTimeout(() => scrollToBottom(true), 80);
        }
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to update Badger Notepad');
    } finally {
      setIsSubmittingNote(false);
    }
  };

  // Undo Notepad Update
  const handleUndoNotepad = async (logId?: string) => {
    if (isUndoing) return;
    setIsUndoing(true);
    setError(null);
    try {
      const res = await undoBadgerNotepadUpdate(dealerId, logId || lastNoteLogId || undefined);
      if (res.success) {
        setNoteSuccessMsg('Notepad update reverted successfully.');
        setLastNoteLogId(null);
        if (activity) {
          setActivity({
            ...activity,
            notepad: res.notepad
          });
        }
        await loadActivity();
        setTimeout(() => setNoteSuccessMsg(null), 3000);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to undo notepad update');
    } finally {
      setIsUndoing(false);
    }
  };

  // Undo Check-in
  const handleUndoCheckin = async (appointmentId: number) => {
    if (!window.confirm(`Are you sure you want to delete check-in #${appointmentId} from Badger Maps and Source One?`)) {
      return;
    }

    setIsUndoing(true);
    setError(null);
    try {
      const res = await undoBadgerCheckin(dealerId, appointmentId);
      if (res.success) {
        await loadActivity();
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to delete check-in from Badger Maps');
    } finally {
      setIsUndoing(false);
    }
  };

  // Format date helper
  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    } catch {
      return isoStr;
    }
  };

  const authorName = user?.name || user?.email || 'Sales Rep';
  const now = new Date();
  const todayFormatted = now.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  const timeFormatted = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  });

  // Parse structured notepad cards
  const parsedNotes = useMemo(() => {
    return parseNotepadEntries(activity?.notepad);
  }, [activity?.notepad]);

  // Display notes according to sort order (chronological = oldest to newest; reverse = newest first)
  const displayedNotes = useMemo(() => {
    if (sortOrder === 'reverse') {
      return [...parsedNotes].reverse();
    }
    return parsedNotes;
  }, [parsedNotes, sortOrder]);

  // When notes load or sort order changes, start view at bottom (newest) for chronological
  useEffect(() => {
    if (parsedNotes.length > 0) {
      if (sortOrder === 'chronological') {
        scrollToBottom(false);
        const timer = setTimeout(() => scrollToBottom(false), 60);
        return () => clearTimeout(timer);
      } else {
        scrollToTop(false);
      }
    }
  }, [parsedNotes, sortOrder, scrollToBottom, scrollToTop]);

  // Set of appointment IDs created by Source One that can be undone
  const undoableCheckinIds = useMemo(() => {
    const set = new Set<number>();
    if (activity?.recentLogs) {
      for (const log of activity.recentLogs) {
        if (log.action === 'checkin_create' && !log.isUndone && log.payload?.appointmentId) {
          set.add(log.payload.appointmentId);
        }
      }
    }
    return set;
  }, [activity?.recentLogs]);

  // RENDER SECTIONS

  // Section: Log Check-In
  const renderCheckinSection = () => (
    <div className={styles.sectionCard}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitle}>
          <PlusCircle size={16} color="#38bdf8" />
          <span>Log Field Visit Check-In</span>
        </div>
        <span className={styles.sectionSubtitle}>Badger Maps & MongoDB</span>
      </div>

      <form className={styles.form} onSubmit={handleCheckinSubmit}>
        {checkinSuccessMsg && (
          <div className={styles.successBanner}>
            <CheckCircle size={15} />
            <span>{checkinSuccessMsg}</span>
          </div>
        )}

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>
            <span>Meeting Disposition <span className={styles.fieldRequired}>*</span></span>
          </label>
          <select
            className={styles.select}
            value={disposition}
            onChange={(e) => setDisposition(e.target.value)}
            required
          >
            <option value="">-- Select Meeting Disposition --</option>
            {VALID_DISPOSITIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>
            <span>Dealer Feedback <span className={styles.fieldRequired}>*</span></span>
          </label>
          <select
            className={styles.select}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            required
          >
            <option value="">-- Select Dealer Feedback --</option>
            {VALID_FEEDBACK.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>
            <span>Visit Notes</span>
            <span className={styles.charCount}>{checkinNotes.length} / 500</span>
          </label>
          <textarea
            className={styles.textarea}
            placeholder="Add key highlights, deal discussions, or follow-ups..."
            value={checkinNotes}
            maxLength={500}
            onChange={(e) => setCheckinNotes(e.target.value)}
            rows={2}
          />
        </div>

        <div className={styles.formActions}>
          <button
            type="submit"
            className={styles.submitBtn}
            disabled={!disposition || !feedback || isSubmittingCheckin}
          >
            {isSubmittingCheckin ? (
              <>
                <RefreshCw size={14} className={styles.spinner} style={{ width: '14px', height: '14px' }} />
                <span>Submitting to Badger...</span>
              </>
            ) : (
              <>
                <Send size={14} />
                <span>Create Check-In</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );

  // Section: Dealership Notepad
  const renderNotepadSection = () => (
    <div className={styles.sectionCard} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitle}>
          <FileText size={16} color="#38bdf8" />
          <span>Dealership Notepad</span>
          <span className={styles.tabCount}>{parsedNotes.length}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className={styles.sortToggleBtn}
            onClick={() => setSortOrder(prev => (prev === 'chronological' ? 'reverse' : 'chronological'))}
            title={sortOrder === 'chronological' ? 'Currently chronological (starts at bottom). Click to reverse.' : 'Currently newest first. Click for chronological (newest at bottom).'}
          >
            <Clock size={11} />
            <span>{sortOrder === 'chronological' ? 'Newest at Bottom' : 'Newest at Top'}</span>
          </button>
          <span className={styles.sectionSubtitle}>Synced live with Badger</span>
        </div>
      </div>

      {noteSuccessMsg && (
        <div className={styles.successBanner} style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle size={15} />
            <span>{noteSuccessMsg}</span>
          </div>
          {lastNoteLogId && (
            <button
              type="button"
              className={styles.undoBtn}
              onClick={() => handleUndoNotepad(lastNoteLogId)}
              disabled={isUndoing}
              title="Revert this note change"
            >
              <RotateCcw size={11} />
              <span>{isUndoing ? 'Reverting...' : 'Undo'}</span>
            </button>
          )}
        </div>
      )}

      {/* Structured Note Cards with Auto-Scroll to Bottom */}
      {displayedNotes.length > 0 ? (
        <div className={styles.notesStackWrapper}>
          <div
            ref={notesStackRef}
            className={styles.notesStack}
            onScroll={handleNotesScroll}
          >
            {displayedNotes.map((entry) => (
              <div key={entry.id} className={styles.noteCard}>
                {(entry.author || entry.date) && (
                  <div className={styles.noteCardHeader}>
                    {entry.author ? (
                      <div className={styles.noteAuthor}>
                        <div className={styles.noteAuthorAvatar}>
                          {entry.author.charAt(0).toUpperCase()}
                        </div>
                        <span>{entry.author}</span>
                      </div>
                    ) : (
                      <div className={styles.noteAuthor}>
                        <User size={13} color="#94a3b8" />
                        <span style={{ color: '#94a3b8' }}>Badger Note</span>
                      </div>
                    )}

                    {entry.date && (
                      <span className={styles.noteDate}>
                        <Clock size={11} />
                        <span>{entry.date}</span>
                      </span>
                    )}
                  </div>
                )}

                <div className={styles.noteText}>
                  {entry.text}
                </div>
              </div>
            ))}
          </div>

          {showJumpToLatest && sortOrder === 'chronological' && (
            <button
              type="button"
              className={styles.jumpToLatestBtn}
              onClick={() => scrollToBottom(true)}
              title="Jump to latest notes at bottom"
            >
              <ArrowDown size={12} />
              <span>Jump to Latest</span>
            </button>
          )}
        </div>
      ) : (
        <div className={styles.notepadEmpty}>
          No notepad entries yet for this dealership in Badger Maps.
        </div>
      )}

      {/* Add Note Composer */}
      <form className={styles.notepadComposer} onSubmit={handleNotepadSubmit}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label className={styles.fieldLabel} style={{ margin: 0 }}>
            <span>Add Entry to Notepad</span>
          </label>
          <span style={{ fontSize: '11px', color: '#64748b' }}>Appends with timestamp & spacing</span>
        </div>

        {noteText.trim() && (
          <div className={styles.composerPreview}>
            <strong>Live Preview: </strong>
            <code>{authorName} - {todayFormatted} {timeFormatted} - {noteText.trim()}</code>
          </div>
        )}

        <textarea
          className={styles.textarea}
          placeholder="Type an entry to append to this dealer's Badger notepad..."
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          rows={2}
        />

        <div className={styles.formActions}>
          <button
            type="submit"
            className={styles.submitBtn}
            disabled={!noteText.trim() || isSubmittingNote}
          >
            {isSubmittingNote ? (
              <>
                <RefreshCw size={14} className={styles.spinner} style={{ width: '14px', height: '14px' }} />
                <span>Saving Note...</span>
              </>
            ) : (
              <>
                <Send size={14} />
                <span>Save Note</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );

  // Section: Source One Edit History & Undos
  const renderAuditSection = (isFullView = false) => (
    <div className={isFullView ? styles.auditFullContainer : styles.sectionCard}>
      <div className={isFullView ? styles.auditHeaderCard : styles.sectionHeader}>
        <div>
          <div className={styles.sectionTitle} style={{ fontSize: isFullView ? '16px' : '14px' }}>
            <RotateCcw size={isFullView ? 17 : 15} color="#fbbf24" />
            <span>Source One Edit History & Instant Undos</span>
            {activity?.recentLogs && activity.recentLogs.length > 0 && (
              <span className={styles.tabCount}>{activity.recentLogs.length} Edits</span>
            )}
          </div>
          {isFullView && (
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0' }}>
              All notepad updates and field visit check-ins initiated from Source One are recorded here with 1-click rollback directly to Badger Maps.
            </p>
          )}
        </div>
        {!isFullView && <span className={styles.sectionSubtitle}>Instant rollbacks</span>}
      </div>

      {activity?.recentLogs && activity.recentLogs.length > 0 ? (
        <div className={isFullView ? styles.auditFullList : undefined} style={!isFullView ? { display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' } : undefined}>
          {activity.recentLogs.map((log) => {
            const isNotepad = log.action === 'notepad_update';
            return (
              <div key={log._id} className={styles.auditCard}>
                <div className={styles.auditCardHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className={`${styles.auditActionBadge} ${isNotepad ? styles.badgeNotepad : styles.badgeCheckin}`}>
                      {isNotepad ? '📝 Note Added' : '📍 Check-In'}
                    </span>
                    <span className={log.isUndone ? styles.statusPillReverted : styles.statusPillActive}>
                      {log.isUndone ? 'Reverted' : 'Active'}
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>{formatDate(log.createdAt)}</span>
                </div>

                <div className={styles.auditCardBody}>
                  {isNotepad ? (
                    <div>
                      <strong>Note: </strong><span>"{log.payload?.noteText || ''}"</span>
                    </div>
                  ) : (
                    <div>
                      <span><strong>{log.payload?.disposition}</strong> · {log.payload?.feedback}</span>
                      {log.payload?.checkinNotes && (
                        <div style={{ color: '#94a3b8', fontSize: '11px' }}>Notes: {log.payload.checkinNotes}</div>
                      )}
                    </div>
                  )}
                  <div style={{ fontSize: '10px', color: '#64748b', marginTop: '3px' }}>
                    By: {log.user?.name || log.user?.email || 'Sales Rep'}
                    {log.isUndone && log.undoneAt && <span> · Reverted {formatDate(log.undoneAt)}</span>}
                  </div>
                </div>

                <div className={styles.auditCardFooter}>
                  <span style={{ fontSize: '10px', color: '#475569' }}>
                    #{log._id.slice(-6)}
                  </span>
                  {!log.isUndone && (
                    isNotepad ? (
                      <button
                        type="button"
                        className={styles.undoBtn}
                        onClick={() => handleUndoNotepad(log._id)}
                        disabled={isUndoing}
                        title="Revert note from Badger Maps"
                      >
                        <RotateCcw size={11} />
                        <span>Revert Note</span>
                      </button>
                    ) : log.payload?.appointmentId ? (
                      <button
                        type="button"
                        className={styles.undoBtn}
                        onClick={() => handleUndoCheckin(log.payload.appointmentId!)}
                        disabled={isUndoing}
                        title="Delete check-in from Badger Maps & Source One"
                      >
                        <RotateCcw size={11} />
                        <span>Delete Check-In</span>
                      </button>
                    ) : null
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ color: '#64748b', fontSize: '13px', fontStyle: 'italic', padding: isFullView ? '48px 0' : '12px 0', textAlign: 'center' }}>
          No manual edits logged from Source One yet for this dealership.
        </div>
      )}
    </div>
  );

  // Compact Check-In Composer (pinned at bottom of History, styled like Notepad Composer)
  const renderCheckinComposer = () => (
    <form className={styles.checkinComposer} onSubmit={handleCheckinSubmit}>
      <div
        className={styles.checkinComposerHeader}
        onClick={() => setIsCheckinExpanded((prev) => !prev)}
      >
        <div className={styles.checkinComposerTitle}>
          <PlusCircle size={14} />
          <span>Log Field Visit Check-In</span>
        </div>
        <button
          type="button"
          className={styles.toggleCollapseBtn}
          onClick={(e) => {
            e.stopPropagation();
            setIsCheckinExpanded((prev) => !prev);
          }}
          title={isCheckinExpanded ? 'Collapse check-in form' : 'Expand check-in form'}
        >
          <span>{isCheckinExpanded ? 'Collapse' : 'Expand'}</span>
          {isCheckinExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {isCheckinExpanded && (
        <>
          {checkinSuccessMsg && (
            <div className={styles.successBanner} style={{ padding: '8px 12px', fontSize: '12px', marginBottom: '8px' }}>
              <CheckCircle size={14} />
              <span>{checkinSuccessMsg}</span>
            </div>
          )}

          <div className={styles.checkinGridRow}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} style={{ fontSize: '11px' }}>
                <span>Disposition <span className={styles.fieldRequired}>*</span></span>
              </label>
              <select
                className={styles.select}
                value={disposition}
                onChange={(e) => setDisposition(e.target.value)}
                required
                style={{ padding: '7px 10px', fontSize: '12px' }}
              >
                <option value="">-- Select Disposition --</option>
                {VALID_DISPOSITIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} style={{ fontSize: '11px' }}>
                <span>Dealer Feedback <span className={styles.fieldRequired}>*</span></span>
              </label>
              <select
                className={styles.select}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                required
                style={{ padding: '7px 10px', fontSize: '12px' }}
              >
                <option value="">-- Select Feedback --</option>
                {VALID_FEEDBACK.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel} style={{ fontSize: '11px', margin: 0 }}>
              <span>Visit Notes</span>
              <span className={styles.charCount}>{checkinNotes.length} / 500</span>
            </label>
            <textarea
              className={styles.textarea}
              placeholder="Add key highlights, deal discussions, or follow-ups..."
              value={checkinNotes}
              maxLength={500}
              onChange={(e) => setCheckinNotes(e.target.value)}
              rows={2}
              style={{ minHeight: '50px', padding: '7px 10px', fontSize: '12px' }}
            />
          </div>

          <div className={styles.formActions} style={{ marginTop: '2px' }}>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={!disposition || !feedback || isSubmittingCheckin}
              style={{ padding: '7px 14px', fontSize: '12px' }}
            >
              {isSubmittingCheckin ? (
                <>
                  <RefreshCw size={13} className={styles.spinner} style={{ width: '13px', height: '13px' }} />
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <Send size={13} />
                  <span>Create Check-In</span>
                </>
              )}
            </button>
          </div>
        </>
      )}
    </form>
  );

  // Section: Check-In History Cards (Full Height)
  const renderHistorySection = (showComposer = true) => (
    <div className={styles.sectionCard} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitle}>
          <Clock size={16} color="#38bdf8" />
          <span>Check-In History</span>
          {activity?.appointments && activity.appointments.length > 0 && (
            <span className={styles.tabCount}>{activity.appointments.length}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {showComposer && (
            <button
              type="button"
              className={styles.logVisitHeaderBtn}
              onClick={() => setIsCheckinExpanded((prev) => !prev)}
              title="Toggle Log Field Visit check-in form"
            >
              <PlusCircle size={13} />
              <span>{isCheckinExpanded ? 'Hide Form' : '+ Log Visit'}</span>
            </button>
          )}
          <span className={styles.sectionSubtitle}>Synced live with Badger</span>
        </div>
      </div>

      {activity?.appointments && activity.appointments.length > 0 ? (
        <div className={styles.historyList}>
          {activity.appointments.map((apt) => {
            const canUndo = undoableCheckinIds.has(apt.id);
            return (
              <div key={apt.id || Math.random()} className={styles.historyCard}>
                <div className={styles.historyCardHeader}>
                  <div className={styles.userProfile}>
                    <div className={styles.avatar}>
                      {(apt.userName || 'S').charAt(0)}
                    </div>
                    <span className={styles.userName}>{apt.userName || 'Sales Rep'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className={styles.historyDate}>{formatDate(apt.logDatetime)}</span>
                    {canUndo && (
                      <button
                        type="button"
                        className={styles.undoBtn}
                        onClick={() => handleUndoCheckin(apt.id)}
                        disabled={isUndoing}
                        title="Delete check-in from Badger Maps & Source One"
                      >
                        <RotateCcw size={11} />
                        <span>Undo</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className={styles.badgeRow}>
                  {apt.disposition && (
                    <span className={styles.dispositionBadge}>
                      {apt.disposition}
                    </span>
                  )}
                  {apt.feedback && (
                    <span className={styles.feedbackBadge}>
                      {apt.feedback}
                    </span>
                  )}
                </div>

                {apt.notes && (
                  <div className={styles.historyNotes}>
                    {apt.notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className={styles.stateContainer} style={{ padding: '36px 12px', flex: 1 }}>
          <Clock size={32} color="#475569" />
          <p style={{ fontSize: '13px', fontWeight: 500, color: '#e2e8f0', margin: '4px 0 0' }}>No check-in history found</p>
          <p style={{ fontSize: '11px', color: '#64748b', margin: 0 }}>No field visits or appointments recorded in Badger Maps for this dealer.</p>
        </div>
      )}

      {/* Pinned Check-In Composer at bottom */}
      {showComposer && renderCheckinComposer()}
    </div>
  );

  // Section: Condensed Badger Contacts Strip
  const renderContactsBar = () => (
    <div className={styles.contactsBarContainer}>
      <div className={styles.contactsBarHeader}>
        <div className={styles.contactsBarTitle}>
          <Phone size={14} className={styles.contactsIcon} />
          <span>Badger Contacts</span>
          <span className={styles.contactsCountBadge}>
            {contacts.length}
          </span>
        </div>

        <div className={styles.contactsBarActions}>
          {contactsSyncMsg && (
            <span className={contactsSyncMsg.startsWith('✅') ? styles.syncSuccessMsg : styles.syncErrorMsg}>
              {contactsSyncMsg}
            </span>
          )}

          <button
            type="button"
            className={styles.syncContactsBtn}
            onClick={handleSyncContacts}
            disabled={isSyncingContacts}
            title="Sync contacts directly from Badger Maps"
          >
            <RefreshCw size={12} className={isSyncingContacts ? styles.spinner : ''} />
            <span>{isSyncingContacts ? 'Syncing...' : 'Sync Contacts'}</span>
          </button>

          {contacts.length > 0 && (
            <button
              type="button"
              className={styles.collapseContactsBtn}
              onClick={() => setIsContactsCollapsed(prev => !prev)}
              title={isContactsCollapsed ? 'Expand contacts list' : 'Collapse contacts list'}
            >
              {isContactsCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </button>
          )}
        </div>
      </div>

      {!isContactsCollapsed && (
        contacts.length > 0 ? (
          <div className={styles.contactsChipsRow}>
            {contacts.map((c, idx) => (
              <div key={idx} className={`${styles.contactChip} ${c.isPrimary ? styles.contactChipPrimary : ''}`}>
                <div className={styles.contactChipTop}>
                  <span className={styles.contactChipName}>{c.name || 'Contact'}</span>
                  {c.isPrimary && <span className={styles.primaryBadge}>PRIMARY</span>}
                </div>
                {c.title && <div className={styles.contactChipTitle}>{c.title}</div>}
                <div className={styles.contactChipLinks}>
                  {c.phone && (
                    <a href={`tel:${c.phone}`} className={styles.contactActionPill} title={`Call ${c.phone}`}>
                      <Phone size={10} />
                      <span>{c.phone}</span>
                    </a>
                  )}
                  {c.email && (
                    <a href={`mailto:${c.email}`} className={styles.contactActionPill} title={`Email ${c.email}`}>
                      <Mail size={10} />
                      <span>{c.email}</span>
                    </a>
                  )}
                  {c.email && (
                    <button
                      type="button"
                      className={styles.contactCopyBtn}
                      onClick={() => copyContactEmail(c.email!, `contact_${idx}`)}
                      title="Copy email address"
                    >
                      {copiedContactField === `contact_${idx}` ? <Check size={10} color="#16a34a" /> : <Copy size={10} />}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.contactsEmptyState}>
            <span>No contacts loaded yet for this dealership.</span>
            <button
              type="button"
              className={styles.inlineSyncBtn}
              onClick={handleSyncContacts}
              disabled={isSyncingContacts}
            >
              <RefreshCw size={11} className={isSyncingContacts ? styles.spinner : ''} />
              <span>Pull from Badger Maps</span>
            </button>
          </div>
        )
      )}
    </div>
  );

  return createPortal(
    <div
      className={styles.drawerOverlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.drawerContainer} role="dialog" aria-modal="true">
        {/* Drawer Header */}
        <div className={styles.header}>
          <div className={styles.headerTop}>
            <div className={styles.title}>
              <MapPin size={20} color="#38bdf8" />
              <span>{activity?.dealerName || dealerName}</span>
              <span className={styles.dealerBadge}>{dealerId}</span>
            </div>
            <button
              className={styles.closeButton}
              onClick={onClose}
              title="Close drawer (Esc)"
              type="button"
            >
              <X size={20} />
            </button>
          </div>

          <div className={styles.metaRow}>
            {activity?.badgerId ? (
              <span className={styles.metaItem}>
                <strong>Badger ID:</strong> #{activity.badgerId}
              </span>
            ) : (
              <span className={styles.metaItem}>
                <strong>Badger ID:</strong> Searching...
              </span>
            )}

            {activity?.accountOwner && (
              <span className={styles.metaItem}>
                <User size={13} />
                <span>{activity.accountOwner}</span>
              </span>
            )}
          </div>
        </div>

        {/* Tab Navigation: Responsive Desktop vs Mobile */}
        <div className={styles.tabNav}>
          {!isMobile ? (
            <>
              {/* DESKTOP TABS: Field Workspace (Notes & Check-Ins) + Source One Undos */}
              <button
                type="button"
                className={`${styles.tabBtn} ${desktopTab === 'workspace' ? styles.tabBtnActive : ''}`}
                onClick={() => setDesktopTab('workspace')}
              >
                <Sparkles size={15} />
                <span>Field Workspace (Notes & Check-Ins)</span>
                {activity?.appointments && activity.appointments.length > 0 && (
                  <span className={styles.tabCount}>{activity.appointments.length} Check-Ins</span>
                )}
              </button>

              <button
                type="button"
                className={`${styles.tabBtn} ${desktopTab === 'audit' ? styles.tabBtnActive : ''}`}
                onClick={() => setDesktopTab('audit')}
              >
                <RotateCcw size={15} />
                <span>Edit History & Undos</span>
                {activity?.recentLogs && activity.recentLogs.length > 0 && (
                  <span className={styles.tabCount}>{activity.recentLogs.length}</span>
                )}
              </button>
            </>
          ) : (
            <>
              {/* MOBILE TABS: Tabbed for small phone screens */}
              <button
                type="button"
                className={`${styles.tabBtn} ${mobileTab === 'checkin' ? styles.tabBtnActive : ''}`}
                onClick={() => setMobileTab('checkin')}
              >
                <PlusCircle size={14} />
                <span>Check-In</span>
              </button>

              <button
                type="button"
                className={`${styles.tabBtn} ${mobileTab === 'history' ? styles.tabBtnActive : ''}`}
                onClick={() => setMobileTab('history')}
              >
                <Clock size={14} />
                <span>Check-Ins</span>
                {activity?.appointments && activity.appointments.length > 0 && (
                  <span className={styles.tabCount}>{activity.appointments.length}</span>
                )}
              </button>

              <button
                type="button"
                className={`${styles.tabBtn} ${mobileTab === 'notepad' ? styles.tabBtnActive : ''}`}
                onClick={() => setMobileTab('notepad')}
              >
                <FileText size={14} />
                <span>Notepad</span>
                {parsedNotes.length > 0 && (
                  <span className={styles.tabCount}>{parsedNotes.length}</span>
                )}
              </button>

              <button
                type="button"
                className={`${styles.tabBtn} ${mobileTab === 'audit' ? styles.tabBtnActive : ''}`}
                onClick={() => setMobileTab('audit')}
              >
                <RotateCcw size={14} />
                <span>Undos</span>
                {activity?.recentLogs && activity.recentLogs.length > 0 && (
                  <span className={styles.tabCount}>{activity.recentLogs.length}</span>
                )}
              </button>
            </>
          )}
        </div>

        {/* Drawer Body */}
        <div className={styles.body}>
          {error && (
            <div className={styles.errorBanner}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={() => setError(null)}
                style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer' }}
              >
                <X size={14} />
              </button>
            </div>
          )}

          {renderContactsBar()}

          {isLoading ? (
            <div className={styles.stateContainer}>
              <div className={styles.spinner} />
              <p style={{ fontSize: '13px' }}>Connecting to Badger Maps & loading activity...</p>
            </div>
          ) : (
            <>
              {/* DESKTOP LAYOUT */}
              {!isMobile ? (
                <>
                  {desktopTab === 'workspace' && (
                    <div className={styles.workspaceGrid}>
                      {/* LEFT: Notepad (Structured cards + Composer, starts at bottom where newest) */}
                      <div className={styles.workspaceLeft}>
                        {renderNotepadSection()}
                      </div>

                      {/* RIGHT: Check-In History (Full Height + Compact Check-In Composer at bottom) */}
                      <div className={styles.workspaceRight}>
                        {renderHistorySection(true)}
                      </div>
                    </div>
                  )}

                  {desktopTab === 'audit' && renderAuditSection(true)}
                </>
              ) : (
                /* MOBILE LAYOUT: Individual focused tabs */
                <>
                  {mobileTab === 'checkin' && renderCheckinSection()}
                  {mobileTab === 'history' && renderHistorySection(false)}
                  {mobileTab === 'notepad' && renderNotepadSection()}
                  {mobileTab === 'audit' && renderAuditSection(false)}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
