import { useState, useEffect, useRef } from 'react';
import styles from './CustomDatePicker.module.css';

interface CustomDatePickerProps {
  startDate?: string;
  endDate?: string;
  maxDate?: string;
  autoOpen?: boolean;
  onApply: (start?: string, end?: string) => void;
}

export function CustomDatePicker({
  startDate = '',
  endDate = '',
  maxDate = new Date().toISOString().split('T')[0],
  autoOpen = true,
  onApply,
}: CustomDatePickerProps) {
  const [isOpen, setIsOpen] = useState(() => autoOpen || (!startDate && !endDate));
  const [localStart, setLocalStart] = useState(startDate);
  const [localEnd, setLocalEnd] = useState(endDate);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalStart(startDate);
    setLocalEnd(endDate);
  }, [startDate, endDate]);

  // Click outside listener to close popover
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleApply = () => {
    let start = localStart || undefined;
    let end = localEnd || undefined;
    // Clamp end date to maxDate if provided
    if (end && maxDate && end > maxDate) {
      end = maxDate;
      setLocalEnd(maxDate);
    }
    onApply(start, end);
    setIsOpen(false);
  };

  const displayText =
    startDate && endDate
      ? `${startDate} to ${endDate}`
      : startDate
      ? `From ${startDate}`
      : endDate
      ? `Until ${endDate}`
      : 'Set Custom Dates...';

  return (
    <div className={styles.popoverContainer} ref={popoverRef}>
      <button
        type="button"
        className={styles.triggerBtn}
        onClick={() => setIsOpen(!isOpen)}
        title="Select custom date range"
      >
        <span>📅 {displayText}</span>
      </button>

      {isOpen && (
        <div className={styles.popoverMenu}>
          <h4 className={styles.popoverTitle}>Custom Date Range</h4>
          <div className={styles.dateGrid}>
            <div className={styles.inputGroup}>
              <label className={styles.inputLabel}>Start Date</label>
              <input
                type="date"
                className={styles.dateInput}
                value={localStart}
                max={maxDate}
                onChange={(e) => setLocalStart(e.target.value)}
              />
            </div>
            <div className={styles.inputGroup}>
              <label className={styles.inputLabel}>End Date</label>
              <input
                type="date"
                className={styles.dateInput}
                value={localEnd}
                max={maxDate}
                onChange={(e) => setLocalEnd(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.actionsRow}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.applyBtn}
              onClick={handleApply}
            >
              Apply Range
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
