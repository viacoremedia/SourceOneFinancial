import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Tag, Plus, Trash2, Search, Sparkles } from 'lucide-react';
import { createGlobalTag, deleteGlobalTag, type UniversalTag } from '../../../../core/services/api';
import styles from './TagManagerModal.module.css';

export interface TagManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableTags: UniversalTag[];
  onTagsChanged: () => void;
  initialNewTagName?: string;
}

const COLOR_SWATCHES = [
  { label: 'Sky Blue', hex: '#38bdf8' },
  { label: 'Emerald', hex: '#10b981' },
  { label: 'Amber', hex: '#f59e0b' },
  { label: 'Purple', hex: '#a855f7' },
  { label: 'Rose', hex: '#f43f5e' },
  { label: 'Teal', hex: '#14b8a6' },
  { label: 'Indigo', hex: '#6366f1' }
];

export function TagManagerModal({
  isOpen,
  onClose,
  availableTags,
  onTagsChanged,
  initialNewTagName = ''
}: TagManagerModalProps) {
  const [newTagName, setNewTagName] = useState(initialNewTagName);
  const [newTagColor, setNewTagColor] = useState('#38bdf8');
  const [newTagDesc, setNewTagDesc] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  React.useEffect(() => {
    if (initialNewTagName) {
      setNewTagName(initialNewTagName);
    }
  }, [initialNewTagName]);

  const filteredTags = useMemo(() => {
    if (!searchQuery.trim()) return availableTags;
    const q = searchQuery.toLowerCase().trim();
    return availableTags.filter((t) => t.tag.toLowerCase().includes(q));
  }, [availableTags, searchQuery]);

  if (!isOpen) return null;

  const handleCreate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanName = newTagName.trim();
    if (!cleanName) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await createGlobalTag(cleanName, newTagColor, newTagDesc.trim());
      if (res.success) {
        setNewTagName('');
        setNewTagDesc('');
        onTagsChanged();
      } else {
        setErrorMessage(res.alreadyExists ? `Tag "${cleanName}" already exists` : 'Failed to create tag');
      }
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || err.message || 'Error creating tag');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (tagItem: UniversalTag) => {
    let cascade = false;
    if (tagItem.count > 0) {
      const choice = window.confirm(
        `Tag "${tagItem.tag}" is currently assigned to ${tagItem.count} dealer${tagItem.count === 1 ? '' : 's'}.\n\nClick OK to strip this tag from all dealers too, or Cancel to abort.`
      );
      if (!choice) return;
      cascade = true;
    }

    try {
      await deleteGlobalTag(tagItem.tag, cascade);
      onTagsChanged();
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || 'Failed to delete tag');
    }
  };

  return createPortal(
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.titleArea}>
            <div className={styles.titleRow}>
              <h2 className={styles.title}>
                <Tag size={18} color="#38bdf8" />
                Global Tag Catalog
              </h2>
              <span className={styles.tagCountBadge}>
                {availableTags.length} {availableTags.length === 1 ? 'tag' : 'tags'}
              </span>
            </div>
            <p className={styles.subtitle}>
              Create tags independently in the global catalog. Tags exist across the network and can be filtered or assigned at any time.
            </p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className={styles.body}>
          {/* Create Section */}
          <form onSubmit={handleCreate} className={styles.createSection}>
            <div className={styles.sectionLabel}>
              <Sparkles size={13} />
              Create New Global Tag
            </div>

            {errorMessage && <div className={styles.errorBanner}>{errorMessage}</div>}

            <div className={styles.createRow}>
              <input
                type="text"
                className={styles.input}
                placeholder="Tag name (e.g. VIP, Boat Show 2026, West Region)..."
                value={newTagName}
                onChange={(e) => {
                  setNewTagName(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                maxLength={50}
                autoFocus
              />
              <button
                type="submit"
                className={styles.createBtn}
                disabled={!newTagName.trim() || isSubmitting}
              >
                <Plus size={15} />
                {isSubmitting ? 'Creating...' : 'Create Tag'}
              </button>
            </div>

            <div className={styles.colorPickerRow}>
              <span className={styles.colorPickerLabel}>Badge Color:</span>
              <div className={styles.colorSwatches}>
                {COLOR_SWATCHES.map((swatch) => (
                  <button
                    key={swatch.hex}
                    type="button"
                    className={`${styles.colorSwatch} ${newTagColor === swatch.hex ? styles.colorSwatchActive : ''}`}
                    style={{ backgroundColor: swatch.hex }}
                    onClick={() => setNewTagColor(swatch.hex)}
                    title={swatch.label}
                  />
                ))}
              </div>
            </div>
          </form>

          {/* List Section */}
          <div className={styles.listSection}>
            <div className={styles.listHeader}>
              <span className={styles.sectionLabel}>Cataloged Tags</span>
              <div className={styles.searchWrapper}>
                <Search size={12} className={styles.searchIcon} />
                <input
                  type="text"
                  placeholder="Filter catalog..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={styles.searchInput}
                />
              </div>
            </div>

            <div className={styles.tagsGrid}>
              {filteredTags.length === 0 ? (
                <div className={styles.emptyMessage}>
                  {searchQuery ? `No tags matching "${searchQuery}"` : 'No tags created yet in catalog'}
                </div>
              ) : (
                filteredTags.map((t) => (
                  <div key={t.tag} className={styles.tagRow}>
                    <div className={styles.tagInfo}>
                      <span
                        className={styles.tagColorDot}
                        style={{ backgroundColor: t.color || '#38bdf8' }}
                      />
                      <span className={styles.tagName}>{t.tag}</span>
                      <span
                        className={`${styles.tagCountPill} ${t.count > 0 ? styles.tagCountPillActive : ''}`}
                        title={t.count > 0 ? `Assigned to ${t.count} dealer locations` : 'Not assigned to any dealers yet (Catalog only)'}
                      >
                        {t.count} {t.count === 1 ? 'dealer' : 'dealers'}
                      </span>
                    </div>
                    <div className={styles.tagActions}>
                      <button
                        type="button"
                        className={styles.deleteBtn}
                        onClick={() => handleDelete(t)}
                        title={t.count > 0 ? `Remove "${t.tag}" (used by ${t.count} dealers)` : `Delete "${t.tag}" from catalog`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <span className={styles.footerNote}>
            Global tags are instantly available in the Filter Bar, Table Quick Action popover, and Floating Batch Bar.
          </span>
          <button type="button" className={styles.doneBtn} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
