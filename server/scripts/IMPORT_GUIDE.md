# OMNI Data Import Guide

> Step-by-step instructions for performing manual or automated CSV imports into the Source One Intelligence Platform.

---

## Overview

The system supports importing three core OMNI data tables exported from Andrew Bowgen's team:

1. **Dealer Information** (`dealer_information`) — Dealer master reference data (3,852 records).
2. **Sales Communication** (`dealer_communication`) — Rep visits and contact events from Badger (8,631 records).
3. **Main Application** (`main_application`) — Individual loan applications with financial and pipeline data (241,771 records).

The import tool (`importOmniData.js`) automatically detects CSV headers, categorizes files, executes idempotent database writes, and triggers snapshot generation.

---

## Quick Start — Manual Upload

### 1. Place CSV files in a folder

Place the CSV exports received from Andrew into a folder in the workspace (e.g. `./new_data` or `./imports/2026-07-20`).

Example files:
- `Dealer information (july 20 2026) for VC.csv`
- `Sales communication for VC (July 20 2026).csv`
- `Main information download for VC (July 20 2026).csv`

### 2. Test in Dry-Run Mode (Validation Only)

Before modifying the database, run a dry-run to validate file headers and row counts:

```bash
node server/scripts/importOmniData.js ./new_data --dry-run
```

Expected output:
```
✓ [dealer_information] -> Dealer information (july 20 2026) for VC.csv
✓ [dealer_communication] -> Sales communication for VC (July 20 2026).csv
✓ [main_application] -> Main information download  for VC (July 20 2026).csv

DRY-RUN VALIDATION SUCCESSFUL
```

### 3. Execute Live Import

Run the live import script to upsert records into MongoDB and generate snapshots:

```bash
node server/scripts/importOmniData.js ./new_data
```

### 4. CLI Options

| Command / Option | Description |
|------------------|-------------|
| `node server/scripts/importOmniData.js <dir>` | Imports all recognized CSV files in `<dir>` and generates snapshots. |
| `--table=dealers` | Only process Dealer Information CSV files. |
| `--table=communications` | Only process Sales Communication CSV files. |
| `--table=applications` | Only process Main Application CSV files. |
| `--dry-run` | Validates CSV files without writing to MongoDB. |
| `--skip-snapshots` | Skips snapshot generation after database import. |

---

## Standalone Snapshot Generator

If you only need to re-generate daily snapshots (e.g. after adding new application records or updating dates) without re-parsing CSV files:

```bash
# Generate snapshots from 2025-01-01 to today
node server/scripts/generateSnapshots.js

# Custom date range
node server/scripts/generateSnapshots.js --from=2025-06-01 --to=2026-07-20

# Single dealer
node server/scripts/generateSnapshots.js --dealer=TX400
```

---

## Ingestion Order & Idempotency

The pipeline processes files in strict logical order:
1. **Dealer Information** — creates/enriches `DealerLocation` documents and auto-detects brand groups.
2. **Sales Communication** — creates `DealerCommunication` documents (indexed by `internalRelationshipId2`).
3. **Main Application** — creates/updates `Application` documents (upserted on `applicationId`).
4. **Snapshot Generator** — builds `DailyDealerSnapshot` documents.

**Safety Guarantee:** All writes use Mongoose `bulkWrite` upserts based on primary keys (`dealerId`, `sourceCommunicationId`, `applicationId`). Re-running the script on the same files is 100% safe and will update existing records without duplicating data.
