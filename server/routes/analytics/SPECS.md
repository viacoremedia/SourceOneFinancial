# SPECS.md — Server Routes (Analytics)

> API endpoints for the dealer analytics dashboard, rolling averages, and Dealer Relationship Demand (DRD) allocation engine.

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

---

### `GET /analytics/groups/:slug/locations`
Returns all dealers in a group with their latest snapshot.

---

### `GET /analytics/small-dealers`
Returns independent dealers (no group) with pagination.

---

## Routes — `routes/analytics/relationshipDemand.js` (DRD Engine v6.2)

### `GET /analytics/relationship-demand/summary`
Returns high-level KPI counts, segment distribution (`high_tlc`, `self_sufficient`, `comfort_stop`, `insufficient_data`), and urgency breakdown (`overdue`, `due_soon`, `on_track`, `self_sufficient`, `not_monitored`).

**Query Params**:
| Param   | Type   | Description |
|---------|--------|-------------|
| `rep`   | String | Filter by assigned sales representative |
| `state` | String | Filter by state code (e.g. "FL", "TX") |

---

### `GET /analytics/relationship-demand/dealers`
Searchable, filterable, and paginated master list of all 3,940 dealer relationship profiles.

**Query Params**:
| Param     | Type   | Default   | Description |
|-----------|--------|-----------|-------------|
| `demand`  | String | `all`     | Segment filter (`high_tlc`, `self_sufficient`, `comfort_stop`, `insufficient_data`) |
| `urgency` | String | `all`     | Urgency filter (`overdue`, `due_soon`, `on_track`, `self_sufficient`, `not_monitored`) |
| `rep`     | String | —         | Filter by sales rep |
| `state`   | String | —         | Filter by state |
| `search`  | String | —         | Search by dealer name or clientDealerId |
| `sort`    | String | `urgency` | Sort field (`urgency`, `lift`, `volume`, `visits`, `bookings`, `yield`, `cycles`) |
| `order`   | String | `desc`    | Sort order (`asc` or `desc`) |
| `page`    | Number | 1         | Page number |
| `limit`   | Number | 25        | Page limit |

---

### `GET /analytics/relationship-demand/dealers/:clientDealerId/drawer`
Returns complete payload for the `DealerRelationshipDrawer` (<50ms response):
- `profile`: Full `DealerProfile` including `decisionRationale[]`, `interactionCycles[]`, `timelineMonthly[]`, `flags`, `lifetimeStats`.
- `recentCommunications`: Last 50 communications normalized with standardized `channel` (`visit`, `call`, `email`, `text`).
- `recentApplications`: Last 50 applications with amount, status, date, and lender.

---

### `GET /analytics/relationship-demand/rep-allocation`
Matrix diagnostics showing rep-by-rep effort allocation (High TLC visits, Self-Sufficient visits, Comfort Stop visits, and overdue alert counts).

---

### `POST /analytics/relationship-demand/recalculate`
Triggers full background recompute across all 3,940 dealer locations.

---

## Files

| File | Lines | Description |
|---|---|---|
| `index.js` | ~880 | Main analytics API (groups, dealers, rolling avgs) |
| `relationshipDemand.js` | ~380 | DRD engine routes (summary, dealers, drawer payload, rep-allocation) |
| `dealerRelationshipEngine.js` | ~510 | Core episodic pattern engine, channel normalizer & visit clusterer |
| `DealerProfile.js` | ~160 | Precomputed relationship demand profiles schema |
