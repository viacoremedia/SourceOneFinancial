import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  UserPlus,
  Phone,
  Mail,
  Edit2,
  Trash2,
  RotateCcw,
  AlertTriangle,
  Copy,
  Check,
  Building2,
  FileText,
  Search,
  Loader2
} from 'lucide-react';
import {
  getDealerContacts,
  addDealerContact,
  updateDealerContact,
  deleteDealerContact,
  undoDealerContactAction,
  type DealerContact
} from '../../../../core/services/api';
import styles from './DealerContactsModal.module.css';

export interface DealerContactsModalProps {
  dealerId: string;
  dealerName?: string;
  onClose: () => void;
  onContactsUpdated?: (contacts: DealerContact[]) => void;
}

export const DealerContactsModal: React.FC<DealerContactsModalProps> = ({
  dealerId,
  dealerName,
  onClose,
  onContactsUpdated
}) => {
  const [contacts, setContacts] = useState<DealerContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingContact, setEditingContact] = useState<DealerContact | null>(null);
  const [deletingContact, setDeletingContact] = useState<DealerContact | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [lastActionLogId, setLastActionLogId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; isError?: boolean } | null>(null);

  // Keep a stable ref to onContactsUpdated so callback changes don't re-trigger fetch
  const onContactsUpdatedRef = useRef(onContactsUpdated);
  useEffect(() => {
    onContactsUpdatedRef.current = onContactsUpdated;
  }, [onContactsUpdated]);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    title: '',
    phone: '',
    email: '',
    note: '',
    isPrimary: false
  });

  const fetchContacts = useCallback(async () => {
    if (!dealerId) return;
    setLoading(true);
    try {
      const res = await getDealerContacts(dealerId);
      if (res.success) {
        setContacts(res.contacts || []);
      }
    } catch (err: any) {
      console.error('Error fetching contacts:', err);
      setFeedbackMsg({ text: err.message || 'Failed to load contacts', isError: true });
    } finally {
      setLoading(false);
    }
  }, [dealerId]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(id);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleOpenAdd = () => {
    setEditingContact(null);
    setFormData({ name: '', title: '', phone: '', email: '', note: '', isPrimary: false });
    setShowAddForm(true);
  };

  const handleOpenEdit = (c: DealerContact) => {
    setEditingContact(c);
    setFormData({
      name: c.name || '',
      title: c.title || '',
      phone: c.phone || '',
      email: c.email || '',
      note: c.note || '',
      isPrimary: !!c.isPrimary
    });
    setShowAddForm(true);
  };

  const handleCloseForm = () => {
    setShowAddForm(false);
    setEditingContact(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setIsSubmitting(true);
    setFeedbackMsg(null);
    try {
      if (editingContact?._id) {
        const res = await updateDealerContact(dealerId, editingContact._id, formData);
        setContacts(res.contacts);
        onContactsUpdatedRef.current?.(res.contacts);
        setLastActionLogId(res.logId);
        setFeedbackMsg({ text: `Updated ${formData.name}` });
      } else {
        const res = await addDealerContact(dealerId, formData);
        setContacts(res.contacts);
        onContactsUpdatedRef.current?.(res.contacts);
        setLastActionLogId(res.logId);
        setFeedbackMsg({ text: `Added ${formData.name}` });
      }
      handleCloseForm();
    } catch (err: any) {
      setFeedbackMsg({ text: err.message || 'Failed to save contact', isError: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingContact?._id) return;
    setIsSubmitting(true);
    try {
      const res = await deleteDealerContact(dealerId, deletingContact._id);
      setContacts(res.contacts);
      onContactsUpdatedRef.current?.(res.contacts);
      setLastActionLogId(res.logId);
      setFeedbackMsg({ text: `Removed ${deletingContact.name}` });
      setDeletingContact(null);
    } catch (err: any) {
      setFeedbackMsg({ text: err.message || 'Failed to delete contact', isError: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUndo = async () => {
    if (!lastActionLogId) return;
    setIsSubmitting(true);
    try {
      const res = await undoDealerContactAction(dealerId, lastActionLogId);
      setContacts(res.contacts);
      onContactsUpdatedRef.current?.(res.contacts);
      setLastActionLogId(null);
      setFeedbackMsg({ text: 'Action undone successfully' });
    } catch (err: any) {
      setFeedbackMsg({ text: err.message || 'Failed to undo action', isError: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredContacts = contacts.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.title?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q) ||
      c.note?.toLowerCase().includes(q)
    );
  });

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <div className={styles.iconWrap}>
              <Building2 size={16} color="#38bdf8" />
            </div>
            <div>
              <div className={styles.titleRow}>
                <h3 className={styles.title}>{dealerName || dealerId} Contacts</h3>
                <span className={styles.dealerIdBadge}>{dealerId}</span>
              </div>
              <p className={styles.subtitle}>
                Rooftop directory & contacts management • Full CRUD with audit recovery
              </p>
            </div>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Feedback / Undo Banner */}
        {feedbackMsg && (
          <div
            className={`${styles.feedbackBanner} ${
              feedbackMsg.isError ? styles.feedbackError : styles.feedbackSuccess
            }`}
          >
            <span>{feedbackMsg.text}</span>
            {lastActionLogId && !feedbackMsg.isError && (
              <button type="button" className={styles.undoBtn} onClick={handleUndo} disabled={isSubmitting}>
                <RotateCcw size={11} />
                <span>Undo</span>
              </button>
            )}
          </div>
        )}

        {/* Action & Search Bar */}
        <div className={styles.actionBar}>
          <div className={styles.searchBox}>
            <Search size={13} className={styles.searchIcon} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search by name, title, email, phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            type="button"
            className={styles.addBtn}
            onClick={showAddForm ? handleCloseForm : handleOpenAdd}
          >
            <UserPlus size={13} />
            <span>{showAddForm ? 'Cancel' : 'Add Contact'}</span>
          </button>
        </div>

        {/* Add / Edit Form Panel */}
        {showAddForm && (
          <form className={styles.formPanel} onSubmit={handleSubmit}>
            <div className={styles.formHeader}>
              <span className={styles.formTitle}>
                {editingContact ? `Edit Contact • ${editingContact.name}` : 'New Rooftop Contact'}
              </span>
              <button type="button" className={styles.formCloseBtn} onClick={handleCloseForm}>
                <X size={13} />
              </button>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Full Name *</label>
                <input
                  type="text"
                  required
                  className={styles.input}
                  placeholder="e.g. John Miller"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Title / Role</label>
                <input
                  type="text"
                  className={styles.input}
                  placeholder="e.g. Finance Director, GM, Sales Mgr"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Phone Number</label>
                <input
                  type="tel"
                  className={styles.input}
                  placeholder="e.g. (555) 123-4567"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Email Address</label>
                <input
                  type="email"
                  className={styles.input}
                  placeholder="e.g. jmiller@dealership.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                <label className={styles.label}>Notes / Context</label>
                <textarea
                  rows={2}
                  className={styles.textarea}
                  placeholder="e.g. Best contact for rate exceptions; usually in office Tue-Sat"
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                />
              </div>
            </div>

            <div className={styles.formFooter}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={formData.isPrimary}
                  onChange={(e) => setFormData({ ...formData, isPrimary: e.target.checked })}
                />
                <span>Set as primary contact</span>
              </label>

              <div className={styles.btnRow}>
                <button type="button" className={styles.cancelBtn} onClick={handleCloseForm}>
                  Cancel
                </button>
                <button type="submit" className={styles.saveBtn} disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 size={12} className={styles.spin} />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>{editingContact ? 'Save Changes' : 'Create Contact'}</span>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Delete Confirmation Warning Modal */}
        {deletingContact && (
          <div className={styles.deleteConfirmDialog}>
            <div className={styles.deleteConfirmContent}>
              <div className={styles.deleteIconWrap}>
                <AlertTriangle size={18} className={styles.alertIcon} />
              </div>
              <div>
                <h4 className={styles.deleteTitle}>Delete Contact: {deletingContact.name}?</h4>
                <p className={styles.deleteDesc}>
                  Are you sure you want to remove this contact from <strong>{dealerName || dealerId}</strong>?
                  This mutation will be recorded in the audit log and can be undone immediately.
                </p>
                <div className={styles.deleteActions}>
                  <button
                    type="button"
                    className={styles.cancelBtn}
                    onClick={() => setDeletingContact(null)}
                    disabled={isSubmitting}
                  >
                    Keep Contact
                  </button>
                  <button
                    type="button"
                    className={styles.confirmDeleteBtn}
                    onClick={confirmDelete}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Deleting...' : 'Yes, Delete Contact'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Contacts List */}
        <div className={styles.contactsList}>
          {loading ? (
            <div className={styles.loadingState}>
              <Loader2 size={20} className={styles.spin} color="#38bdf8" />
              <span>Loading contacts...</span>
            </div>
          ) : filteredContacts.length > 0 ? (
            filteredContacts.map((contact, idx) => (
              <div
                key={contact._id || `${contact.name}-${idx}`}
                className={`${styles.contactCard} ${contact.isPrimary ? styles.primaryCard : ''}`}
              >
                <div className={styles.cardHeader}>
                  <div className={styles.cardIdentity}>
                    <div className={styles.nameRow}>
                      <span className={styles.contactName}>{contact.name}</span>
                      {contact.isPrimary && <span className={styles.primaryBadge}>PRIMARY</span>}
                      <span
                        className={`${styles.sourceBadge} ${
                          contact.source === 'badger' ? styles.badgerSource : styles.manualSource
                        }`}
                      >
                        {contact.source === 'badger' ? 'Badger Sync' : 'Direct DB'}
                      </span>
                    </div>
                    {contact.title && <div className={styles.contactTitle}>{contact.title}</div>}
                  </div>

                  <div className={styles.cardActions}>
                    <button
                      type="button"
                      className={styles.actionIconBtn}
                      onClick={() => handleOpenEdit(contact)}
                      title="Edit contact details"
                    >
                      <Edit2 size={12} />
                    </button>
                    <button
                      type="button"
                      className={`${styles.actionIconBtn} ${styles.deleteIconBtn}`}
                      onClick={() => setDeletingContact(contact)}
                      title="Delete contact"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Contact Coordinates */}
                <div className={styles.cardCoordinates}>
                  {contact.phone && (
                    <div className={styles.coordItem}>
                      <a href={`tel:${contact.phone}`} className={styles.coordLink} title={`Call ${contact.phone}`}>
                        <Phone size={11} color="#38bdf8" />
                        <span>{contact.phone}</span>
                      </a>
                      <button
                        type="button"
                        className={styles.miniCopyBtn}
                        onClick={() => handleCopy(contact.phone!, `phone-${idx}`)}
                        title="Copy phone"
                      >
                        {copiedField === `phone-${idx}` ? <Check size={10} color="#34d399" /> : <Copy size={10} />}
                      </button>
                    </div>
                  )}

                  {contact.email && (
                    <div className={styles.coordItem}>
                      <a href={`mailto:${contact.email}`} className={styles.coordLink} title={`Email ${contact.email}`}>
                        <Mail size={11} color="#38bdf8" />
                        <span className={styles.emailText}>{contact.email}</span>
                      </a>
                      <button
                        type="button"
                        className={styles.miniCopyBtn}
                        onClick={() => handleCopy(contact.email!, `email-${idx}`)}
                        title="Copy email"
                      >
                        {copiedField === `email-${idx}` ? <Check size={10} color="#34d399" /> : <Copy size={10} />}
                      </button>
                    </div>
                  )}
                </div>

                {/* Notes */}
                {contact.note && (
                  <div className={styles.noteBox}>
                    <FileText size={11} className={styles.noteIcon} />
                    <span>{contact.note}</span>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className={styles.emptyState}>
              <p>No contacts found {searchQuery ? `matching "${searchQuery}"` : 'for this rooftop'}.</p>
              <button type="button" className={styles.emptyAddBtn} onClick={handleOpenAdd}>
                <UserPlus size={13} />
                <span>Add First Contact</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <span className={styles.countIndicator}>
            Total: <strong>{filteredContacts.length}</strong> contact{filteredContacts.length === 1 ? '' : 's'}
          </span>
          <button type="button" className={styles.doneBtn} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
