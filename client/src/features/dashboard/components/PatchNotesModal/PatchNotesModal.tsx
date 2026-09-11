import { useState, useEffect } from 'react';
import {
  Sparkles,
  X,
  ArrowRight,
  Sun,
  ClipboardList,
  Tags,
  Zap,
  RotateCcw,
  Layers,
} from 'lucide-react';
import styles from './PatchNotesModal.module.css';

const CURRENT_VERSION = 'v1.6';
const STORAGE_KEY = `s1-patch-${CURRENT_VERSION}-seen`;

interface PatchNotesModalProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function PatchNotesModal({ isOpen: controlledIsOpen, onClose: controlledOnClose }: PatchNotesModalProps) {
  const [showToast, setShowToast] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'v1.6' | 'v1.5'>('v1.6');

  // Check on mount if user hasn't seen current release
  useEffect(() => {
    try {
      const seen = localStorage.getItem(STORAGE_KEY);
      if (seen !== 'true') {
        // Show after a brief delay so page settles
        const timer = setTimeout(() => {
          setShowToast(true);
        }, 800);
        return () => clearTimeout(timer);
      }
    } catch {
      // ignore
    }
  }, []);

  // Sync controlled open state
  useEffect(() => {
    if (controlledIsOpen !== undefined) {
      setModalOpen(controlledIsOpen);
    }
  }, [controlledIsOpen]);

  const handleDismissToast = () => {
    setShowToast(false);
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // ignore
    }
  };

  const handleOpenModal = () => {
    handleDismissToast();
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    if (controlledOnClose) {
      controlledOnClose();
    }
  };

  return (
    <>
      {/* Floating Bottom-Left Prompt */}
      {showToast && !modalOpen && (
        <div className={styles.toastContainer} role="alert">
          <div className={styles.toastHeader}>
            <div className={styles.toastBadge}>
              <Sparkles size={13} />
              <span>Patch v1.6 Released</span>
            </div>
            <button
              type="button"
              className={styles.toastCloseBtn}
              onClick={handleDismissToast}
              title="Skip notification"
              aria-label="Skip notification"
            >
              <X size={16} />
            </button>
          </div>

          <div className={styles.toastBody}>
            <h4 className={styles.toastTitle}>What's New in Source One</h4>
            <p className={styles.toastDesc}>
              Light Mode by default, Badger quick notes, batch actions, and table improvements are now live.
            </p>
          </div>

          <div className={styles.toastActions}>
            <button
              type="button"
              className={styles.skipBtn}
              onClick={handleDismissToast}
              id="patch-notes-skip-btn"
            >
              Skip
            </button>
            <button
              type="button"
              className={styles.viewBtn}
              onClick={handleOpenModal}
              id="patch-notes-view-btn"
            >
              <span>View Details</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Full Patch Notes Dialog */}
      {modalOpen && (
        <div className={styles.modalOverlay} onClick={handleCloseModal}>
          <div
            className={styles.modalDialog}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {/* Header */}
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleArea}>
                <Sparkles size={20} color="#2563eb" />
                <h3 className={styles.modalTitle}>System Release Notes</h3>
                <span className={styles.versionBadge}>{CURRENT_VERSION}</span>
              </div>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={handleCloseModal}
                title="Close"
                aria-label="Close"
                id="patch-notes-modal-close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Version Tabs */}
            <div className={styles.tabsNav}>
              <button
                type="button"
                className={`${styles.tabBtn} ${activeTab === 'v1.6' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('v1.6')}
              >
                v1.6 (Current)
              </button>
              <button
                type="button"
                className={`${styles.tabBtn} ${activeTab === 'v1.5' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('v1.5')}
              >
                v1.5
              </button>
            </div>

            {/* Content Area */}
            <div className={styles.modalContent}>
              {activeTab === 'v1.6' && (
                <>
                  <div className={styles.versionHeader}>
                    <h4 className={styles.versionTitle}>v1.6 — Corporate Light Mode & Speed Updates</h4>
                    <p className={styles.versionSubtitle}>
                      Clear, simple guide to new features and how to use them.
                    </p>
                  </div>

                  <div className={styles.featureList}>
                    {/* 1. Light Mode */}
                    <div className={styles.featureCard}>
                      <div className={styles.featureCardHeader}>
                        <Sun size={17} className={styles.featureIcon} />
                        <span className={styles.featureName}>Light Mode Default & Easy Switcher</span>
                      </div>
                      <p className={styles.featureDesc}>
                        The entire system now starts in crisp, high-contrast Light Mode. All screens, drawers, and login pages look bright and sharp.
                      </p>
                      <div className={styles.howToUse}>
                        <strong>How to use:</strong> Click the Sun / Moon icon in the top-right header anytime to switch between Light and Dark mode.
                      </div>
                    </div>

                    {/* 2. Badger Quick Activity */}
                    <div className={styles.featureCard}>
                      <div className={styles.featureCardHeader}>
                        <ClipboardList size={17} className={styles.featureIcon} />
                        <span className={styles.featureName}>Badger Quick Drawer & Note Logger</span>
                      </div>
                      <p className={styles.featureDesc}>
                        Check rep road visits, check-ins, and phone logs fast without losing your spot in the table.
                      </p>
                      <div className={styles.howToUse}>
                        <strong>How to use:</strong> Click any dealer row or the Badger button, then click the "Badger Activity" tab to see all logs or type a new quick note.
                      </div>
                    </div>

                    {/* 3. Batch Tagging & Quick Status */}
                    <div className={styles.featureCard}>
                      <div className={styles.featureCardHeader}>
                        <Tags size={17} className={styles.featureIcon} />
                        <span className={styles.featureName}>Batch Tagging & Bulk Updates</span>
                      </div>
                      <p className={styles.featureDesc}>
                        Select multiple dealers at once to assign custom tags or update account tiers in one click.
                      </p>
                      <div className={styles.howToUse}>
                        <strong>How to use:</strong> Check the boxes next to any dealers in the table. A blue bar pops up at the bottom — click "Assign Tags" or "Update Tier".
                      </div>
                    </div>

                    {/* 4. Quick Action Menu */}
                    <div className={styles.featureCard}>
                      <div className={styles.featureCardHeader}>
                        <Zap size={17} className={styles.featureIcon} />
                        <span className={styles.featureName}>One-Click Row Quick Action</span>
                      </div>
                      <p className={styles.featureDesc}>
                        Make instant edits to a single dealer without waiting for a full drawer to open.
                      </p>
                      <div className={styles.howToUse}>
                        <strong>How to use:</strong> Click the lightning or tag icon right beside any dealer's name in the table to open the fast edit popover.
                      </div>
                    </div>


                    {/* 6. Audit Log History & Undo */}
                    <div className={styles.featureCard}>
                      <div className={styles.featureCardHeader}>
                        <RotateCcw size={17} className={styles.featureIcon} />
                        <span className={styles.featureName}>System Audit Log & One-Click Undo</span>
                      </div>
                      <p className={styles.featureDesc}>
                        Complete peace of mind. Every change is tracked, and accidental edits can be undone instantly.
                      </p>
                      <div className={styles.howToUse}>
                        <strong>How to use:</strong> Open Settings &gt; System Audit Log, find the change, and click "Undo" to restore the previous value.
                      </div>
                    </div>

                    {/* 7. Clean High-Contrast Drawers */}
                    <div className={styles.featureCard}>
                      <div className={styles.featureCardHeader}>
                        <Layers size={17} className={styles.featureIcon} />
                        <span className={styles.featureName}>High-Contrast Tables & Detail Drawers</span>
                      </div>
                      <p className={styles.featureDesc}>
                        All 5 dealer tabs, application history, DRD reconciliation, and manager groups now feature clean, easy-to-read cards and high contrast.
                      </p>
                      <div className={styles.howToUse}>
                        <strong>How to use:</strong> Click any dealer row to inspect their 360 overview, monthly metrics, and touchpoint timeline.
                      </div>
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'v1.5' && (
                <>
                  <div className={styles.versionHeader}>
                    <h4 className={styles.versionTitle}>v1.5 Features</h4>
                    <p className={styles.versionSubtitle}>Features released in patch v1.5:</p>
                  </div>

                  <ul className={styles.bulletList}>
                    <li className={styles.bulletItem}>
                      <span className={styles.bulletDot} />
                      <span>Dealer Relationship Demand (DRD) Engine</span>
                    </li>
                    <li className={styles.bulletItem}>
                      <span className={styles.bulletDot} />
                      <span>Sales Rep Route Allocation Matrix & Benchmarking</span>
                    </li>
                    <li className={styles.bulletItem}>
                      <span className={styles.bulletDot} />
                      <span>Automated Classification (High TLC, Autonomous, Comfort Stop, Discovery)</span>
                    </li>
                    <li className={styles.bulletItem}>
                      <span className={styles.bulletDot} />
                      <span>DRD Human Reconciliation Status & Manager Override Auditing</span>
                    </li>
                    <li className={styles.bulletItem}>
                      <span className={styles.bulletDot} />
                      <span>PDF Scorecard Reports Export for Management & Field Reps</span>
                    </li>
                  </ul>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.doneBtn}
                onClick={handleCloseModal}
                id="patch-notes-done-btn"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Small persistent trigger button for the AppShell header so users can re-open Patch Notes anytime.
 */
export function PatchNotesTriggerButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className={styles.patchNotesTrigger}
      onClick={onClick}
      title="View What's New in v1.6"
      aria-label="View Patch Notes v1.6"
      id="patch-notes-header-trigger"
    >
      <Sparkles size={13} />
      <span>Patch v1.6</span>
    </button>
  );
}
