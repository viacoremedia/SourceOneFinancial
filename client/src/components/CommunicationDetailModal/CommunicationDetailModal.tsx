import React, { useEffect } from 'react';
import { X, MapPin, Phone, Mail, MessageSquare, User, Building, FileText, Calendar } from 'lucide-react';
import styles from './CommunicationDetailModal.module.css';

export interface CommunicationDetailItem {
  _id?: string;
  id?: string;
  date: string;
  channel?: 'visit' | 'call' | 'email' | 'text' | 'other' | string;
  type?: string;
  repName?: string;
  result?: string | null;
  feedback?: string | null;
  notes?: string | null;
  dealerName?: string | null;
  clientDealerId?: string | null;
  state?: string | null;
  groupName?: string | null;
}

interface CommunicationDetailModalProps {
  comm: CommunicationDetailItem | null;
  onClose: () => void;
  dealerContext?: {
    dealerName?: string;
    clientDealerId?: string;
    state?: string;
    groupName?: string;
  };
}

export const CommunicationDetailModal: React.FC<CommunicationDetailModalProps> = ({
  comm,
  onClose,
  dealerContext
}) => {
  // ESC key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && comm) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [comm, onClose]);

  if (!comm) return null;

  const rawChannel = (comm.channel || comm.type || 'touchpoint').toLowerCase();
  const isVisit = rawChannel.includes('visit') || rawChannel.includes('meeting');
  const isCall = rawChannel.includes('call') || rawChannel.includes('phone');
  const isEmail = rawChannel.includes('email') || rawChannel.includes('mail');
  const isText = rawChannel.includes('text') || rawChannel.includes('sms');

  const channelLabel = isVisit
    ? 'In-Person Visit'
    : isCall
    ? 'Phone Call'
    : isEmail
    ? 'Email Communication'
    : isText
    ? 'Text Message'
    : 'Touchpoint';

  const iconClass = isVisit
    ? styles.iconVisit
    : isCall
    ? styles.iconCall
    : isEmail
    ? styles.iconEmail
    : styles.iconOther;

  const IconComponent = isVisit
    ? MapPin
    : isCall
    ? Phone
    : isEmail
    ? Mail
    : MessageSquare;

  const formattedDate = comm.date
    ? new Date(comm.date).toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })
    : 'Date not specified';

  const dealerName = comm.dealerName || dealerContext?.dealerName || 'Dealership';
  const clientDealerId = comm.clientDealerId || dealerContext?.clientDealerId || '';
  const state = comm.state || dealerContext?.state || '';
  const groupName = comm.groupName || dealerContext?.groupName || '';
  const notesText = comm.feedback || comm.notes || '';

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={`${styles.iconCircle} ${iconClass}`}>
              <IconComponent size={20} />
            </div>
            <div>
              <div className={styles.title}>
                <span>{channelLabel}</span>
                <span
                  className={styles.channelBadge}
                  style={{
                    background: isVisit ? 'rgba(56, 189, 248, 0.2)' : isCall ? 'rgba(168, 85, 247, 0.2)' : 'rgba(52, 211, 153, 0.2)',
                    color: isVisit ? '#38bdf8' : isCall ? '#c084fc' : '#34d399'
                  }}
                >
                  {rawChannel}
                </span>
              </div>
              <div className={styles.dateSub}>
                <Calendar size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                {formattedDate}
              </div>
            </div>
          </div>

          <button className={styles.closeBtn} onClick={onClose} title="Close (Esc)">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Metadata Cards */}
          <div className={styles.metaGrid}>
            <div className={styles.metaCard}>
              <span className={styles.metaLabel}>Sales Representative</span>
              <div className={styles.metaValue} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <User size={14} color="#38bdf8" />
                <span>{comm.repName || 'Assigned Rep'}</span>
              </div>
            </div>

            <div className={styles.metaCard}>
              <span className={styles.metaLabel}>Interaction Result</span>
              <div className={styles.metaValue} style={{ color: '#4ade80' }}>
                {comm.result || 'Logged Contact'}
              </div>
            </div>

            <div className={styles.metaCard}>
              <span className={styles.metaLabel}>Dealership</span>
              <div className={styles.metaValue} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Building size={14} color="#94a3b8" />
                <span>{dealerName}</span>
              </div>
            </div>

            <div className={styles.metaCard}>
              <span className={styles.metaLabel}>Account Identifiers</span>
              <div className={styles.metaValue} style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                {clientDealerId ? `ID: ${clientDealerId}` : ''} {state ? `• ${state}` : ''} {groupName ? `• ${groupName}` : ''}
              </div>
            </div>
          </div>

          {/* Meeting Notes & Logged Discussion */}
          <div className={styles.notesCard}>
            <div className={styles.notesHeader}>
              <FileText size={14} />
              <span>Meeting Discussion & Notes</span>
            </div>
            {notesText ? (
              <div className={styles.notesContent}>
                {notesText}
              </div>
            ) : (
              <div className={styles.emptyNotes}>
                No written discussion notes were logged for this touchpoint.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button className={styles.footerCloseBtn} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
