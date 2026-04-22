/**
 * DealerTable — Main data table for the dealer dashboard.
 * 
 * Features:
 * - Group rows (expandable) with summary stats (best/worst, active ratio)
 * - Multi-column sorting (double-click to add secondary sort columns)
 * - Independent child location sorting (Shift+Click)
 * - Heatmap coloring for days-since metrics
 * - Flat dealer list for "Independent Dealers" tab
 * - Search, trend dropdown, skeleton loading
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import styles from './DealerTable.module.css';
import { TABLE_COLUMNS } from './columns';
import { StatusBadge } from './StatusBadge';
import { getDaysSinceHeatmap, getCommDaysHeatmap } from '../../../../core/utils/heatmap';
import type { StateRepMap } from '../../../../core/services/api';
import type {
  DealerGroup,
  DealerLocation,
  TrendPeriod,
  ActivityStatus,
  BestWorst,
} from '../../types';

// ── Types ──

interface DealerTableProps {
  mode: 'groups' | 'dealers' | 'all';
  groups: DealerGroup[];
  groupLocations: Record<string, DealerLocation[]>;
  smallDealers: DealerLocation[];
  isLoading: boolean;
  isLoadingMore?: boolean;
  hasMore?: boolean;
  statusFilter?: string | null;
  isPrefetching?: boolean;
  activityMode?: 'application' | 'approval' | 'booking';
  stateRepMap?: StateRepMap;
  onExpandGroup: (slug: string) => void;
  onLoadMore?: () => void;
  onDealerSortChange?: (sortKeys: string[], sortDirs: ('asc' | 'desc')[]) => void;
  onDealerSearch?: (query: string) => void;
}

type SortDir = 'asc' | 'desc';

interface SortColumn {
  key: string;
  dir: SortDir;
}

// ── Sort Helpers ──

/** Compute days since a date string, relative to now */
function daysSinceDate(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function getGroupSortValue(group: DealerGroup, key: string, statusFilter?: string | null): number {
  const s = group.summary;
  switch (key) {
    case 'daysSinceLastApplication':
      return s?.daysSinceApp?.best ?? 99999;
    case 'daysSinceLastApproval':
      return s?.daysSinceApproval?.best ?? 99999;
    case 'daysSinceLastBooking':
      return s?.daysSinceBooking?.best ?? 99999;
    case 'activityStatus': {
      if (!s || s.locationCount === 0) return -1;
      return s.activeCount / s.locationCount;
    }
    case 'locationCount': {
      if (!s) return 0;
      if (!statusFilter) return s.locationCount;
      switch (statusFilter) {
        case 'active': return s.activeCount;
        case '30d_inactive': return s.inactive30Count;
        case '60d_inactive': return s.inactive60Count;
        case 'long_inactive': return s.longInactiveCount;
        case 'reactivated': return s.reactivatedCount;
        default: return s.locationCount;
      }
    }
    case 'commDays':
      return daysSinceDate(s?.latestComm) ?? 99999;  // best = most recent
    case 'visitToApp':
      return s?.visitToApp?.best ?? 99999;
    default:
      return 0;
  }
}

function getLocationSortValue(loc: DealerLocation, key: string): number | string {
  const snap = loc.latestSnapshot;
  switch (key) {
    case 'name':
      return loc.dealerName;
    case 'daysSinceLastApplication':
      return snap?.daysSinceLastApplication ?? 99999;
    case 'daysSinceLastApproval':
      return snap?.daysSinceLastApproval ?? 99999;
    case 'daysSinceLastBooking':
      return snap?.daysSinceLastBooking ?? 99999;
    case 'activityStatus':
      return snap?.activityStatus || 'zzz';
    case 'commDays':
      return daysSinceDate(snap?.latestCommunicationDatetime as string | null) ?? 99999;
    case 'visitToApp':
      return snap?.daysFromVisitToNextApp ?? 99999;
    default:
      return 0;
  }
}

/** Multi-column sort comparator for groups */
function compareGroups(a: DealerGroup, b: DealerGroup, sortStack: SortColumn[], statusFilter?: string | null): number {
  for (const { key, dir } of sortStack) {
    let cmp = 0;
    if (key === 'name') {
      cmp = a.name.localeCompare(b.name);
    } else {
      cmp = getGroupSortValue(a, key, statusFilter) - getGroupSortValue(b, key, statusFilter);
    }
    if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
  }
  return 0;
}

/** Multi-column sort comparator for locations */
function compareLocations(a: DealerLocation, b: DealerLocation, sortStack: SortColumn[]): number {
  for (const { key, dir } of sortStack) {
    let cmp = 0;
    const aVal = getLocationSortValue(a, key);
    const bVal = getLocationSortValue(b, key);
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      cmp = aVal.localeCompare(bVal);
    } else {
      cmp = (aVal as number) - (bVal as number);
    }
    if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
  }
  return 0;
}

function multiSortLocations(locations: DealerLocation[], sortStack: SortColumn[]): DealerLocation[] {
  if (sortStack.length === 0) return locations;
  const sorted = [...locations];
  sorted.sort((a, b) => compareLocations(a, b, sortStack));
  return sorted;
}

// ── Component ──

export function DealerTable({
  mode,
  groups,
  groupLocations,
  smallDealers,
  isLoading,
  isLoadingMore,
  hasMore,
  statusFilter,
  isPrefetching,
  onExpandGroup,
  onLoadMore,
  onDealerSortChange,
  onDealerSearch,
  activityMode = 'application',
  stateRepMap = {},
}: DealerTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>('mom');
  const [expandedSlugs, setExpandedSlugs] = useState<Set<string>>(new Set());
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search for server-side mode
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (mode !== 'groups' && onDealerSearch) {
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(() => {
          onDealerSearch(value);
        }, 350);
      }
    },
    [mode, onDealerSearch]
  );

  // Multi-column sort stacks (groups tab)
  const [groupSortStack, setGroupSortStack] = useState<SortColumn[]>([{ key: 'locationCount', dir: 'desc' }]);
  const [childSortStack, setChildSortStack] = useState<SortColumn[]>([{ key: 'name', dir: 'asc' }]);
  const [sortTarget, setSortTarget] = useState<'groups' | 'locations'>('groups');
  // Single/multi-column sort for dealer/all tabs (server-side)
  const [dealerSort, setDealerSort] = useState<SortColumn[]>([{ key: 'dealerName', dir: 'asc' }]);

  // Toggle expand
  const toggleGroup = useCallback(
    (slug: string) => {
      setExpandedSlugs((prev) => {
        const next = new Set(prev);
        if (next.has(slug)) {
          next.delete(slug);
        } else {
          next.add(slug);
          if (!groupLocations[slug]) {
            onExpandGroup(slug);
          }
        }
        return next;
      });
    },
    [groupLocations, onExpandGroup]
  );

  // Debounce ref: delays single-click so we can detect double-click first
  const sortClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Multi-column stack helper:
  // - If column exists in stack, toggle direction
  // - shouldAppend=false (single click): REPLACE stack with this column
  // - shouldAppend=true  (double click): APPEND column to stack
  const updateStack = (stack: SortColumn[], key: string, shouldAppend: boolean): SortColumn[] => {
    const idx = stack.findIndex((s) => s.key === key);
    if (idx !== -1) {
      // Already in stack → toggle direction
      const updated = [...stack];
      updated[idx] = { ...updated[idx], dir: updated[idx].dir === 'asc' ? 'desc' : 'asc' };
      return updated;
    }
    if (shouldAppend) {
      // Double-click → append for multi-sort
      return [...stack, { key, dir: 'asc' }];
    }
    // Single click → replace entire stack
    return [{ key, dir: 'asc' }];
  };

  // Shared sort executor (used by both single-click and double-click paths)
  const performSort = useCallback(
    (key: string, shouldAppend: boolean) => {
      if (mode !== 'groups' && onDealerSortChange) {
        setDealerSort((prev) => {
          const stack = updateStack(prev, key, shouldAppend);
          onDealerSortChange(
            stack.map(s => s.key),
            stack.map(s => s.dir)
          );
          return stack;
        });
      } else {
        if (sortTarget === 'locations') {
          setChildSortStack((prev) => updateStack(prev, key, shouldAppend));
        } else {
          setGroupSortStack((prev) => updateStack(prev, key, shouldAppend));
        }
      }
    },
    [mode, onDealerSortChange, sortTarget]
  );

  // Single-click handler (debounced 250ms to allow double-click detection)
  const handleSort = useCallback(
    (key: string) => {
      if (sortClickTimer.current) clearTimeout(sortClickTimer.current);
      sortClickTimer.current = setTimeout(() => {
        performSort(key, false);
        sortClickTimer.current = null;
      }, 250);
    },
    [performSort]
  );

  // Double-click handler: cancels pending single-click, appends to multi-sort
  const handleDoubleClickSort = useCallback(
    (key: string) => {
      if (sortClickTimer.current) {
        clearTimeout(sortClickTimer.current);
        sortClickTimer.current = null;
      }
      performSort(key, true);
    },
    [performSort]
  );

  // Remove a single column from the active sort stack
  const removeFromSort = useCallback(
    (key: string) => {
      if (mode !== 'groups' && onDealerSortChange) {
        setDealerSort((prev) => {
          const next = prev.filter(s => s.key !== key);
          if (next.length === 0) return prev; // can't remove last
          onDealerSortChange(next.map(s => s.key), next.map(s => s.dir));
          return next;
        });
      } else if (sortTarget === 'locations') {
        setChildSortStack((prev) => {
          const next = prev.filter(s => s.key !== key);
          return next.length === 0 ? prev : next;
        });
      } else {
        setGroupSortStack((prev) => {
          const next = prev.filter(s => s.key !== key);
          return next.length === 0 ? prev : next;
        });
      }
    },
    [mode, onDealerSortChange, sortTarget]
  );

  // Filter groups
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups;
    const q = searchQuery.toLowerCase();
    return groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [groups, searchQuery]);

  // Sort groups (multi-column)
  const sortedGroups = useMemo(() => {
    const sorted = [...filteredGroups];
    sorted.sort((a, b) => compareGroups(a, b, groupSortStack, statusFilter));
    return sorted;
  }, [filteredGroups, groupSortStack, statusFilter]);

  // In dealer mode, server handles search — no client-side filtering needed
  const sortedDealers = smallDealers;

  // Which sort to display in the headers
  const displayStack: SortColumn[] = mode !== 'groups'
    ? dealerSort
    : sortTarget === 'locations' ? childSortStack : groupSortStack;

  // Filter columns based on mode (hide groupOnly columns in dealer mode)
  const visibleColumns = useMemo(() =>
    mode === 'groups'
      ? TABLE_COLUMNS.filter((c) => !c.dealerOnly)
      : TABLE_COLUMNS.filter((c) => !c.groupOnly),
    [mode]
  );

  // ── Render Helpers ──

  const renderStubbed = () => <span className={styles.emptyValue}>—</span>;

  const renderHeatmapCell = (value: number | null | undefined) => {
    if (value == null) return <span className={styles.emptyValue}>—</span>;
    const colors = getDaysSinceHeatmap(value);
    if (!colors) return <>{value}</>;
    return (
      <span
        className={styles.heatmapCell}
        style={{ background: colors.background, color: colors.text }}
      >
        {value}
      </span>
    );
  };

  const renderCommCell = (dateStr: string | null | undefined) => {
    const days = daysSinceDate(dateStr as string | null);
    if (days == null) return <span className={styles.emptyValue}>—</span>;
    const colors = getCommDaysHeatmap(days);
    if (!colors) return <>{days}<span className={styles.unitSuffix}>d</span></>;
    return (
      <span className={styles.heatmapCell} style={{ background: colors.background, color: colors.text }}>
        {days}<span className={styles.unitSuffix}>d</span>
      </span>
    );
  };

  const renderVisitCell = (value: number | null | undefined) => {
    if (value == null) return <span className={styles.emptyValue}>—</span>;
    const colors = getDaysSinceHeatmap(value);
    if (!colors) return <>{value}<span className={styles.unitSuffix}>d</span></>;
    return (
      <span className={styles.heatmapCell} style={{ background: colors.background, color: colors.text }}>
        {value}<span className={styles.unitSuffix}>d</span>
      </span>
    );
  };

  // Derive status from the appropriate daysSince field based on activityMode
  const deriveStatus = (snap: DealerLocation['latestSnapshot']): ActivityStatus => {
    if (!snap) return 'long_inactive';
    if (activityMode === 'application') return snap.activityStatus;
    const days = activityMode === 'approval' ? snap.daysSinceLastApproval : snap.daysSinceLastBooking;
    if (days == null) return 'long_inactive';
    if (days <= 30) return 'active';
    if (days <= 60) return '30d_inactive';
    if (days <= 90) return '60d_inactive';
    return 'long_inactive';
  };

  const renderChildCells = (snap: DealerLocation['latestSnapshot'], showLocCol = true) => (
    <>
      {showLocCol && <td style={{ textAlign: 'center' }}><span className={styles.emptyValue}>—</span></td>}
      <td style={{ textAlign: 'center' }}>
        <StatusBadge status={deriveStatus(snap)} />
      </td>
      <td>{renderHeatmapCell(snap?.daysSinceLastApplication)}</td>
      <td>{renderHeatmapCell(snap?.daysSinceLastApproval)}</td>
      <td>{renderHeatmapCell(snap?.daysSinceLastBooking)}</td>
      <td>{renderCommCell(snap?.latestCommunicationDatetime as string | null)}</td>
      <td>{renderVisitCell(snap?.daysFromVisitToNextApp)}</td>
      <td>{renderStubbed()}</td><td>{renderStubbed()}</td>
      <td>{renderStubbed()}</td><td>{renderStubbed()}</td>
      <td>{renderStubbed()}</td><td>{renderStubbed()}</td>
      <td>{renderStubbed()}</td>
    </>
  );

  // Infinite scroll for dealer mode (must be before any early returns)
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || mode === 'groups' || !hasMore || isLoadingMore) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight - scrollTop - clientHeight < 300 && onLoadMore) {
        onLoadMore();
      }
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [mode, hasMore, isLoadingMore, onLoadMore]);

  // ── Loading ──
  if (isLoading) {
    return (
      <div className={styles.tableWrapper} id="dealer-table">
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <span className={styles.searchIcon}>⌕</span>
            <input className={styles.searchInput} placeholder="Search dealers..." disabled />
          </div>
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                {visibleColumns.map((col) => (
                  <th key={col.key} style={{ textAlign: col.align, width: col.width }}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...Array(12)].map((_, i) => (
                <tr key={i} className={styles.skeletonRow}>
                  <td><div className={`${styles.skeletonCell} ${styles.skeletonName}`} /></td>
                  {visibleColumns.slice(1).map((col) => (
                    <td key={col.key}><div className={`${styles.skeletonCell} ${styles.skeletonNum}`} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const isEmpty = mode === 'groups' ? sortedGroups.length === 0 : sortedDealers.length === 0;

  return (
    <div className={styles.tableWrapper} id="dealer-table">
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <span className={styles.searchIcon}>⌕</span>
          <input
            className={styles.searchInput}
            placeholder={mode === 'groups' ? 'Search dealer groups...' : 'Search dealers...'}
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            id="dealer-search"
          />
          {searchQuery && (
            <button className={styles.searchClear} onClick={() => handleSearchChange('')} aria-label="Clear search">✕</button>
          )}
        </div>
        <div className={styles.toolbarRight}>
          {/* Sort target toggle — groups tab only */}
          {mode === 'groups' && (
            <div className={styles.sortToggle}>
              <span className={styles.sortToggleLabel}>Sort:</span>
              <button
                className={`${styles.sortToggleBtn} ${sortTarget === 'groups' ? styles.sortToggleActive : ''}`}
                onClick={() => setSortTarget('groups')}
              >
                Groups
              </button>
              <button
                className={`${styles.sortToggleBtn} ${sortTarget === 'locations' ? styles.sortToggleActive : ''}`}
                onClick={() => setSortTarget('locations')}
              >
                Locations
              </button>
            </div>
          )}
          {displayStack.length > 1 && (
            <button
              className={styles.sortClearBtn}
              onClick={() => {
                if (mode !== 'groups' && onDealerSortChange) {
                  setDealerSort([dealerSort[0]]);
                  onDealerSortChange([dealerSort[0].key], [dealerSort[0].dir]);
                } else if (sortTarget === 'locations') {
                  setChildSortStack([childSortStack[0]]);
                } else {
                  setGroupSortStack([groupSortStack[0]]);
                }
              }}
              title="Reset to primary sort only"
            >
              ✕ {displayStack.length}
            </button>
          )}
          <div className={styles.trendSelect}>
            <span className={styles.trendLabel}>Trend</span>
            <select
              className={styles.trendDropdown}
              value={trendPeriod}
              onChange={(e) => setTrendPeriod(e.target.value as TrendPeriod)}
              id="trend-select"
            >
              <option value="mom">vs Last Month</option>
              <option value="yoy">vs Last Year</option>
              <option value="30d">30d Moving Avg</option>
              <option value="60d">60d Moving Avg</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className={styles.tableScroll} ref={scrollRef}>
        {isEmpty ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📊</div>
            <div className={styles.emptyTitle}>
              {searchQuery ? 'No results found' : 'No data available'}
            </div>
            <p>
              {searchQuery
                ? `No ${mode === 'groups' ? 'groups' : 'dealers'} match "${searchQuery}"`
                : 'Data will appear once reports are processed.'}
            </p>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                {visibleColumns.map((col) => {
                  const stackIdx = displayStack.findIndex((s) => s.key === col.key);
                  const isSorted = stackIdx !== -1;
                  const sortItem = isSorted ? displayStack[stackIdx] : null;
                  const showNum = displayStack.length > 1 && isSorted;

                  return (
                    <th
                      key={col.key}
                      style={{ textAlign: col.align, width: col.width, minWidth: col.minWidth }}
                      className={isSorted ? styles.thSorted : ''}
                      onClick={() => col.sortable && handleSort(col.key)}
                      onDoubleClick={() => col.sortable && handleDoubleClickSort(col.key)}
                      title={col.sortable ? 'Click to sort · Double-click to add multi-sort' : undefined}
                    >
                      {col.label}
                      {isSorted && (
                        <span className={styles.sortIndicator}>
                          {showNum && <span className={styles.sortNumber}>{stackIdx + 1}</span>}
                          <span className={styles.sortArrow}>
                            {sortItem!.dir === 'asc' ? '▲' : '▼'}
                          </span>
                          {showNum && (
                            <span
                              className={styles.sortRemove}
                              onClick={(e) => { e.stopPropagation(); removeFromSort(col.key); }}
                              title="Remove this sort"
                            >
                              ✕
                            </span>
                          )}
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {mode === 'groups'
                ? sortedGroups.map((group) => {
                    const isExpanded = expandedSlugs.has(group.slug);
                    const rawLocs = groupLocations[group.slug] || [];
                    const sortedLocs = isExpanded
                      ? multiSortLocations(rawLocs, childSortStack)
                      : rawLocs;
                    return (
                      <GroupRows
                        key={group._id}
                        group={group}
                        isExpanded={isExpanded}
                        locations={sortedLocs}
                        statusFilter={statusFilter}
                        isPrefetching={isPrefetching}
                        onToggle={() => toggleGroup(group.slug)}
                        renderChildCells={renderChildCells}
                        deriveStatusFn={deriveStatus}
                      />
                    );
                  })
                : sortedDealers.map((dealer) => (
                    <tr key={dealer._id} className={styles.dealerRow}>
                      <td><span>{dealer.dealerName}</span></td>
                      <td style={{ textAlign: 'left' }}>
                        <span className={styles.repCell}>
                          {stateRepMap[dealer.statePrefix]
                            ? stateRepMap[dealer.statePrefix].split(' ').pop()
                            : <span className={styles.emptyValue}>—</span>}
                        </span>
                      </td>
                      {renderChildCells(dealer.latestSnapshot, false)}
                    </tr>
                  ))}
              {/* Loading more indicator */}
              {isLoadingMore && (
                <tr className={styles.loadingMoreRow}>
                  <td colSpan={visibleColumns.length}>
                    <div className={styles.loadingMore}>
                      <span className={styles.loadingSpinner} />
                      Loading more dealers...
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


// ── Best / Worst Cell ──

function BestWorstCell({ data, forceSingle, useCommHeatmap, unit }: { data: BestWorst | undefined | null; forceSingle?: boolean; useCommHeatmap?: boolean; unit?: string }) {
  if (!data || (data.best == null && data.worst == null)) {
    return <span className={styles.emptyValue}>—</span>;
  }
  const heatmapFn = useCommHeatmap ? getCommDaysHeatmap : getDaysSinceHeatmap;
  const suffix = unit ? <span className={styles.unitSuffix}>{unit}</span> : null;
  // Single location — just show one value
  if (forceSingle || data.best === data.worst || data.worst == null) {
    const colors = heatmapFn(data.best);
    return (
      <span className={styles.bestWorstCell}>
        <span className={styles.bestValue} style={colors ? { color: colors.text } : undefined}>
          {data.best ?? '—'}{suffix}
        </span>
      </span>
    );
  }
  const bestColors = heatmapFn(data.best);
  const worstColors = heatmapFn(data.worst);
  return (
    <span className={styles.bestWorstCell}>
      <span className={styles.bestValue} style={bestColors ? { color: bestColors.text } : undefined}>
        {data.best ?? '—'}{suffix}
      </span>
      <span className={styles.bestWorstSep}>/</span>
      <span className={styles.worstValue} style={worstColors ? { color: worstColors.text } : undefined}>
        {data.worst ?? '—'}{suffix}
      </span>
    </span>
  );
}

// ── Active Count Badge ──

function ActiveCountBadge({
  summary,
  overrideActive,
  overrideTotal,
}: {
  summary: DealerGroup['summary'];
  overrideActive?: number;
  overrideTotal?: number;
}) {
  if (!summary && overrideActive == null) return <span className={styles.emptyValue}>—</span>;
  const activeCount = overrideActive ?? summary?.activeCount ?? 0;
  const locationCount = overrideTotal ?? summary?.locationCount ?? 0;
  const ratio = locationCount > 0 ? activeCount / locationCount : 0;
  let colorClass = styles.statusActive;
  if (ratio < 0.5) colorClass = styles.statusLong;
  else if (ratio < 0.75) colorClass = styles.status30d;
  return (
    <span className={`${styles.statusBadge} ${colorClass}`}>
      {activeCount}/{locationCount}
    </span>
  );
}

// ── Skeleton Cell ──

function SkeletonCell() {
  return <span className={styles.skeleton} />;
}

// ── Group Rows ──

interface GroupRowsProps {
  group: DealerGroup;
  isExpanded: boolean;
  locations: DealerLocation[];
  statusFilter?: string | null;
  isPrefetching?: boolean;
  onToggle: () => void;
  renderChildCells: (snap: DealerLocation['latestSnapshot'], showLocCol?: boolean) => React.JSX.Element;
  deriveStatusFn?: (snap: DealerLocation['latestSnapshot']) => ActivityStatus;
}


function computeBestWorstFromLocations(
  locations: DealerLocation[],
  field: 'daysSinceLastApplication' | 'daysSinceLastApproval' | 'daysSinceLastBooking' | 'daysFromVisitToNextApp'
): BestWorst | null {
  let best: number | null = null;
  let worst: number | null = null;
  for (const loc of locations) {
    const val = loc.latestSnapshot?.[field];
    if (val == null) continue;
    if (best === null || val < best) best = val;
    if (worst === null || val > worst) worst = val;
  }
  if (best === null && worst === null) return null;
  return { best, worst };
}

/** Compute best/worst days-since-contact from filtered locations */
function computeCommDaysBestWorst(locations: DealerLocation[]): BestWorst | null {
  let best: number | null = null;
  let worst: number | null = null;
  for (const loc of locations) {
    const d = daysSinceDate(loc.latestSnapshot?.latestCommunicationDatetime as string | null);
    if (d == null) continue;
    if (best === null || d < best) best = d;
    if (worst === null || d > worst) worst = d;
  }
  if (best === null && worst === null) return null;
  return { best, worst };
}

function GroupRows({ group, isExpanded, locations, statusFilter, isPrefetching, onToggle, renderChildCells, deriveStatusFn }: GroupRowsProps) {
  const s = group.summary;
  const stub = <span className={styles.emptyValue}>—</span>;

  // Compute the displayed location count
  let displayCount = s?.locationCount ?? group.dealerCount;
  if (statusFilter && s) {
    switch (statusFilter) {
      case 'active': displayCount = s.activeCount; break;
      case '30d_inactive': displayCount = s.inactive30Count; break;
      case '60d_inactive': displayCount = s.inactive60Count; break;
      case 'long_inactive': displayCount = s.longInactiveCount; break;
      case 'reactivated': displayCount = s.reactivatedCount; break;
    }
  }

  // When status filter is active + locations loaded, recompute from filtered children
  const hasFilteredLocs = statusFilter && locations.length > 0;
  const showSkeleton = statusFilter && !hasFilteredLocs && isPrefetching;

  const daysSinceApp = hasFilteredLocs
    ? computeBestWorstFromLocations(locations, 'daysSinceLastApplication')
    : s?.daysSinceApp ?? null;
  const daysSinceApproval = hasFilteredLocs
    ? computeBestWorstFromLocations(locations, 'daysSinceLastApproval')
    : s?.daysSinceApproval ?? null;
  const daysSinceBooking = hasFilteredLocs
    ? computeBestWorstFromLocations(locations, 'daysSinceLastBooking')
    : s?.daysSinceBooking ?? null;
  const visitToApp = hasFilteredLocs
    ? computeBestWorstFromLocations(locations, 'daysFromVisitToNextApp')
    : s?.visitToApp ?? null;
  const commDays = hasFilteredLocs
    ? computeCommDaysBestWorst(locations)
    : (() => {
        const best = daysSinceDate(s?.latestComm);
        const worst = daysSinceDate(s?.oldestComm);
        if (best == null && worst == null) return null;
        return { best, worst } as BestWorst;
      })();

  // Compute filtered active count for status badge
  let filteredActive: number | undefined;
  let filteredTotal: number | undefined;
  if (hasFilteredLocs) {
    filteredTotal = locations.length;
    filteredActive = locations.filter((loc) => {
      const status = deriveStatusFn ? deriveStatusFn(loc.latestSnapshot) : loc.latestSnapshot?.activityStatus;
      return status === 'active';
    }).length;
  }

  const isSingle = displayCount === 1;

  return (
    <>
      <tr
        className={`${styles.groupRow} ${isExpanded ? styles.groupRowExpanded : ''}`}
        onClick={onToggle}
      >
        <td>
          <span className={styles.groupName}>
            <span className={`${styles.expandIcon} ${isExpanded ? styles.expandIconOpen : ''}`}>▶</span>
            {group.name}
            <span className={styles.locationCount}>({displayCount})</span>
          </span>
        </td>
        <td style={{ textAlign: 'center' }}>{showSkeleton ? <SkeletonCell /> : (filteredTotal ?? displayCount)}</td>
        <td style={{ textAlign: 'center' }}>
          {showSkeleton ? <SkeletonCell /> : (
            <ActiveCountBadge
              summary={s}
              overrideActive={filteredActive}
              overrideTotal={filteredTotal}
            />
          )}
        </td>
        <td>{showSkeleton ? <SkeletonCell /> : <BestWorstCell data={daysSinceApp} forceSingle={isSingle} />}</td>
        <td>{showSkeleton ? <SkeletonCell /> : <BestWorstCell data={daysSinceApproval} forceSingle={isSingle} />}</td>
        <td>{showSkeleton ? <SkeletonCell /> : <BestWorstCell data={daysSinceBooking} forceSingle={isSingle} />}</td>
        <td>{showSkeleton ? <SkeletonCell /> : <BestWorstCell data={commDays} forceSingle={isSingle} useCommHeatmap unit="d" />}</td>
        <td>{showSkeleton ? <SkeletonCell /> : <BestWorstCell data={visitToApp} forceSingle={isSingle} unit="d" />}</td>
        <td>{stub}</td><td>{stub}</td><td>{stub}</td>
        <td>{stub}</td><td>{stub}</td><td>{stub}</td><td>{stub}</td>
      </tr>
      {isExpanded && locations.map((loc) => (
        <tr key={loc._id} className={styles.childRow}>
          <td>{loc.dealerName}</td>
          {renderChildCells(loc.latestSnapshot, true)}
        </tr>
      ))}
    </>
  );
}



