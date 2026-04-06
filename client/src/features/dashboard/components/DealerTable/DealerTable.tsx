/**
 * DealerTable — Main data table for the dealer dashboard.
 * 
 * Features:
 * - Group rows (expandable) with summary stats (best/worst, active ratio)
 * - Multi-column sorting (Ctrl/Cmd+Click to add secondary sorts)
 * - Independent child location sorting (Shift+Click)
 * - Heatmap coloring for days-since metrics
 * - Flat dealer list for "Independent Dealers" tab
 * - Search, trend dropdown, skeleton loading
 */

import { useState, useMemo, useCallback } from 'react';
import styles from './DealerTable.module.css';
import { TABLE_COLUMNS } from './columns';
import { StatusBadge } from './StatusBadge';
import { getDaysSinceHeatmap } from '../../../../core/utils/heatmap';
import type {
  DealerGroup,
  DealerLocation,
  TrendPeriod,
  ActivityStatus,
  BestWorst,
} from '../../types';

// ── Types ──

interface DealerTableProps {
  mode: 'groups' | 'dealers';
  groups: DealerGroup[];
  groupLocations: Record<string, DealerLocation[]>;
  smallDealers: DealerLocation[];
  isLoading: boolean;
  onExpandGroup: (slug: string) => void;
}

type SortDir = 'asc' | 'desc';

interface SortColumn {
  key: string;
  dir: SortDir;
}

// ── Sort Helpers ──

function getActiveRatio(group: DealerGroup): number {
  if (!group.summary || group.summary.locationCount === 0) return -1;
  return group.summary.activeCount / group.summary.locationCount;
}

function getGroupSortValue(group: DealerGroup, key: string): number {
  const s = group.summary;
  switch (key) {
    case 'daysSinceLastApplication':
      return s?.daysSinceApp?.best ?? 99999;
    case 'daysSinceLastApproval':
      return s?.daysSinceApproval?.best ?? 99999;
    case 'daysSinceLastBooking':
      return s?.daysSinceBooking?.best ?? 99999;
    case 'activityStatus':
      return getActiveRatio(group);
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
    default:
      return 0;
  }
}

/** Multi-column sort comparator for groups */
function compareGroups(a: DealerGroup, b: DealerGroup, sortStack: SortColumn[]): number {
  for (const { key, dir } of sortStack) {
    let cmp = 0;
    if (key === 'name') {
      cmp = a.name.localeCompare(b.name);
    } else {
      cmp = getGroupSortValue(a, key) - getGroupSortValue(b, key);
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
  onExpandGroup,
}: DealerTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>('mom');
  const [expandedSlugs, setExpandedSlugs] = useState<Set<string>>(new Set());

  // Multi-column sort stacks
  const [groupSortStack, setGroupSortStack] = useState<SortColumn[]>([
    { key: 'name', dir: 'asc' },
  ]);
  const [childSortStack, setChildSortStack] = useState<SortColumn[]>([
    { key: 'name', dir: 'asc' },
  ]);

  // Track which sort layer was last acted on for header display
  const [lastSortTarget, setLastSortTarget] = useState<'groups' | 'children'>('groups');

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

  // Sort handler with multi-column support
  const handleSort = useCallback(
    (key: string, e: React.MouseEvent) => {
      const isMulti = e.ctrlKey || e.metaKey; // Ctrl/Cmd = add column
      const isChildSort = e.shiftKey; // Shift = sort children only

      if (isChildSort) {
        setLastSortTarget('children');
        setChildSortStack((prev) => updateSortStack(prev, key, isMulti));
      } else {
        setLastSortTarget('groups');
        setGroupSortStack((prev) => updateSortStack(prev, key, isMulti));
      }
    },
    []
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
    sorted.sort((a, b) => compareGroups(a, b, groupSortStack));
    return sorted;
  }, [filteredGroups, groupSortStack]);

  // Filter + sort small dealers (multi-column)
  const filteredDealers = useMemo(() => {
    if (!searchQuery.trim()) return smallDealers;
    const q = searchQuery.toLowerCase();
    return smallDealers.filter((d) => d.dealerName.toLowerCase().includes(q));
  }, [smallDealers, searchQuery]);

  const sortedDealers = useMemo(() => {
    return multiSortLocations(filteredDealers, groupSortStack);
  }, [filteredDealers, groupSortStack]);

  // Which sort stack to show in headers
  const displayStack = lastSortTarget === 'children' ? childSortStack : groupSortStack;

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

  const renderChildCells = (snap: DealerLocation['latestSnapshot']) => (
    <>
      <td>{renderHeatmapCell(snap?.daysSinceLastApplication)}</td>
      <td>{renderHeatmapCell(snap?.daysSinceLastApproval)}</td>
      <td>{renderHeatmapCell(snap?.daysSinceLastBooking)}</td>
      <td style={{ textAlign: 'center' }}>
        <StatusBadge status={snap?.activityStatus as ActivityStatus} />
      </td>
      <td>{renderStubbed()}</td><td>{renderStubbed()}</td>
      <td>{renderStubbed()}</td><td>{renderStubbed()}</td>
      <td>{renderStubbed()}</td><td>{renderStubbed()}</td>
      <td>{renderStubbed()}</td><td>{renderStubbed()}</td>
      <td>{renderStubbed()}</td>
    </>
  );

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
                {TABLE_COLUMNS.map((col) => (
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
                  {TABLE_COLUMNS.slice(1).map((col) => (
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
  const hasExpandedGroups = expandedSlugs.size > 0;

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
            onChange={(e) => setSearchQuery(e.target.value)}
            id="dealer-search"
          />
          {searchQuery && (
            <button className={styles.searchClear} onClick={() => setSearchQuery('')} aria-label="Clear search">✕</button>
          )}
        </div>
        <div className={styles.toolbarRight}>
          {/* Sort stack indicator */}
          {displayStack.length > 1 && (
            <button
              className={styles.sortStackReset}
              onClick={() => {
                if (lastSortTarget === 'children') {
                  setChildSortStack([childSortStack[0]]);
                } else {
                  setGroupSortStack([groupSortStack[0]]);
                }
              }}
              title="Clear multi-sort, keep primary"
            >
              ✕ {displayStack.length} sorts
            </button>
          )}
          {mode === 'groups' && hasExpandedGroups && (
            <div className={styles.sortHint}>
              <span className={styles.sortHintKey}>Shift</span>
              <span className={styles.sortHintText}>locations</span>
              <span className={styles.sortHintKey}>Ctrl</span>
              <span className={styles.sortHintText}>multi-sort</span>
            </div>
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
      <div className={styles.tableScroll}>
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
                {TABLE_COLUMNS.map((col) => {
                  const stackIndex = displayStack.findIndex((s) => s.key === col.key);
                  const isInStack = stackIndex !== -1;
                  const sortItem = isInStack ? displayStack[stackIndex] : null;
                  const showNumber = displayStack.length > 1 && isInStack;

                  return (
                    <th
                      key={col.key}
                      style={{ textAlign: col.align, width: col.width, minWidth: col.minWidth }}
                      className={isInStack ? styles.thSorted : ''}
                      onClick={(e) => col.sortable && handleSort(col.key, e)}
                      title={col.sortable ? 'Click: sort · Ctrl+Click: multi-sort · Shift+Click: sort locations' : undefined}
                    >
                      {col.label}
                      {isInStack && (
                        <span className={styles.sortIndicator}>
                          {showNumber && <span className={styles.sortNumber}>{stackIndex + 1}</span>}
                          <span className={styles.sortArrow}>
                            {sortItem!.dir === 'asc' ? '▲' : '▼'}
                          </span>
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
                        onToggle={() => toggleGroup(group.slug)}
                        renderChildCells={renderChildCells}
                      />
                    );
                  })
                : sortedDealers.map((dealer) => (
                    <tr key={dealer._id} className={styles.dealerRow}>
                      <td><span>{dealer.dealerName}</span></td>
                      {renderChildCells(dealer.latestSnapshot)}
                    </tr>
                  ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Sort Stack Updater ──

function updateSortStack(prev: SortColumn[], key: string, isMulti: boolean): SortColumn[] {
  const existing = prev.findIndex((s) => s.key === key);

  if (isMulti) {
    // Multi-sort: toggle direction if already in stack, or add new
    if (existing !== -1) {
      const updated = [...prev];
      updated[existing] = {
        ...updated[existing],
        dir: updated[existing].dir === 'asc' ? 'desc' : 'asc',
      };
      return updated;
    }
    return [...prev, { key, dir: 'asc' }];
  }

  // Single-sort: replace stack
  if (existing !== -1 && prev.length === 1) {
    // Same column, single sort — toggle direction
    return [{ key, dir: prev[0].dir === 'asc' ? 'desc' : 'asc' }];
  }
  return [{ key, dir: 'asc' }];
}

// ── Best / Worst Cell ──

function BestWorstCell({ data }: { data: BestWorst | undefined | null }) {
  if (!data || (data.best == null && data.worst == null)) {
    return <span className={styles.emptyValue}>—</span>;
  }
  const bestColors = getDaysSinceHeatmap(data.best);
  const worstColors = getDaysSinceHeatmap(data.worst);
  return (
    <span className={styles.bestWorstCell}>
      <span className={styles.bestValue} style={bestColors ? { color: bestColors.text } : undefined}>
        {data.best ?? '—'}
      </span>
      <span className={styles.bestWorstSep}>/</span>
      <span className={styles.worstValue} style={worstColors ? { color: worstColors.text } : undefined}>
        {data.worst ?? '—'}
      </span>
    </span>
  );
}

// ── Active Count Badge ──

function ActiveCountBadge({ summary }: { summary: DealerGroup['summary'] }) {
  if (!summary) return <span className={styles.emptyValue}>—</span>;
  const { activeCount, locationCount } = summary;
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

// ── Group Rows ──

interface GroupRowsProps {
  group: DealerGroup;
  isExpanded: boolean;
  locations: DealerLocation[];
  onToggle: () => void;
  renderChildCells: (snap: DealerLocation['latestSnapshot']) => React.JSX.Element;
}

function GroupRows({ group, isExpanded, locations, onToggle, renderChildCells }: GroupRowsProps) {
  const s = group.summary;
  const stub = <span className={styles.emptyValue}>—</span>;

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
            <span className={styles.locationCount}>({group.dealerCount})</span>
          </span>
        </td>
        <td><BestWorstCell data={s?.daysSinceApp} /></td>
        <td><BestWorstCell data={s?.daysSinceApproval} /></td>
        <td><BestWorstCell data={s?.daysSinceBooking} /></td>
        <td style={{ textAlign: 'center' }}><ActiveCountBadge summary={s} /></td>
        <td>{stub}</td><td>{stub}</td><td>{stub}</td><td>{stub}</td>
        <td>{stub}</td><td>{stub}</td><td>{stub}</td><td>{stub}</td><td>{stub}</td>
      </tr>
      {isExpanded && locations.map((loc) => (
        <tr key={loc._id} className={styles.childRow}>
          <td>{loc.dealerName}</td>
          {renderChildCells(loc.latestSnapshot)}
        </tr>
      ))}
    </>
  );
}
