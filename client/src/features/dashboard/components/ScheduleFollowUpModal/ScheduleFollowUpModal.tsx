import React, { useState } from 'react';
import {
  X,
  CalendarClock,
  Clock,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Calendar
} from 'lucide-react';
import { createFollowUp, undoFollowUpAction, type FollowUpItem } from '../../../../core/services/api';
import styles from './ScheduleFollowUpModal.module.css';

export interface ScheduleFollowUpModalProps {
  dealerId: string;
  dealerName?: string;
  clientDealerId?: string | null;
  onClose: () => void;
  onFollowUpScheduled?: (item: FollowUpItem) => void;
}

export const ScheduleFollowUpModal: React.FC<ScheduleFollowUpModalProps> = ({
  dealerId,
  dealerName,
  clientDealerId,
  onClose,
  onFollowUpScheduled
}) => {
  // Default to tomorrow at 10:00 AM local time
  const getDefaultDateTime = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    // Format to YYYY-MM-DDTHH:mm for datetime-local input
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [dateTime, setDateTime] = useState(getDefaultDateTime());
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; isError?: boolean; logId?: string } | null>(null);

  const applyPreset = (daysAhead: number, hour: number = 10) => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    d.setHours(hour, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    setDateTime(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dealerId || !dateTime) return;

    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await createFollowUp({
        dealerId,
        dealerName: dealerName || dealerId,
        clientDealerId,
        dueDate: new Date(dateTime).toISOString(),
        note: note.trim()
      });

      onFollowUpScheduled?.(res.followUp);
      window.dispatchEvent(new CustomEvent('followups-updated'));
      setFeedback({
        text: `Follow-up scheduled for ${new Date(dateTime).toLocaleDateString([], {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })}`,
        logId: res.logId
      });

      setTimeout(() => {
        onClose();
      }, 1400);
    } catch (err: any) {
      setFeedback({ text: err.message || 'Failed to schedule follow-up', isError: true });
      setIsSubmitting(false);
    }
  };

  const handleUndo = async () => {
    if (!feedback?.logId) return;
    setIsSubmitting(true);
    try {
      await undoFollowUpAction(feedback.logId);
      window.dispatchEvent(new CustomEvent('followups-updated'));
      setFeedback({ text: 'Scheduled follow-up undone' });
      setTimeout(() => onClose(), 1000);
    } catch (err: any) {
      setFeedback({ text: err.message || 'Failed to undo', isError: true });
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <div className={styles.iconWrap}>
              <CalendarClock size={16} color="#fbbf24" />
            </div>
            <div>
              <div className={styles.titleRow}>
                <h3 className={styles.title}>Schedule Follow-Up</h3>
                <span className={styles.dealerBadge}>{dealerId}</span>
              </div>
              <p className={styles.subtitle}>{dealerName || dealerId}</p>
            </div>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Feedback Banner */}
        {feedback && (
          <div className={`${styles.banner} ${feedback.isError ? styles.bannerError : styles.bannerSuccess}`}>
            {feedback.isError ? <AlertCircle size={13} /> : <CheckCircle2 size={13} />}
            <span>{feedback.text}</span>
            {feedback.logId && !feedback.isError && (
              <button type="button" className={styles.undoBtn} onClick={handleUndo} disabled={isSubmitting}>
                <RotateCcw size={11} />
                <span>Undo</span>
              </button>
            )}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className={styles.body}>
          {/* Quick Presets */}
          <div className={styles.presetSection}>
            <span className={styles.presetLabel}>Quick Presets:</span>
            <div className={styles.presetRow}>
              <button type="button" className={styles.presetBtn} onClick={() => applyPreset(1, 10)}>
                Tomorrow 10 AM
              </button>
              <button type="button" className={styles.presetBtn} onClick={() => applyPreset(3, 10)}>
                In 3 Days
              </button>
              <button type="button" className={styles.presetBtn} onClick={() => applyPreset(7, 10)}>
                Next Week
              </button>
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Follow-Up Date & Time *</label>
            <div className={styles.dateInputWrap}>
              <Calendar size={13} className={styles.fieldIcon} />
              <input
                type="datetime-local"
                required
                className={styles.input}
                value={dateTime}
                onChange={(e) => setDateTime(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Follow-Up Note / Purpose</label>
            <textarea
              rows={3}
              className={styles.textarea}
              placeholder="e.g. Check in on loan contracts; review approval rate exceptions with GM..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className={styles.footer}>
            <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 size={12} className={styles.spin} />
                  <span>Scheduling...</span>
                </>
              ) : (
                <>
                  <Clock size={12} />
                  <span>Schedule Follow-Up</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
