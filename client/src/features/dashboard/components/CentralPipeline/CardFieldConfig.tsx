import React from 'react';
import { X, Check, SlidersHorizontal } from 'lucide-react';
import styles from './CentralPipeline.module.css';

export interface FieldOption {
  key: string;
  label: string;
  category: 'Credit' | 'Financial' | 'Timing' | 'Dealer' | 'Lender & UW';
}

export const AVAILABLE_CARD_FIELDS: FieldOption[] = [
  // Credit
  { key: 'fico', label: 'Primary FICO Score', category: 'Credit' },
  { key: 'dti', label: 'DTI (Debt-to-Income %)', category: 'Credit' },
  { key: 'pti', label: 'PTI (Payment-to-Income %)', category: 'Credit' },
  // Financial
  { key: 'amountFinanced', label: 'Amount Financed ($)', category: 'Financial' },
  { key: 'term', label: 'Loan Term (Months)', category: 'Financial' },
  { key: 'apr', label: 'APR / Interest Rate (%)', category: 'Financial' },
  { key: 'ltv', label: 'LTV (Loan-to-Value %)', category: 'Financial' },
  { key: 'dealerReserve', label: 'Dealer Reserve ($)', category: 'Financial' },
  { key: 'totalDown', label: 'Total Down ($)', category: 'Financial' },
  { key: 'cashDown', label: 'Cash Down ($)', category: 'Financial' },
  // Timing
  { key: 'daysInStage', label: 'Days in Stage', category: 'Timing' },
  { key: 'appDate', label: 'Application Received Date', category: 'Timing' },
  { key: 'timeToDecision', label: 'Time to Decision', category: 'Timing' },
  { key: 'timeToBook', label: 'Time to Book', category: 'Timing' },
  // Dealer
  { key: 'dealerName', label: 'Dealership Name', category: 'Dealer' },
  { key: 'rep', label: 'Assigned Dealer Rep', category: 'Dealer' },
  { key: 'location', label: 'City & State', category: 'Dealer' },
  // Lender & UW
  { key: 'lender', label: 'Lender Name', category: 'Lender & UW' },
  { key: 'underwriter', label: 'Assigned Underwriter', category: 'Lender & UW' }
];

export const DEFAULT_STAGE_FIELDS: Record<string, string[]> = {
  pending: ['dealerName', 'rep', 'fico', 'daysInStage', 'lender', 'underwriter'],
  approved: ['dealerName', 'rep', 'fico', 'amountFinanced', 'apr', 'term', 'daysInStage'],
  funded: ['dealerName', 'rep', 'amountFinanced', 'dealerReserve', 'timeToBook', 'lender'],
  declined: ['dealerName', 'rep', 'fico', 'dti', 'ltv', 'underwriter', 'daysInStage']
};

interface CardFieldConfigProps {
  stageId: string;
  stageTitle: string;
  activeFields: string[];
  onSave: (stageId: string, fields: string[]) => void;
  onClose: () => void;
}

export const CardFieldConfig: React.FC<CardFieldConfigProps> = ({
  stageId,
  stageTitle,
  activeFields,
  onSave,
  onClose
}) => {
  const [selected, setSelected] = React.useState<string[]>(activeFields || DEFAULT_STAGE_FIELDS[stageId] || []);
  const [isSaving, setIsSaving] = React.useState(false);

  const toggleField = (key: string) => {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleResetDefaults = () => {
    const defaults = DEFAULT_STAGE_FIELDS[stageId] || ['dealerName', 'fico', 'daysInStage'];
    setSelected(defaults);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(stageId, selected);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  // Group fields by category
  const categories: Array<'Credit' | 'Financial' | 'Timing' | 'Dealer' | 'Lender & UW'> = [
    'Credit',
    'Financial',
    'Timing',
    'Dealer',
    'Lender & UW'
  ];

  return (
    <div className={styles.configModalOverlay} onClick={onClose}>
      <div className={styles.configModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.configModalHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <SlidersHorizontal size={16} color="#38bdf8" />
            <span className={styles.configModalTitle}>
              Configure Fields • {stageTitle}
            </span>
          </div>
          <button className={styles.configCloseBtn} onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>

        <p className={styles.configDescription}>
          Select the data fields to display on deal cards in this column. Saved directly to your user account.
        </p>

        <div className={styles.configCategoriesList}>
          {categories.map((cat) => {
            const fields = AVAILABLE_CARD_FIELDS.filter((f) => f.category === cat);
            return (
              <div key={cat} className={styles.configCatGroup}>
                <div className={styles.configCatTitle}>{cat}</div>
                <div className={styles.configFieldsGrid}>
                  {fields.map((field) => {
                    const isChecked = selected.includes(field.key);
                    return (
                      <label
                        key={field.key}
                        className={`${styles.configFieldPill} ${isChecked ? styles.configFieldPillActive : ''}`}
                        onClick={(e) => {
                          e.preventDefault();
                          toggleField(field.key);
                        }}
                      >
                        <span className={styles.configCheckbox}>
                          {isChecked && <Check size={11} strokeWidth={3} />}
                        </span>
                        <span className={styles.configFieldLabel}>{field.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className={styles.configModalFooter}>
          <button
            type="button"
            className={styles.configResetBtn}
            onClick={handleResetDefaults}
          >
            Reset Defaults
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className={styles.configCancelBtn}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.configSaveBtn}
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Apply & Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
