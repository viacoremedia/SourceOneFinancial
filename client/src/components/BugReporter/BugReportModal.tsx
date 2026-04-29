import { useState, useRef, useEffect } from 'react';
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

// ── Self-contained styles — works on ANY host app ──
const S = {
  backdrop: {
    position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.5)',
    zIndex: 9998, transition: 'opacity 200ms',
  },
  wrapper: {
    position: 'fixed' as const, top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)', zIndex: 9999,
    width: '100%', maxWidth: '440px', padding: '0 16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    background: '#ffffff', borderRadius: '12px',
    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
    maxHeight: '90vh', overflowY: 'auto' as const,
    border: '1px solid #e5e7eb',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 20px', borderBottom: '1px solid #e5e7eb',
  },
  headerTitle: {
    fontSize: '16px', fontWeight: 600, color: '#111827', margin: 0,
  },
  closeBtn: {
    background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
    color: '#9ca3af', fontSize: '20px', lineHeight: 1,
  },
  body: { padding: '20px', display: 'flex', flexDirection: 'column' as const, gap: '16px' },
  label: {
    fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px',
  },
  required: { color: '#ef4444' },
  input: {
    width: '100%', padding: '10px 12px', borderRadius: '8px',
    border: '1px solid #d1d5db', fontSize: '14px', color: '#111827',
    background: '#ffffff', outline: 'none', boxSizing: 'border-box' as const,
    transition: 'border-color 150ms',
  },
  textarea: {
    width: '100%', padding: '10px 12px', borderRadius: '8px',
    border: '1px solid #d1d5db', fontSize: '14px', color: '#111827',
    background: '#ffffff', outline: 'none', resize: 'none' as const,
    minHeight: '90px', boxSizing: 'border-box' as const,
    fontFamily: 'inherit', transition: 'border-color 150ms',
  },
  toggleRow: { display: 'flex', gap: '8px' },
  toggleBtn: (active: boolean, color: string) => ({
    flex: 1, padding: '10px 12px', borderRadius: '8px',
    border: `2px solid ${active ? color : '#e5e7eb'}`,
    background: active ? `${color}10` : '#ffffff',
    color: active ? color : '#6b7280',
    fontSize: '14px', fontWeight: 600, cursor: 'pointer',
    transition: 'all 150ms',
  }),
  screenshotRow: { display: 'flex', gap: '8px' },
  screenshotBtn: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
    padding: '8px 12px', borderRadius: '8px',
    border: '1px solid #d1d5db', background: '#ffffff',
    fontSize: '13px', fontWeight: 500, color: '#374151', cursor: 'pointer',
    transition: 'background 150ms',
  },
  dropZone: {
    border: '2px dashed #d1d5db', borderRadius: '8px', padding: '16px',
    textAlign: 'center' as const, cursor: 'pointer', color: '#9ca3af',
    fontSize: '13px', transition: 'border-color 150ms',
  },
  severityGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' },
  severityCard: (active: boolean, borderColor: string) => ({
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
    padding: '10px 8px', borderRadius: '8px', cursor: 'pointer',
    border: `2px solid ${active ? borderColor : '#e5e7eb'}`,
    background: active ? `${borderColor}10` : '#ffffff',
    transition: 'all 150ms',
  }),
  severityLabel: { fontSize: '12px', fontWeight: 600, color: '#374151' },
  severityDesc: { fontSize: '10px', color: '#9ca3af', marginTop: '2px' },
  contextBar: {
    borderRadius: '8px', border: '1px solid #e5e7eb', overflow: 'hidden',
  },
  contextToggle: {
    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 12px', background: '#f9fafb', border: 'none', cursor: 'pointer',
    fontSize: '12px', fontWeight: 500, color: '#6b7280',
  },
  contextBody: {
    padding: '8px 12px', fontSize: '11px', color: '#6b7280',
    borderTop: '1px solid #e5e7eb', background: '#fafafa',
  },
  submitBtn: (color: string) => ({
    width: '100%', padding: '12px', borderRadius: '8px',
    border: 'none', background: color, color: '#ffffff',
    fontSize: '14px', fontWeight: 600, cursor: 'pointer',
    transition: 'opacity 150ms',
  }),
  error: {
    display: 'flex', alignItems: 'center', gap: '6px',
    fontSize: '13px', color: '#ef4444',
  },
  successWrap: {
    padding: '40px 20px', textAlign: 'center' as const,
  },
  successIcon: {
    width: '56px', height: '56px', borderRadius: '50%', background: '#dcfce7',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    margin: '0 auto 16px', fontSize: '28px',
  },
  successTitle: { fontSize: '16px', fontWeight: 600, color: '#111827' },
  successSub: { fontSize: '13px', color: '#6b7280', marginTop: '4px' },
  imgPreview: {
    position: 'relative' as const, borderRadius: '8px', overflow: 'hidden',
    border: '1px solid #e5e7eb', marginTop: '6px',
  },
  imgOverlay: {
    position: 'absolute' as const, top: '8px', right: '8px',
    display: 'flex', gap: '4px',
  },
  imgBtn: (bg: string) => ({
    padding: '4px 10px', borderRadius: '6px', border: 'none',
    background: bg, color: '#fff', fontSize: '11px', fontWeight: 600,
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
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

  if (!isOpen) return null;

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

  return (
    <>
      {/* Backdrop */}
      <div style={{ ...S.backdrop, opacity: isHiding ? 0 : 1, pointerEvents: isHiding ? 'none' : 'auto' }} onClick={handleClose} />

      {/* Modal */}
      <div style={{ ...S.wrapper, opacity: isHiding ? 0 : 1, pointerEvents: isHiding ? 'none' : 'auto' }}>
        <div style={S.card}>

          {/* Header */}
          <div style={S.header}>
            <h2 style={S.headerTitle}>
              {reportType === 'bug' ? '🐛 Report a Bug' : '💡 Feature Request'}
            </h2>
            <button style={S.closeBtn} onClick={handleClose}>✕</button>
          </div>

          {/* Success */}
          {submitStatus === 'success' ? (
            <div style={S.successWrap}>
              <div style={S.successIcon}>✓</div>
              <h3 style={S.successTitle}>{reportType === 'bug' ? 'Bug reported!' : 'Feature requested!'}</h3>
              <p style={S.successSub}>Thank you for your feedback</p>
            </div>
          ) : (
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
                  onBlur={(e) => (e.target.style.borderColor = '#d1d5db')}
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
                  onBlur={(e) => (e.target.style.borderColor = '#d1d5db')}
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

              {/* Submit */}
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
          )}
        </div>
      </div>
    </>
  );
}
