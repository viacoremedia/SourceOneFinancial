# SPECS.md — Server Routes (Analytics)

> API endpoints for the dealer analytics dashboard.

## Routes — `routes/analytics/index.js`

### `GET /analytics/groups`
Returns dealer groups with server-side aggregated summaries.

**Query Params**:
| Param    | Type   | Description                                      |
|----------|--------|--------------------------------------------------|
| `states` | String | Comma-separated state codes (e.g., "IL,WI,MN")  |

**Response**: Array of DealerGroup objects with computed `summary`:
```json
{
  "_id": "...",
  "name": "Blue Compass RV",
  "slug": "blue-compass-rv",
  "dealerCount": 77,
  "summary": {
    "locationCount": 4,
    "activeCount": 2,
    "inactive30Count": 1,
    "inactive60Count": 0,
    "longInactiveCount": 1,
    "reactivatedCount": 0,
    "daysSinceApp": { "best": 3, "worst": 120 },
    "daysSinceApproval": { "best": 5, "worst": 88 },
    "daysSinceBooking": { "best": 10, "worst": 200 }
  }
}
```

**Summary computation**:
- Filters DealerLocations by `statePrefix ∈ states` (if provided)
- Looks up each location's latest DailyDealerSnapshot
- Aggregates: count statuses, compute min/max days-since values
- Only returns groups whose filtered location count > 0

---

### `GET /analytics/groups/:slug/locations`
Returns all dealers in a group with their latest snapshot.

**Response**: `{ locations: DealerLocation[] }` (each with `latestSnapshot`)

---

### `GET /analytics/small-dealers`
Returns independent dealers (no group) with pagination.

**Query Params**:
| Param   | Type   | Default      | Description                     |
|---------|--------|--------------|---------------------------------|
| `sort`  | String | `dealerName` | Sort field                      |
| `dir`   | String | `asc`        | Sort direction (asc/desc)       |
| `page`  | Number | 1            | Page number                     |
| `limit` | Number | 50           | Items per page (max 200)        |

---

### `GET /analytics/state-rep-map`
Returns state → rep mapping from SalesBudget table.

**Response**: `{ IA: "Bruce", IL: "Bruce", ... }`

---

### `GET /analytics/overview`
Returns high-level counts (total groups, total dealers).

---

## Routes — `routes/analytics/budget.js`

### `GET /analytics/budget/states`
Returns state-level budget data with rep assignments.

**Response**: Array of `{ state, rep, annualTotal, monthlyBudgets }`

---

## Routes — Rolling Averages (in `index.js`)

### `GET /analytics/rolling-averages`
Network-level rolling averages across the dealer network.

**Query Params**:
| Param    | Type   | Default | Description                                    |
|----------|--------|---------|------------------------------------------------|
| `window` | Number | 7       | Window size in report dates (clamped 1–60)     |
| `states` | String | —       | Comma-separated state codes (e.g., "TX,FL")    |
| `debug`  | String | —       | Set to "true" to include raw reportDates array |

**Response**: `NetworkRollingAvgResponse`
- `current` — 5 core metrics (avgDaysSinceApp, avgDaysSinceApproval, avgDaysSinceBooking, avgContactDays, avgVisitResponse)
- `previous` — same metrics from the previous window
- `deltas` — current minus previous (negative = improving for days-since metrics)
- `statusFlows` — churn velocity: avgGainedActive, avgLostActive, avgReactivated, netDelta
- `reportDateRange` — { first, last, count } of dates used
- `insufficientData` — true when < 2 report dates exist

**Caching**: In-memory Map, 5-minute TTL, keyed by `window+states`.

---

### `GET /analytics/rep-scorecard`
Per-rep rolling averages, dealer counts, churn flows, and heat index data.

**Query Params**:
| Param    | Type   | Default | Description                                    |
|----------|--------|---------|------------------------------------------------|
| `window` | Number | 7       | Window size in report dates (clamped 1–60)     |
| `debug`  | String | —       | Set to "true" to include raw reportDates array |

**Response**: `RepScorecardResponse`
- `reps[]` — array of `RepScorecardEntry` objects:
  - Rep name, dealer counts (total, active, 30d, 60d, long, reactivated)
  - Rolling avg metrics (current + deltas)
  - Status flows per rep
  - Heat index, heat class, capacity ratio, capacity flag (Phase 4)
- `networkAvgDealersPerRep` — avg dealers per rep for capacity ratio
- `reportDateRange`, `insufficientData`, `windowSize`

**Caching**: In-memory Map, 5-minute TTL, keyed by `window`.

---

## Services — `services/rollingAverages.js`

| Function                     | Description                                                |
|------------------------------|------------------------------------------------------------|
| `computeNetworkRollingAvg()` | Company-wide rolling avgs with dual-window + deltas        |
| `computeRepScorecard()`      | Per-rep breakdown via SalesBudget state→rep join           |
| `computeStatusFlows()`       | Churn velocity from consecutive date-pair transitions      |

Window uses N most recent **report dates** (not calendar days) to handle data gaps.

---

## Files

| File                    | Lines | Description                               |
|-------------------------|-------|-------------------------------------------|
| `index.js`              | ~880  | Main analytics API (groups, dealers, rolling avgs) |
| `budget.js`             | ~150  | Budget/state endpoints                    |
| `rollingAverages.js`*   | ~320  | Rolling averages service (in services/)   |

