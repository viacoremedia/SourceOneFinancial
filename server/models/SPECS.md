# SPECS.md — Server Models

> Mongoose schemas for all MongoDB collections.

## Models

### `DealerGroup.js`
Multi-location dealer brand (e.g., "Blue Compass RV").

| Field        | Type     | Description                                  |
|-------------|----------|----------------------------------------------|
| `name`       | String   | Display name (title case), unique             |
| `slug`       | String   | URL-safe identifier, unique, indexed          |
| `dealerCount`| Number   | Number of linked DealerLocations              |

**Indexes**: `{ slug: 1 }` (unique)

---

### `DealerLocation.js`
A single physical dealer location.

| Field         | Type     | Description                                 |
|--------------|----------|---------------------------------------------|
| `dealerId`    | String   | Source One ID (e.g., "TX400"), unique        |
| `dealerName`  | String   | Full name from CSV                          |
| `dealerGroup` | ObjectId | Ref → DealerGroup (null for independents)   |
| `statePrefix` | String   | 2-letter state code extracted from dealerId |

**Indexes**: `{ dealerId: 1 }` (unique), `{ dealerGroup: 1 }`

---

### `DailyDealerSnapshot.js`
One snapshot per dealer per report date. Core metrics table.

| Field                        | Type     | Description                           |
|------------------------------|----------|---------------------------------------|
| `dealerLocation`             | ObjectId | Ref → DealerLocation                  |
| `dealerGroup`                | ObjectId | Ref → DealerGroup (nullable)          |
| `reportDate`                 | Date     | Date this snapshot represents          |
| `lastApplicationDate`        | Date     | Date of most recent application        |
| `priorApplicationDate`       | Date     | Date of previous application           |
| `daysSinceLastApplication`   | Number   | Days since last app                    |
| `lastApprovalDate`           | Date     | Date of most recent approval           |
| `daysSinceLastApproval`      | Number   | Days since last approval               |
| `lastBookedDate`             | Date     | Date of most recent booking            |
| `daysSinceLastBooking`       | Number   | Days since last booking                |
| `activityStatus`             | String   | Enum: active, 30d_inactive, 60d_inactive, long_inactive, never_active |
| `latestCommunicationDatetime`| Date     | Last communication timestamp           |
| `reactivatedAfterVisit`      | Boolean  | Whether reactivated after sales visit  |
| `daysFromVisitToNextApp`     | Number   | Days from visit to next application    |
| `sourcePayload`              | ObjectId | Ref → WebhookPayload                  |

**Indexes**: `{ dealerLocation: 1, reportDate: 1 }` (unique compound)

---

### `MonthlyDealerRollup.js`
Monthly aggregation of daily snapshots for a dealer.

| Field          | Type     | Description                              |
|----------------|----------|------------------------------------------|
| `dealerLocation`| ObjectId | Ref → DealerLocation                    |
| `dealerGroup`  | ObjectId | Ref → DealerGroup (nullable)             |
| `year`         | Number   | e.g., 2026                               |
| `month`        | Number   | 1–12                                     |
| `daysActive`   | Number   | Count of days with 'active' status       |
| `daysInactive` | Number   | Count of days with any inactive status   |
| `avgDaysSinceApp` | Number | Average daysSinceLastApplication         |

**Indexes**: `{ dealerLocation: 1, year: 1, month: 1 }` (unique compound)

---

### `LargeDealerBudget.js`
Monthly budget amounts per state (for rep/state budget display).

| Field          | Type     | Description                              |
|----------------|----------|------------------------------------------|
| `state`        | String   | 2-letter state code                      |
| `rep`          | String   | Sales rep name                           |
| `year`         | Number   | Budget year                              |
| `monthlyBudgets` | Map<String, Number> | Month → dollar amount           |
| `annualTotal`  | Number   | Sum of all monthly budgets               |

---

### `SalesBudget.js`
Alternative budget storage (per-state annual totals).

---

### `FileIngestionLog.js`
Tracks each CSV processing attempt.

| Field              | Type     | Description                          |
|--------------------|----------|--------------------------------------|
| `sourcePayload`    | ObjectId | Ref → WebhookPayload (unique)       |
| `fileName`         | String   | Original filename                    |
| `status`           | String   | pending, processing, completed, failed |
| `reportDate`       | Date     | Inferred report date                 |
| `rowCount`         | Number   | Total CSV rows parsed                |
| `dealersProcessed` | Number   | Snapshots upserted                   |
| `newDealers`       | Number   | New DealerLocations created          |
| `newGroups`        | Number   | New DealerGroups created             |
| `errorReason`      | String   | Error message if failed              |
| `processingTimeMs` | Number   | Total processing time                |

---

### `WebhookPayload.js`
Raw webhook payload storage (for debugging/replay).

| Field        | Type     | Description                          |
|-------------|----------|--------------------------------------|
| `body`       | Mixed    | Parsed body fields                   |
| `files`      | Array    | Array of { originalName, mimeType, content } |
| `headers`    | Mixed    | Raw request headers                  |
| `receivedAt` | Date     | Timestamp of receipt                 |
