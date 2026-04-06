# SPECS.md — Server Scripts

> One-off maintenance, migration, and data-fixing scripts. Run manually via `node scripts/<name>.js`.

## Scripts

### `backfill.js`
Re-processes historical webhook payloads through the ingestion pipeline.

**Usage**: `node scripts/backfill.js`
**What it does**: Finds all `WebhookPayload` documents with CSV files, re-runs `ingestDealerMetricsCSV()` for each.

---

### `backfillStatePrefix.js`
Extracts 2-letter state codes from dealer IDs and writes them to `DealerLocation.statePrefix`.

**Usage**: `node scripts/backfillStatePrefix.js`
**What it does**: Parses state prefix from dealerId (e.g., "TX400" → "TX"), updates all locations.

---

### `normalizeStatePrefix.js`
Normalizes state prefixes that have inconsistent formatting.

**Usage**: `node scripts/normalizeStatePrefix.js`

---

### `importBudget.js`
Imports budget data from a CSV file into `LargeDealerBudget` and `SalesBudget` collections.

**Usage**: `node scripts/importBudget.js`
**Input**: Reads from `data/` directory.

---

### `findDuplicateGroups.js`
Finds duplicate dealer groups by exact name match (case-insensitive).

**Usage**: `node scripts/findDuplicateGroups.js`

---

### `findSlugDuplicates.js`
Finds potential duplicate groups by comparing the first 2 words of each slug.

**Usage**: `node scripts/findSlugDuplicates.js`
**Output**: Lists groups where first 2 slug words match, suggesting merges.

---

### `mergeDuplicateGroups.js`
Merges confirmed duplicate dealer groups. Migrates locations + snapshots to the primary group, then deletes the empty duplicate.

**Usage**: `node scripts/mergeDuplicateGroups.js`
**Merges confirmed** (as of 2026-04-06):
| Keep                   | Merge (deleted)           |
|------------------------|---------------------------|
| Blue Compass RV        | Blue Compass              |
| Bobby Combs RV         | Bobby Combs RV Center     |
| Campers Inn            | Campers Inn RV            |
| General RV             | General RV Center         |
| International RV World | International RV,         |
| RV Country Arizona,    | RV Country Washington,    |
