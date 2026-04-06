# SPECS.md — Server Services

> Core business logic for data ingestion, parsing, and aggregation.

## Services

### `csvParserService.js`
Validates and parses incoming CSV files.

| Export            | Type     | Description                                         |
|-------------------|----------|-----------------------------------------------------|
| `parseCSV(content, expectedHeaders)` | Function | Parses CSV string → `{ rows: Object[] }` |
| `detectParser(headers)` | Function | Matches CSV headers to a known parser name |
| `getParser(name)` | Function | Returns parser config by name                       |

**Parser Configs**:
- `dealer_metrics` — Source One daily dealer report (expected headers: DEALER ID, DEALER NAME, APPLICATION ACTIVITY STATUS, etc.)

---

### `dealerGroupDetector.js`
Resolves dealer names into DealerLocation + DealerGroup documents.

| Export                      | Type     | Description                                         |
|-----------------------------|----------|-----------------------------------------------------|
| `extractGroupName(dealerName, dealerId)` | Function | Strips city/state/ID suffixes → uppercase brand name |
| `resolveDealerBatch(rows)`  | Function | Batch upserts locations + groups → `{ dealerMap, newDealers, newGroups }` |

**GROUP_ALIASES** (constant):
Maps known duplicate group name variations to canonical names:
```
BLUE COMPASS         → BLUE COMPASS RV
BOBBY COMBS RV CENTER → BOBBY COMBS RV  
CAMPERS INN RV       → CAMPERS INN
GENERAL RV CENTER    → GENERAL RV
INTERNATIONAL RV,    → INTERNATIONAL RV WORLD
RV COUNTRY WASHINGTON, → RV COUNTRY ARIZONA,
```

**Logic**:
1. Extract group names from all CSV rows (case-normalized)
2. Count unique dealer IDs per group name
3. Create DealerGroup docs only for names with 2+ locations
4. Upsert all DealerLocation docs (linking to group if applicable)
5. Update dealer counts on groups

---

### `dealerMetricsIngestionService.js`
Orchestrates the full CSV → MongoDB pipeline.

| Export                             | Type     | Description                                |
|------------------------------------|----------|--------------------------------------------|
| `ingestDealerMetricsCSV(csvContent, webhookPayloadId, fileName)` | Async Function | Full ingestion pipeline |

**Pipeline Steps**:
1. Create `FileIngestionLog` entry (status: processing)
2. Parse CSV via `csvParserService`
3. Infer report date from most common LAST APPLICATION DATE
4. Resolve dealers/groups via `dealerGroupDetector`
5. Build and execute bulk upsert of `DailyDealerSnapshot` docs (batches of 500)
6. Update `FileIngestionLog` (status: completed)
7. Trigger monthly rollup rebuild via `rollupService`

**Idempotent**: Safe to re-process the same CSV (upserts on `dealerLocation + reportDate`).

---

### `rollupService.js`
Aggregates daily snapshots into monthly summaries.

| Export                          | Type     | Description                                |
|---------------------------------|----------|--------------------------------------------|
| `rebuildRollupsForDate(date)`   | Async Function | Rebuilds MonthlyDealerRollup for the month containing `date` |

**Logic**:
1. Determines month boundaries from the given date
2. Aggregates all DailyDealerSnapshots in that month
3. Computes daysActive, daysInactive, avgDaysSinceApp per dealer
4. Bulk upserts MonthlyDealerRollup documents
