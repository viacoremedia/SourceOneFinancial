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

## Files

| File        | Lines | Description                          |
|-------------|-------|--------------------------------------|
| `index.js`  | ~600  | Main analytics API (groups, dealers) |
| `budget.js` | ~150  | Budget/state endpoints               |
