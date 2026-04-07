# SPECS.md — Server

> Backend for Source One Dealer Performance Analytics.
> Express + Mongoose, deployed on Vercel.

## Directory Structure

| Path              | Purpose                                            |
|-------------------|----------------------------------------------------|
| `index.js`        | Express app entry point, middleware, route mounting |
| `models/`         | Mongoose schema definitions                        |
| `routes/`         | API route handlers                                 |
| `routes/auth/`    | Authentication endpoints (login, invite, users)    |
| `middleware/`     | Express middleware (auth, role checks)             |
| `services/`       | Business logic (ingestion, parsing, grouping, email)|
| `scripts/`        | One-off maintenance/migration scripts              |
| `webhook/`        | Webhook receiver for daily CSV delivery            |
| `data/`           | Static data files (budget CSVs, etc.)              |
| `vercel.json`     | Vercel deployment configuration                    |

## Key Entry Points

### `index.js`
- Connects to MongoDB via `MONGODB_URI` env var
- Mounts routes:
  - `/webhook` → `webhook/routes.js` (NO auth)
  - `/auth` → `routes/auth/index.js` (NO auth — login/invite)
  - `requireAuth` middleware gate (everything below requires JWT)
  - `/analytics` → `routes/analytics/index.js` (PROTECTED)
  - `/analytics/budget` → `routes/analytics/budget.js` (PROTECTED)
- Raw body parsing for webhook (Buffer for multipart, text for CSV)
- CORS enabled for all origins

## Environment Variables

| Variable       | Required | Description                    |
|----------------|----------|--------------------------------|
| `MONGODB_URI`  | Yes      | MongoDB connection string      |
| `JWT_SECRET`   | Yes      | Secret for signing JWTs        |
| `SMTP_USER`    | Yes      | Gmail address for invite emails|
| `PASSWORD`     | Yes      | Gmail app password             |
| `CLIENT_URL`   | No       | Frontend URL (default: localhost:5173) |

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
| express      | ^5.x    | HTTP framework                   |
| mongoose     | ^9.x    | MongoDB ODM                      |
| busboy       | ^1.x    | Multipart form parsing           |
| cors         | ^2.x    | Cross-origin requests            |
| dotenv       | ^17.x   | Environment variable management  |
| bcryptjs     | ^2.x    | Password hashing                 |
| jsonwebtoken | ^9.x    | JWT creation/verification        |
| nodemailer   | ^6.x    | Email delivery (SMTP)            |
