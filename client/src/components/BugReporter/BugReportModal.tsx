import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getBufferedLogs } from './RouteTracker';
import { AnnotationEditor } from './AnnotationEditor';
import html2canvas from 'html2canvas';
import type { Severity, ReportType, BugReporterUser } from './types';

const DEFAULT_API_URL = 'https://bug-reporter-tau.vercel.app';

interface BugReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  systemName: string;
  apiUrl?: string;
  user?: BugReporterUser | null;
}

// ── Self-contained styles — Enterprise Dark Slide-out Drawer ──
const S = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(10, 15, 29, 0.75)',
    zIndex: 999998,
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    animation: 'bugDrawerFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
  },
  drawer: {
    position: 'fixed' as const,
    top: 0,
    right: 0,
    bottom: 0,
    width: '490px',
    maxWidth: '95vw',
    height: '100vh',
    background: 'linear-gradient(180deg, #0d1527 0%, #090e1a 100%)',
    borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
    boxShadow: '-12px 0 36px rgba(0, 0, 0, 0.65), 0 0 1px rgba(255, 255, 255, 0.2) inset',
    zIndex: 999999,
    display: 'flex',
    flexDirection: 'column' as const,
    color: '#f8fafc',
    pointerEvents: 'auto' as const,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    animation: 'bugDrawerSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '18px 20px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    background: 'rgba(15, 23, 42, 0.85)',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#f8fafc',
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  closeBtn: {
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '6px',
    cursor: 'pointer',
    padding: '4px 8px',
    color: '#94a3b8',
    fontSize: '16px',
    lineHeight: 1,
    transition: 'all 150ms',
  },
  body: {
    padding: '20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
    overflowY: 'auto' as const,
    flex: 1,
  },
  label: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    display: 'block',
    marginBottom: '6px',
  },
  required: { color: '#ef4444' },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #334155',
    fontSize: '14px',
    color: '#f8fafc',
    background: '#1e293b',
    outline: 'none',
    boxSizing: 'border-box' as const,
    transition: 'border-color 150ms',
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #334155',
    fontSize: '14px',
    color: '#f8fafc',
    background: '#1e293b',
    outline: 'none',
    resize: 'none' as const,
    minHeight: '90px',
    boxSizing: 'border-box' as const,
    fontFamily: 'inherit',
    transition: 'border-color 150ms',
  },
  toggleRow: { display: 'flex', gap: '8px' },
  toggleBtn: (active: boolean, color: string) => ({
    flex: 1,
    padding: '10px 12px',
    borderRadius: '8px',
    border: `2px solid ${active ? color : '#334155'}`,
    background: active ? `${color}25` : '#1e293b',
    color: active ? color : '#94a3b8',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 150ms',
  }),
  screenshotRow: { display: 'flex', gap: '8px' },
  screenshotBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid #334155',
    background: '#1e293b',
    fontSize: '13px',
    fontWeight: 500,
    color: '#f8fafc',
    cursor: 'pointer',
    transition: 'background 150ms',
  },
  dropZone: {
    border: '2px dashed #334155',
    borderRadius: '8px',
    padding: '16px',
    textAlign: 'center' as const,
    cursor: 'pointer',
    color: '#94a3b8',
    fontSize: '13px',
    transition: 'border-color 150ms',
    background: '#1e293b',
  },
  severityGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' },
  severityCard: (active: boolean, borderColor: string) => ({
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '10px 8px',
    borderRadius: '8px',
    cursor: 'pointer',
    border: `2px solid ${active ? borderColor : '#334155'}`,
    background: active ? `${borderColor}25` : '#1e293b',
    transition: 'all 150ms',
  }),
  severityLabel: { fontSize: '12px', fontWeight: 600, color: '#f8fafc' },
  severityDesc: { fontSize: '10px', color: '#94a3b8', marginTop: '2px' },
  contextBar: {
    borderRadius: '8px',
    border: '1px solid #334155',
    overflow: 'hidden',
  },
  contextToggle: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    background: '#0b0f19',
    border: 'none',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 500,
    color: '#94a3b8',
  },
  contextBody: {
    padding: '8px 12px',
    fontSize: '11px',
    color: '#94a3b8',
    borderTop: '1px solid #334155',
    background: '#0b0f19',
  },
  footer: {
    padding: '16px 20px',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
    background: 'rgba(15, 23, 42, 0.95)',
    flexShrink: 0,
  },
  submitBtn: (color: string) => ({
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    border: 'none',
    background: color,
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 150ms',
  }),
  error: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px',
    color: '#ef4444',
  },
  successWrap: {
    padding: '40px 20px',
    textAlign: 'center' as const,
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successIcon: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    background: 'rgba(34, 197, 94, 0.2)',
    border: '1px solid rgba(34, 197, 94, 0.4)',
    color: '#4ade80',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
    fontSize: '28px',
  },
  successTitle: { fontSize: '18px', fontWeight: 700, color: '#f8fafc' },
  successSub: { fontSize: '13px', color: '#94a3b8', marginTop: '6px' },
  imgPreview: {
    position: 'relative' as const,
    borderRadius: '8px',
    overflow: 'hidden',
    border: '1px solid #334155',
    marginTop: '6px',
  },
  imgOverlay: {
    position: 'absolute' as const,
    top: '8px',
    right: '8px',
    display: 'flex',
    gap: '4px',
  },
  imgBtn: (bg: string) => ({
    padding: '4px 10px',
    borderRadius: '6px',
    border: 'none',
    background: bg,
    color: '#fff',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  }),
};

const severityOptions: { value: Severity; label: string; desc: string; dot: string; border: string }[] = [
  { value: 'Critical', label: 'Critical', desc: 'System is broken', dot: '#ef4444', border: '#ef4444' },
  { value: 'Urgent', label: 'Urgent', desc: 'Major issue', dot: '#f97316', border: '#f97316' },
  { value: 'Not Urgent', label: 'Not Urgent', desc: 'Minor issue', dot: '#22c55e', border: '#22c55e' },
];

export function BugReportModal({ isOpen, onClose, systemName, apiUrl, user }: BugReportModalProps) {
  const baseUrl = apiUrl || DEFAULT_API_URL;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<Severity>('Not Urgent');
  const [reportType, setReportType] = useState<ReportType>('bug');
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [showAnnotationEditor, setShowAnnotationEditor] = useState(false);
  const [isHiding, setIsHiding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [capturedContext, setCapturedContext] = useState({ page: '', userAgent: '', viewport: '' });

  useEffect(() => {
    if (isOpen) {
      setCapturedContext({
        page: window.location.href,
        userAgent: navigator.userAgent,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
      });
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !showAnnotationEditor) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showAnnotationEditor]);

  const handleNativeCapture = async () => {
    setCapturing(true); setIsHiding(true);
    await new Promise(r => setTimeout(r, 300));
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { displaySurface: 'browser' }, audio: false, preferCurrentTab: true,
      });
      const video = document.createElement('video');
      video.srcObject = stream;
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => { video.play().then(resolve).catch(reject); };
        setTimeout(() => reject(new Error('Video timeout')), 5000);
      });
      await new Promise(r => setTimeout(r, 100));
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No canvas context');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      video.remove();
      setScreenshot(canvas.toDataURL('image/jpeg', 0.6));
      setImage(null); setImagePreview(null);
    } catch (error: any) {
      if (error.name !== 'NotAllowedError') await handleLegacyCapture();
    } finally { setIsHiding(false); setCapturing(false); }
  };

  const handleLegacyCapture = async () => {
    setCapturing(true); setIsHiding(true);
    await new Promise(r => setTimeout(r, 300));
    try {
      await document.fonts.ready;
      const canvas = await html2canvas(document.body, {
        logging: false, useCORS: true, allowTaint: true, scale: 1, backgroundColor: '#ffffff',
        onclone: (doc: Document) => {
          doc.querySelectorAll('[class*="z-[999"]').forEach(el => ((el as HTMLElement).style.display = 'none'));
        },
      });
      setScreenshot(canvas.toDataURL('image/jpeg', 0.6));
      setImage(null); setImagePreview(null);
    } catch { setErrorMessage('Screenshot capture failed. You can still upload manually.'); }
    finally { setIsHiding(false); setCapturing(false); }
  };

  const handleImageSelect = (file: File) => {
    if (file.size > 5 * 1024 * 1024) { setErrorMessage('Image must be under 5MB'); return; }
    if (!file.type.startsWith('image/')) { setErrorMessage('Only image files'); return; }
    setImage(file); setImagePreview(URL.createObjectURL(file)); setScreenshot(null); setErrorMessage('');
  };

  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleImageSelect(f); };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) handleImageSelect(f); };

  const removeScreenshot = () => {
    setScreenshot(null); setImage(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
  };

  const resetForm = () => {
    setTitle(''); setDescription(''); setSeverity('Not Urgent'); setReportType('bug');
    removeScreenshot(); setSubmitStatus('idle'); setErrorMessage('');
    setShowDetails(false); setShowAnnotationEditor(false);
  };

  const handleSubmit = async () => {
    if (!title.trim()) { setErrorMessage('Please provide a title'); return; }
    setIsSubmitting(true); setErrorMessage('');
    try {
      const logs = getBufferedLogs();
      const payload: Record<string, any> = {
        message: description || title, title, description, severity,
        type: reportType, page: capturedContext.page,
        userAgent: capturedContext.userAgent, viewport: capturedContext.viewport, logs,
        reportedBy: user ? { name: user.name, email: user.email, role: user.role, userId: user.id } : undefined,
      };
      if (screenshot) payload.screenshot = screenshot;

      if (image && !screenshot) {
        const fd = new FormData();
        fd.append('screenshot', image);
        Object.entries(payload).forEach(([k, v]) => {
          if (v == null) return;
          fd.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
        });
        const r = await fetch(`${baseUrl}/api/bugs/${systemName}/report`, { method: 'POST', body: fd });
        if (!r.ok) throw new Error();
      } else {
        const r = await fetch(`${baseUrl}/api/bugs/${systemName}/report`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        if (!r.ok) throw new Error();
      }
      setSubmitStatus('success');
      setTimeout(() => { resetForm(); onClose(); }, 1500);
    } catch { setSubmitStatus('error'); setErrorMessage('Failed to submit. Please try again.'); }
    finally { setIsSubmitting(false); }
  };

  const handleClose = () => { resetForm(); onClose(); };

  // ── Annotation Editor ──
  if (showAnnotationEditor && screenshot) {
    return (
      <>
        <div style={S.backdrop} />
        <div style={{ position: 'fixed', inset: '16px', zIndex: 9999, background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.3)' }}>
          <AnnotationEditor
            imageSrc={screenshot}
            onSave={(img) => { setScreenshot(img); setShowAnnotationEditor(false); }}
            onCancel={() => setShowAnnotationEditor(false)}
          />
        </div>
      </>
    );
  }

  const hasScreenshot = !!screenshot || !!imagePreview;

  if (!isOpen) return null;

  return createPortal(
    <>
      <style>{`
        @keyframes bugDrawerSlideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes bugDrawerFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
      {/* Backdrop */}
      <div
        style={{ ...S.backdrop, opacity: isHiding ? 0 : 1, pointerEvents: isHiding ? 'none' : 'auto' }}
        onClick={handleClose}
      />

      {/* Slide-out Drawer */}
      <div
        style={{
          ...S.drawer,
          opacity: isHiding ? 0 : 1,
          pointerEvents: isHiding ? 'none' : 'auto',
        }}
      >
        {/* Header */}
        <div style={S.header}>
          <h2 style={S.headerTitle}>
            {reportType === 'bug' ? '🐛 Report a Bug' : '💡 Feature Request'}
          </h2>
          <button style={S.closeBtn} onClick={handleClose} title="Close (Esc)">✕</button>
        </div>

        {/* Success State */}
        {submitStatus === 'success' ? (
          <div style={S.successWrap}>
            <div style={S.successIcon}>✓</div>
            <h3 style={S.successTitle}>{reportType === 'bug' ? 'Bug reported!' : 'Feature requested!'}</h3>
            <p style={S.successSub}>Thank you for your feedback. We are on it!</p>
            <button
              style={{ ...S.submitBtn('#3b82f6'), maxWidth: '200px', marginTop: '16px' }}
              onClick={handleClose}
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div style={S.body}>
              {/* Type Toggle */}
              <div style={S.toggleRow}>
                <button style={S.toggleBtn(reportType === 'bug', '#dc2626')} onClick={() => setReportType('bug')}>🐛 Bug</button>
                <button style={S.toggleBtn(reportType === 'feature', '#2563eb')} onClick={() => setReportType('feature')}>💡 Feature</button>
              </div>

              {/* Title */}
              <div>
                <label style={S.label}>Title <span style={S.required}>*</span></label>
                <input
                  style={S.input}
                  placeholder={reportType === 'bug' ? "What's broken?" : "What would you like?"}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onFocus={(e) => (e.target.style.borderColor = '#3b82f6')}
                  onBlur={(e) => (e.target.style.borderColor = '#334155')}
                />
              </div>

              {/* Description */}
              <div>
                <label style={S.label}>Description</label>
                <textarea
                  style={S.textarea}
                  placeholder={reportType === 'bug' ? "Describe what went wrong..." : "Describe the feature in detail..."}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onFocus={(e) => (e.target.style.borderColor = '#3b82f6')}
                  onBlur={(e) => (e.target.style.borderColor = '#334155')}
                />
              </div>

              {/* Screenshot */}
              <div>
                <label style={S.label}>Screenshot</label>
                <div style={S.screenshotRow}>
                  <button style={S.screenshotBtn} onClick={handleNativeCapture} disabled={capturing}>
                    📷 {hasScreenshot ? 'Retake' : 'Capture Tab'}
                  </button>
                  <button style={{ ...S.screenshotBtn, flex: 'none', padding: '8px 10px' }} onClick={handleLegacyCapture} disabled={capturing} title="Legacy capture">
                    🔄
                  </button>
                  <button style={S.screenshotBtn} onClick={() => fileInputRef.current?.click()} disabled={capturing}>
                    🖼️ Upload
                  </button>
                </div>

                {/* Preview */}
                {(screenshot || imagePreview) && (
                  <div style={S.imgPreview}>
                    <img src={screenshot || imagePreview || ''} alt="Captured" style={{ width: '100%', display: 'block' }} />
                    <div style={S.imgOverlay}>
                      {screenshot && (
                        <button style={S.imgBtn('#374151')} onClick={() => setShowAnnotationEditor(true)}>✏️ Annotate</button>
                      )}
                      <button style={S.imgBtn('#ef4444')} onClick={removeScreenshot}>✕</button>
                    </div>
                  </div>
                )}

                {/* Drop zone */}
                {!screenshot && !imagePreview && (
                  <div
                    style={S.dropZone}
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                  >
                    🖼️ Or drag & drop an image
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
              </div>

              {/* Severity */}
              <div>
                <label style={S.label}>Severity</label>
                <div style={S.severityGrid}>
                  {severityOptions.map((opt) => (
                    <div key={opt.value} style={S.severityCard(severity === opt.value, opt.border)} onClick={() => setSeverity(opt.value)}>
                      <span style={S.severityLabel}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: opt.dot, marginRight: 5, verticalAlign: 'middle' }} />
                        {opt.label}
                      </span>
                      <span style={S.severityDesc}>{opt.desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Context */}
              <div style={S.contextBar}>
                <button style={S.contextToggle} onClick={() => setShowDetails(!showDetails)}>
                  <span>📎 Auto-captured context</span>
                  <span>{showDetails ? '▲' : '▼'}</span>
                </button>
                {showDetails && (
                  <div style={S.contextBody}>
                    {user && <div>User: {user.name} ({user.email}){user.role ? ` · ${user.role}` : ''}</div>}
                    <div>Page: {capturedContext.page}</div>
                    <div>Viewport: {capturedContext.viewport}</div>
                    <div>Console: {getBufferedLogs().length} log entries</div>
                  </div>
                )}
              </div>

              {/* Error */}
              {errorMessage && <div style={S.error}>⚠️ {errorMessage}</div>}
            </div>

            {/* Footer with sticky submit */}
            <div style={S.footer}>
              <button
                style={{
                  ...S.submitBtn(reportType === 'feature' ? '#2563eb' : '#16a34a'),
                  opacity: isSubmitting ? 0.6 : 1,
                }}
                onClick={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Submitting...' : reportType === 'bug' ? 'Submit Bug Report' : 'Submit Feature Request'}
              </button>
            </div>
          </>
        )}
      </div>
    </>,
    document.body
  );
}
