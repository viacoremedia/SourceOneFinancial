# SPECS.md — Server

> Backend for Source One Dealer Performance Analytics.
> Express + Mongoose, deployed on Vercel.

## Directory Structure

| Path              | Purpose                                            |
|-------------------|----------------------------------------------------|
| `index.js`        | Express app entry point, middleware, route mounting |
| `models/`         | Mongoose schema definitions                        |
| `routes/`         | API route handlers                                 |
| `services/`       | Business logic (ingestion, parsing, grouping)      |
| `scripts/`        | One-off maintenance/migration scripts              |
| `webhook/`        | Webhook receiver for daily CSV delivery            |
| `data/`           | Static data files (budget CSVs, etc.)              |
| `vercel.json`     | Vercel deployment configuration                    |

## Key Entry Points

### `index.js`
- Connects to MongoDB via `MONGODB_URI` env var
- Mounts routes:
  - `/webhook` → `webhook/routes.js`
  - `/analytics` → `routes/analytics/index.js`
  - `/analytics/budget` → `routes/analytics/budget.js`
- Raw body parsing for webhook (Buffer for multipart, text for CSV)
- CORS enabled for all origins

## Environment Variables

| Variable       | Required | Description                    |
|----------------|----------|--------------------------------|
| `MONGODB_URI`  | Yes      | MongoDB connection string      |

## Data Flow

```
POST /webhook (CSV)
  → csvParserService.parseCSV()
  → dealerGroupDetector.resolveDealerBatch()
  → dealerMetricsIngestionService.ingestDealerMetricsCSV()
  → DailyDealerSnapshot.bulkWrite()
  → rollupService.rebuildRollupsForDate()
```

## Dependencies

| Package      | Version | Purpose                          |
|--------------|---------|----------------------------------|
| express      | ^4.x    | HTTP framework                   |
| mongoose     | ^8.x    | MongoDB ODM                      |
| busboy       | ^1.x    | Multipart form parsing           |
| cors         | ^2.x    | Cross-origin requests            |
| dotenv-flow  | ^4.x    | Environment variable management  |
