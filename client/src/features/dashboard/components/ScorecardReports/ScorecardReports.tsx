/**
 * ScorecardReports Component
 * 
 * Master configurator panel for generating, previewing, and downloading
 * comprehensive PDF sales scorecards across all representatives and network totals.
 * 
 * Uses Lucide React icons throughout with zero emoji characters.
 * 
 * @module features/dashboard/components/ScorecardReports/ScorecardReports
 */

import React, { useState, useMemo } from 'react';
import {
  FileText,
  Settings,
  BarChart3,
  Car,
  Target,
  Zap,
  Archive,
  Calendar,
  Users,
  Eye,
  Download,
  Trash2,
  FolderOpen,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  X,
  CheckCircle2,
  Clock,
  PackageCheck,
  ArrowLeft
} from 'lucide-react';
import {
  useScorecardReportsList,
  useScorecardReportDetail,
  useGenerateScorecardReport,
  useDeleteScorecardReport
} from '../../hooks/useScorecardReports';
import {
  getScorecardPdfUrl,
  getScorecardZipUrl,
  type ScorecardReportItem,
  type ScorecardReportFile
} from '../../../../core/services/api';
import styles from './ScorecardReports.module.css';

interface ScorecardReportsProps {
  open: boolean;
  onClose: () => void;
  initialWindowSize?: number;
  initialActivityMode?: 'application' | 'approval' | 'booking';
}

export function ScorecardReports({
  open,
  onClose,
  initialWindowSize = 7,
  initialActivityMode = 'application'
}: ScorecardReportsProps) {
  // Config state
  const [reportName, setReportName] = useState('');
  const [windowSize, setWindowSize] = useState<number>(initialWindowSize);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [activityMode, setActivityMode] = useState<'application' | 'approval' | 'booking'>(initialActivityMode);
  const [finPeriod, setFinPeriod] = useState<'mtd' | '30d' | '90d' | 'ytd' | 'all' | 'custom'>('mtd');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  const [reactivationWindow, setReactivationWindow] = useState<number>(30);
  const [touchpointMode, setTouchpointMode] = useState<'visits' | 'all'>('visits');
  const [timeframe, setTimeframe] = useState<'ytd' | '30d' | '60d' | 'custom'>('ytd');
  const [customVisitStartDate, setCustomVisitStartDate] = useState<string>('');
  const [customVisitEndDate, setCustomVisitEndDate] = useState<string>('');
  const [includeTlcList, setIncludeTlcList] = useState<boolean>(true);

  // History & Viewer state
  const [page, setPage] = useState(1);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [activeFileIndex, setActiveFileIndex] = useState<number>(0);

  // Queries & Mutations
  const { data: listData, isLoading: isListLoading, refetch: refetchReports } = useScorecardReportsList(page, 10, open);
  const { data: detailData } = useScorecardReportDetail(activeReportId);
  const generateMutation = useGenerateScorecardReport();
  const deleteMutation = useDeleteScorecardReport();

  // Active Report & Active File for PDF viewer
  const activeReport: ScorecardReportItem | null = useMemo(() => {
    if (!activeReportId) return null;
    if (detailData?.report) return detailData.report;
    return listData?.reports.find((r: ScorecardReportItem) => r._id === activeReportId) || null;
  }, [activeReportId, detailData, listData]);

  const activeFiles: ScorecardReportFile[] = activeReport?.files || [];
  const activeFile: ScorecardReportFile | null = activeFiles[activeFileIndex] || activeFiles[0] || null;

  // Handlers
  const handleGenerate = async () => {
    try {
      const statusValues = statusFilter
        ? { active: ['active'], '30d': ['30d_inactive'], '60d': ['60d_inactive'], long: ['long_inactive'] }[statusFilter] || null
        : null;

      const res = await generateMutation.mutateAsync({
        name: reportName.trim() || undefined,
        scorecard: {
          windowSize,
          statusFilter: statusValues,
          activityMode,
          finPeriod,
          customStartDate: finPeriod === 'custom' && customStartDate ? customStartDate : undefined,
          customEndDate: finPeriod === 'custom' && customEndDate ? customEndDate : undefined
        },
        visitImpact: {
          reactivationWindow,
          touchpointMode,
          timeframe,
          customStartDate: timeframe === 'custom' && customVisitStartDate ? customVisitStartDate : undefined,
          customEndDate: timeframe === 'custom' && customVisitEndDate ? customVisitEndDate : undefined
        },
        drd: {
          includeTlcList
        }
      });

      refetchReports();

      if (res.reportId) {
        setActiveReportId(res.reportId);
        setActiveFileIndex(0);
      }
    } catch (err) {
      console.error('Failed to trigger generation:', err);
    }
  };

  const handleDelete = async (reportId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Delete this report archive and its PDF files from disk?')) {
      return;
    }
    try {
      if (activeReportId === reportId) {
        setActiveReportId(null);
      }
      await deleteMutation.mutateAsync(reportId);
      refetchReports();
    } catch (err) {
      console.error('Failed to delete report:', err);
    }
  };

  const handleOpenViewer = (report: ScorecardReportItem) => {
    setActiveReportId(report._id);
    setActiveFileIndex(0);
  };

  const handleNextFile = () => {
    if (activeFileIndex < activeFiles.length - 1) {
      setActiveFileIndex(activeFileIndex + 1);
    }
  };

  const handlePrevFile = () => {
    if (activeFileIndex > 0) {
      setActiveFileIndex(activeFileIndex - 1);
    }
  };

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modalContainer}>
        {/* Modal Header */}
        <div className={styles.modalHeader}>
          <div className={styles.headerLeft}>
            <div className={styles.headerIcon}>
              <FileText size={22} color="#ffffff" />
            </div>
            <div>
              <h2 className={styles.headerTitle}>Scorecard PDF Reports & Executive Dispatch</h2>
              <p className={styles.headerSubtitle}>
                Unified multi-engine PDF generation, in-app previewer, and territory distribution archive
              </p>
            </div>
          </div>
          <button className={styles.closeButton} onClick={onClose} title="Close Modal">
            <X size={15} />
            <span>Close</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className={styles.modalBody}>
          {activeReport ? (
            /* ══════════════════════════════════════════════════
               IN-APP PDF VIEWER MODE
               ══════════════════════════════════════════════════ */
            <div className={styles.pdfViewerView}>
              {/* Viewer Top Navigation Bar */}
              <div className={styles.viewerControlsBar}>
                <div className={styles.viewerNavGroup}>
                  <button className={styles.backBtn} onClick={() => setActiveReportId(null)}>
                    <ArrowLeft size={14} />
                    <span>Back to Reports</span>
                  </button>

                  <button
                    className={styles.navArrowBtn}
                    onClick={handlePrevFile}
                    disabled={activeFileIndex === 0}
                    title="Previous Scorecard"
                  >
                    <ChevronLeft size={16} />
                  </button>

                  <select
                    className={styles.fileSelectorDropdown}
                    value={activeFileIndex}
                    onChange={(e) => setActiveFileIndex(Number(e.target.value))}
                  >
                    {activeFiles.map((file, idx) => (
                      <option key={file._id || idx} value={idx}>
                        {file.type === 'company' ? `[Company Overview]` : file.label} ({file.pageCount} pages)
                      </option>
                    ))}
                  </select>

                  <button
                    className={styles.navArrowBtn}
                    onClick={handleNextFile}
                    disabled={activeFileIndex >= activeFiles.length - 1}
                    title="Next Scorecard"
                  >
                    <ChevronRight size={16} />
                  </button>

                  <span className={styles.viewerCounter}>
                    {activeFile ? `${activeFile.label} (${activeFileIndex + 1} of ${activeFiles.length})` : ''}
                  </span>
                </div>

                <div className={styles.viewerRightActions}>
                  {activeFile && (
                    <a
                      href={getScorecardPdfUrl(activeReport._id, activeFile.filename)}
                      download={activeFile.filename}
                      className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Download size={13} />
                      <span>Download PDF</span>
                    </a>
                  )}

                  <a
                    href={getScorecardZipUrl(activeReport._id)}
                    className={styles.actionBtn}
                    download={`Scorecard_Reports_${activeReport._id}.zip`}
                  >
                    <PackageCheck size={13} />
                    <span>Download All (ZIP)</span>
                  </a>
                </div>
              </div>

              {/* PDF Iframe Display Area */}
              <div className={styles.iframeWrapper}>
                {activeReport.status === 'generating' ? (
                  <div className={styles.emptyState}>
                    <div className={styles.spinner} style={{ width: 36, height: 36 }} />
                    <h3 className={styles.emptyTitle}>Generating PDF Scorecards...</h3>
                    <p className={styles.emptyDesc}>
                      Calculating rolling averages, visit attribution matrix, and high TLC routing queues.
                    </p>
                  </div>
                ) : activeFile ? (
                  <iframe
                    key={`${activeReport._id}-${activeFile.filename}`}
                    src={`${getScorecardPdfUrl(activeReport._id, activeFile.filename)}#toolbar=1&navpanes=0`}
                    className={styles.pdfIframe}
                    title={activeFile.label}
                  />
                ) : (
                  <div className={styles.emptyState}>
                    <AlertTriangle size={36} color="#f59e0b" />
                    <h3 className={styles.emptyTitle}>No PDF Available</h3>
                    <p className={styles.emptyDesc}>Could not load the requested scorecard document.</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ══════════════════════════════════════════════════
               SPLIT VIEW: CONFIGURATOR + HISTORY ARCHIVES
               ══════════════════════════════════════════════════ */
            <div className={styles.splitView}>
              {/* Left: Master Configurator */}
              <div className={styles.configPanel}>
                <div>
                  <div className={styles.configSectionTitle}>
                    <Settings size={14} />
                    <span>Report Naming & Identification</span>
                  </div>
                  <div className={styles.configCard}>
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Custom Report Label (Optional)</label>
                      <input
                        type="text"
                        className={styles.inputField}
                        placeholder="e.g. Weekly Sales Review — Aug 2026"
                        value={reportName}
                        onChange={(e) => setReportName(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <div className={styles.configSectionTitle}>
                    <BarChart3 size={14} />
                    <span>Scorecard Engine Settings</span>
                  </div>
                  <div className={styles.configCard}>
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Financial & Pipeline Period</label>
                      <div className={styles.segmentGroup}>
                        {(['mtd', '30d', '90d', 'ytd', 'all', 'custom'] as const).map((p) => (
                          <button
                            key={p}
                            type="button"
                            className={`${styles.segmentBtn} ${finPeriod === p ? styles.segmentBtnActive : ''}`}
                            onClick={() => setFinPeriod(p)}
                          >
                            {p.toUpperCase()}
                          </button>
                        ))}
                      </div>
                      {finPeriod === 'custom' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
                          <div>
                            <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Start Date</label>
                            <input
                              type="date"
                              className={styles.inputField}
                              value={customStartDate}
                              onChange={(e) => setCustomStartDate(e.target.value)}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>End Date</label>
                            <input
                              type="date"
                              className={styles.inputField}
                              value={customEndDate}
                              onChange={(e) => setCustomEndDate(e.target.value)}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Portfolio Recency Status Filter</label>
                      <div className={styles.segmentGroup}>
                        {[
                          { id: null, label: 'All' },
                          { id: 'active', label: 'Active' },
                          { id: '30d', label: '30d' },
                          { id: '60d', label: '60d' },
                          { id: 'long', label: '90d+' },
                        ].map((s) => (
                          <button
                            key={s.label}
                            type="button"
                            className={`${styles.segmentBtn} ${statusFilter === s.id ? styles.segmentBtnActive : ''}`}
                            onClick={() => setStatusFilter(s.id)}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Status Classification By</label>
                      <div className={styles.segmentGroup}>
                        {[
                          { id: 'application', label: 'App Recency' },
                          { id: 'approval', label: 'Approval' },
                          { id: 'booking', label: 'Booking' },
                        ].map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            className={`${styles.segmentBtn} ${activityMode === m.id ? styles.segmentBtnActive : ''}`}
                            onClick={() => setActivityMode(m.id as any)}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Rolling Average Window</label>
                      <div className={styles.segmentGroup}>
                        {[7, 14, 30].map((w) => (
                          <button
                            key={w}
                            type="button"
                            className={`${styles.segmentBtn} ${windowSize === w ? styles.segmentBtnActive : ''}`}
                            onClick={() => setWindowSize(w)}
                          >
                            {w} Days
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className={styles.configSectionTitle}>
                    <Car size={14} />
                    <span>Visit Impact & Reactivation Settings</span>
                  </div>
                  <div className={styles.configCard}>
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Reactivation Window</label>
                      <div className={styles.segmentGroup}>
                        {[14, 30, 60].map((rw) => (
                          <button
                            key={rw}
                            type="button"
                            className={`${styles.segmentBtn} ${reactivationWindow === rw ? styles.segmentBtnActive : ''}`}
                            onClick={() => setReactivationWindow(rw)}
                          >
                            {rw} Days
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Touchpoint Mode</label>
                      <div className={styles.segmentGroup}>
                        {[
                          { id: 'visits', label: 'In-Person Visits' },
                          { id: 'all', label: 'All Communications' },
                        ].map((tm) => (
                          <button
                            key={tm.id}
                            type="button"
                            className={`${styles.segmentBtn} ${touchpointMode === tm.id ? styles.segmentBtnActive : ''}`}
                            onClick={() => setTouchpointMode(tm.id as any)}
                          >
                            {tm.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Analysis Timeframe</label>
                      <div className={styles.segmentGroup}>
                        {(['ytd', '30d', '60d', 'custom'] as const).map((tf) => (
                          <button
                            key={tf}
                            type="button"
                            className={`${styles.segmentBtn} ${timeframe === tf ? styles.segmentBtnActive : ''}`}
                            onClick={() => setTimeframe(tf)}
                          >
                            {tf.toUpperCase()}
                          </button>
                        ))}
                      </div>
                      {timeframe === 'custom' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
                          <div>
                            <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Start Date</label>
                            <input
                              type="date"
                              className={styles.inputField}
                              value={customVisitStartDate}
                              onChange={(e) => setCustomVisitStartDate(e.target.value)}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>End Date</label>
                            <input
                              type="date"
                              className={styles.inputField}
                              value={customVisitEndDate}
                              onChange={(e) => setCustomVisitEndDate(e.target.value)}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <div className={styles.configSectionTitle}>
                    <Target size={14} />
                    <span>DRD & Sales Routing</span>
                  </div>
                  <div className={styles.configCard}>
                    <label className={styles.checkboxRow}>
                      <input
                        type="checkbox"
                        className={styles.checkboxInput}
                        checked={includeTlcList}
                        onChange={(e) => setIncludeTlcList(e.target.checked)}
                      />
                      <span>Include Priority High TLC Action Queue & Comfort Stop Diagnostic</span>
                    </label>
                  </div>
                </div>

                <button
                  type="button"
                  className={styles.generateActionBtn}
                  onClick={handleGenerate}
                  disabled={generateMutation.isPending}
                >
                  {generateMutation.isPending ? (
                    <>
                      <div className={styles.spinner} />
                      <span>Initiating Generation...</span>
                    </>
                  ) : (
                    <>
                      <Zap size={16} />
                      <span>Generate PDF Reports Package</span>
                    </>
                  )}
                </button>
              </div>

              {/* Right: History Archives */}
              <div className={styles.historyPanel}>
                <div className={styles.historyHeader}>
                  <h3 className={styles.historyTitle}>
                    <Archive size={18} color="#38bdf8" />
                    <span>Report History Archives</span>
                    <span className={styles.historyBadge}>{listData?.total || 0} Total</span>
                  </h3>
                </div>

                {isListLoading ? (
                  <div className={styles.emptyState}>
                    <div className={styles.spinner} style={{ width: 28, height: 28 }} />
                    <p className={styles.emptyDesc}>Loading scorecard archives...</p>
                  </div>
                ) : listData?.reports && listData.reports.length > 0 ? (
                  <div className={styles.reportsList}>
                    {listData.reports.map((report: ScorecardReportItem) => {
                      const isReady = report.status === 'ready';
                      const isGen = report.status === 'generating';

                      return (
                        <div key={report._id} className={styles.reportCard}>
                          <div className={styles.reportCardLeft}>
                            <div className={styles.reportName}>
                              <span>{report.name}</span>
                              <span
                                className={`${styles.statusBadge} ${
                                  isReady ? styles.statusReady : isGen ? styles.statusGenerating : styles.statusFailed
                                }`}
                              >
                                {isReady ? (
                                  <>
                                    <CheckCircle2 size={11} />
                                    <span>Ready</span>
                                  </>
                                ) : isGen ? (
                                  <>
                                    <Clock size={11} />
                                    <span>Generating</span>
                                  </>
                                ) : (
                                  <>
                                    <AlertTriangle size={11} />
                                    <span>Failed</span>
                                  </>
                                )}
                              </span>
                            </div>

                            <div className={styles.reportMeta}>
                              <div className={styles.metaItem}>
                                <Calendar size={12} />
                                <span>{new Date(report.generatedAt).toLocaleString()}</span>
                              </div>
                              <div className={styles.metaItem}>
                                <Users size={12} />
                                <span>{report.repCount || 0} Reps</span>
                              </div>
                              <div className={styles.metaItem}>
                                <FileText size={12} />
                                <span>{report.files?.length || 0} PDFs</span>
                              </div>
                            </div>

                            {report.summaryStats && (
                              <div className={styles.reportStatsPills}>
                                <span className={styles.statPill}>
                                  Booked: <strong className={styles.statPillHighlight}>${Math.round((report.summaryStats.totalBookedVolume || 0) / 1000).toLocaleString()}K</strong>
                                </span>
                                <span className={styles.statPill}>
                                  Dealers: <strong>{report.summaryStats.totalDealers || 0}</strong>
                                </span>
                                <span className={styles.statPill}>
                                  Visits: <strong>{report.summaryStats.totalVisits || 0}</strong>
                                </span>
                                <span className={styles.statPill}>
                                  Avg Heat: <strong>{report.summaryStats.avgHeatIndex || 50}/100</strong>
                                </span>
                              </div>
                            )}
                          </div>

                          <div className={styles.reportActions}>
                            {isReady && (
                              <button
                                type="button"
                                className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                                onClick={() => handleOpenViewer(report)}
                              >
                                <Eye size={13} />
                                <span>View</span>
                              </button>
                            )}

                            {isReady && (
                              <a
                                href={getScorecardZipUrl(report._id)}
                                className={styles.actionBtn}
                                download={`Scorecard_Reports_${report._id}.zip`}
                                title="Download all PDFs as ZIP"
                              >
                                <Download size={13} />
                                <span>ZIP</span>
                              </a>
                            )}

                            <button
                              type="button"
                              className={`${styles.actionBtn} ${styles.actionBtnDelete}`}
                              onClick={(e) => handleDelete(report._id, e)}
                              title="Delete Report Archive"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <FolderOpen size={36} color="#64748b" />
                    <h3 className={styles.emptyTitle}>No Generated Reports Yet</h3>
                    <p className={styles.emptyDesc}>
                      Select your parameters on the left and click "Generate PDF Reports Package" to produce company-wide and per-rep scorecards.
                    </p>
                  </div>
                )}

                {/* Pagination Controls */}
                {listData && listData.totalPages > 1 && (
                  <div className={styles.paginationBar}>
                    <span className={styles.pageInfo}>
                      Page {listData.page} of {listData.totalPages} ({listData.total} items)
                    </span>
                    <div className={styles.pageButtons}>
                      <button
                        className={styles.pageBtn}
                        onClick={() => setPage(Math.max(1, page - 1))}
                        disabled={page <= 1}
                      >
                        <ChevronLeft size={13} />
                        <span>Prev</span>
                      </button>
                      <button
                        className={styles.pageBtn}
                        onClick={() => setPage(Math.min(listData.totalPages, page + 1))}
                        disabled={page >= listData.totalPages}
                      >
                        <span>Next</span>
                        <ChevronRight size={13} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
