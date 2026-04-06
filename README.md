# Source One — Dealer Performance Analytics

A full-stack MERN application for tracking dealer activity metrics across a national dealer network. Receives daily CSV reports via webhook, processes them into structured MongoDB documents, and presents an interactive analytics dashboard.

## Tech Stack

| Layer     | Technology                        |
|-----------|-----------------------------------|
| Frontend  | Vite + React (TypeScript)         |
| Backend   | Node.js + Express (JavaScript)    |
| Database  | MongoDB (Mongoose)                |
| Deployment| Vercel                            |

## Project Structure

```
Source One/
├── client/                 # Frontend — Vite + React
│   ├── src/
│   │   ├── core/           # Shared components, hooks, services, styles
│   │   ├── features/       # Feature-sliced modules
│   │   │   └── dashboard/  # Dealer performance dashboard
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── package.json
├── server/                 # Backend — Express + Mongoose
│   ├── models/             # Mongoose schemas
│   ├── routes/             # API route handlers
│   ├── services/           # Business logic (ingestion, parsing, groups)
│   ├── scripts/            # One-off maintenance scripts
│   ├── webhook/            # Webhook receiver for daily CSV ingestion
│   └── index.js            # Express entry point
├── CHANGELOG.md            # Root changelog (all modules)
└── README.md               # This file
```

## Getting Started

### Prerequisites
- Node.js 18+
- MongoDB instance (connection URI in `.env`)

### Installation
```bash
# Install server dependencies
cd server && npm install

# Install client dependencies
cd ../client && npm install
```

### Development
```bash
# Terminal 1 — Backend (port 3001)
cd server && npm run dev

# Terminal 2 — Frontend (port 5173)
cd client && npm run dev
```

### Environment Variables

**Server** (`server/.env`):
```
MONGODB_URI=mongodb+srv://...
```

**Client** (`client/.env.development`):
```
VITE_API_URL=http://localhost:3001
```

## Data Pipeline

```
Source One CSV → POST /webhook → csvParserService → dealerGroupDetector
                                                   → dealerMetricsIngestionService
                                                   → DailyDealerSnapshot (MongoDB)
                                                   → rollupService (monthly aggregates)
```

1. **Webhook** receives daily CSV via `POST /webhook`
2. **CSV Parser** validates headers and extracts rows
3. **Group Detector** resolves dealer names → DealerLocation + DealerGroup
4. **Ingestion Service** bulk upserts DailyDealerSnapshot documents (idempotent)
5. **Rollup Service** rebuilds monthly aggregates for the affected month

## Key Concepts

- **Dealer Group**: A brand with 2+ locations (e.g., "Blue Compass RV" with 77 stores)
- **Independent Dealer**: A single-location dealer (no group)
- **DailyDealerSnapshot**: One row per dealer per day, capturing activity status and metrics
- **Activity Status**: `active`, `30d_inactive`, `60d_inactive`, `long_inactive`, `never_active`
- **Best/Worst**: Group-level aggregation showing min/max days-since-app across locations
