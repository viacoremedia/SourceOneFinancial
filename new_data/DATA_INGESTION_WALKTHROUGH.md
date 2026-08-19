# Data Ingestion Playbook & Walkthrough — Source One OMNI Pipeline

This document serves as the standard operating procedure (SOP) for ingesting new OMNI CSV datasets into the Source One Financial Platform.

---

## 1. Core Principles & Safety Guarantees

### Strict Execution Order
To prevent phantom/ghost dealer records (skeleton records created when communications or applications refer to unknown dealer IDs), the ingestion pipeline processes CSV tables in a strict 3-step order:

```
1. Master Dealer Information CSV (dealer_information)
   └── Creates/enriches DealerLocation master records & populates omniDealerId

2. Sales Communication CSV (dealer_communication)
   └── Upserts rep touchpoints & contact events

3. Main Application CSV (main_application)
   └── Upserts loan pipeline records & financial metrics
```

### Phantom Record Prevention Safeguards
- **Group Detector Safeguard**: `dealerGroupDetector.js` is configured to skip unknown dealer IDs rather than creating un-enriched skeleton records.
- **Snapshot Generator Safeguard**: `snapshotGeneratorService.js` queries `DealerLocation` records strictly matching `{ omniDealerId: { $exists: true, $ne: null } }`, preventing phantom dealers from polluting daily rollups.
- **Idempotency Guarantee**: Database writes use MongoDB `bulkWrite` upserts based on primary keys (`dealerId`, `sourceCommunicationId`, `applicationId`). Re-running ingestion is 100% safe.

---

## 2. Step-by-Step Data Ingestion Guide

### Step 1: Isolate New CSV Files
Create a clean directory for the incoming batch (e.g. `./new_data/aug14` or `./imports/YYYY-MM-DD`):

```bash
mkdir -p ./new_data/aug14
cp /path/to/dealer_information*.csv /path/to/salescomms*.csv /path/to/Main_data*.csv ./new_data/aug14/
```

Expected CSV tables per batch:
1. `dealer_information_...csv` (~3,900 rows) — Dealer master table
2. `salescomms_...csv` (~9,500 rows) — Sales rep communications & visits
3. `Main_data_...csv` (~3,400 rows) — Application & loan pipeline data

---

### Step 2: Validate Headers & Formats (Dry-Run Mode)
Always run a dry-run first to ensure headers and row counts parse cleanly without altering MongoDB:

```bash
node server/scripts/importOmniData.js ./new_data/aug14 --dry-run
```

Expected Output:
```
✓ [dealer_information]   -> dealer_information_for_viacore_AUG14.csv (3,937 rows)
✓ [dealer_communication] -> salescomms_vc_output_AUG14.csv (9,548 rows)
✓ [main_application]     -> Main_data_for_VC_AUG14.csv (3,414 rows)

DRY-RUN VALIDATION SUCCESSFUL
```

---

### Step 3: Execute Live Import
Run the live database import:

```bash
node server/scripts/importOmniData.js ./new_data/aug14
```

What this does:
1. Connects to MongoDB (`MONGODB_URI`).
2. Creates a `WebhookPayload` audit log entry.
3. Ingests master dealer records, creating/enriching `DealerLocation` documents.
4. Ingests sales communication touchpoints.
5. Ingests loan applications.
6. Triggers automatic snapshot generation for all active dealer locations.

---

### Step 4: Run Deduplication Cleanup
In case legacy numeric dealer IDs exist alongside alphanumeric client codes, run the deduplication tool:

```bash
node server/scripts/dedupDealerLocations.js
```

What this does:
- Merges numeric orphan dealer records into canonical alphanumeric codes.
- Reassigns/deletes orphan snapshots.
- Guarantees 1:1 clean mapping between `omniDealerId` and `clientDealerId`.

---

### Step 5: Regenerate Snapshots & Monthly Rollups (If Needed)
If you need to manually trigger snapshot generation over a specific date range:

```bash
# Default: from 2025-01-01 to today
node server/scripts/generateSnapshots.js

# Custom date range
node server/scripts/generateSnapshots.js --from=2025-06-01 --to=2026-08-19
```

---

## 3. Verification & Diagnostic Commands

### Database Health Check
Verify document counts and ensure zero phantom records exist:

```bash
node -e "
const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
const DealerLocation = require('./server/models/DealerLocation');
const Application = require('./server/models/Application');
const DealerCommunication = require('./server/models/DealerCommunication');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Total Dealers:', await DealerLocation.countDocuments());
  console.log('Dealers with omniDealerId:', await DealerLocation.countDocuments({ omniDealerId: { \$exists: true, \$ne: null } }));
  console.log('Phantom Dealers (lacking omniDealerId):', await DealerLocation.countDocuments({ omniDealerId: null }));
  console.log('Total Applications:', await Application.countDocuments());
  console.log('Total Communications:', await DealerCommunication.countDocuments());
  await mongoose.disconnect();
}
check();
"
```

---

## 4. Summary of Execution Logs for August 14 Ingestion

- **Dealer Information**: 3,937 rows processed (13 new upserted, 3,923 updated).
- **Sales Communication**: 9,548 rows processed (575 new upserted, 8,973 updated).
- **Main Application**: 3,414 rows processed (3,414 upserted).
- **Phantom Dealer Count**: 0.
- **Snapshot Generation**: Automatically executed for 3,937 dealers across 2025–2026.
