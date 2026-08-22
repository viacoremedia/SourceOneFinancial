# PDF Scorecard Reports System — Technical & Architectural Outline

A granular, ground-truth technical guide explaining how the PDF Scorecard Reports feature works across the full stack.

---

## 1. What This Feature Does

The **PDF Scorecard Reports** feature is a report generation, in-app preview, and download system.

From a single master configurator, a user (e.g. Sales Director Joseph) can select date ranges, rolling windows, and filters to generate a complete bundle of PDF reports:
1. **1 Company Overview PDF** (3 pages): Executive summary, all-rep comparison leaderboard, and network DRD routing.
2. **Individual Rep PDF Scorecards** (5 pages per rep): Heat Index score & 10-factor breakdown, portfolio recency, financial conversion funnel, visit attribution & reactivations, and urgent High TLC lot visit queues.

Once generated, the reports can be:
- Viewed directly inside the app using an embedded viewer with `◀` / `▶` cycling between reps.
- Downloaded individually as PDF files.
- Downloaded all together as a single `.zip` archive.
- Managed from a persistent history list with delete/CRUD controls.

---

## 2. File Map (Where Everything Lives)

### Frontend (`client/`)
- **`src/core/components/AppShell/AppShell.tsx`**: Top navigation header containing the scrollable `navCellStrip` bar and the `[📄 PDF Reports]` trigger button.
- **`src/core/components/AppShell/AppShell.module.css`**: CSS for the scrollable header cell bar and button states.
- **`src/features/dashboard/components/ScorecardReports/ScorecardReports.tsx`**: The main modal component containing the split configurator / history view and the PDF iframe viewer.
- **`src/features/dashboard/components/ScorecardReports/ScorecardReports.module.css`**: Styling for the modal, form controls, history list, and viewer.
- **`src/features/dashboard/hooks/useScorecardReports.ts`**: React hooks for report listing, detail polling, report generation, and deletion.
- **`src/core/services/api.ts`**: Axios API calls and URL helpers for fetching PDFs and ZIP files with auth tokens.

### Backend (`server/`)
- **`models/ScorecardReport.js`**: Mongoose model storing report metadata, configuration parameters, summary statistics, and file lists.
- **`services/pdfGenerator.js`**: Core PDFKit rendering engine that queries the 3 analytics sources, stitches the data together per rep, and writes `.pdf` files to disk.
- **`routes/analytics/pdfScorecard.js`**: REST API endpoints for `/generate`, `/reports`, `/reports/:id`, file streaming, and ZIP downloading.
- **`routes/analytics/index.js`**: Mounts the `/pdf-scorecard` router.
- **`middleware/authMiddleware.js`**: Accepts JWT tokens from both `Authorization: Bearer <token>` and `?token=<token>` for iframe and download requests.
- **`data/scorecard-reports/<reportId>/`**: Local disk directory where generated `.pdf` files are stored.

---

## 3. How Data is Gathered & Stitched Together

When a generation request starts, `pdfGenerator.js` pulls data from **3 separate backend sources** and unifies them using rep name normalization:

```
┌────────────────────────────────────────────────────────┐
│                   pdfGenerator.js                      │
│                                                        │
│  1. computeRepScorecard() (Scorecard Engine)          │
│     → Rolling averages, status counts, financials,     │
│       Heat Index (0-100), 10-factor breakdown         │
│                                                        │
│  2. computeVisitImpactV2() (Visit Impact Engine)       │
│     → In-person visits, calls, reactivations,          │
│       reactivated $ volume, 2x2 visit matrix          │
│                                                        │
│  3. DealerProfile.find() (DRD Engine)                  │
│     → High TLC accounts, Overdue visit queue,          │
│       Comfort Stop zero-yield list                     │
│                                                        │
│  * Harmonized via resolveRepName()                    │
│    (Maps 'wstoutimore' → 'Ward Stoutimore', etc.)      │
└────────────────────────────────────────────────────────┘
```

### Source 1: Scorecard Engine (`services/rollingAverages.js`)
- **Function**: `computeRepScorecard(windowSize, statusFilter, activityMode, finPeriod, customStartDate, customEndDate)`
- **What it provides**:
  - `totalDealers`, `activeCount`, `inactive30Count`, `inactive60Count`, `longInactiveCount`.
  - Rolling recency: `avgDaysSinceApp`, `avgDaysSinceApproval`, `avgDaysSinceBooking`, `avgContactDays`.
  - Financial conversion: `totalApps`, `approvedCount`, `bookedCount`, `bookedVolume`, `avgDealSize`, `lookToBookPct`, `approvalToBookPct`, `avgReserveAmt`, `avgAPR`, `avgTimeToBookDays`.
  - Heat Index: `heatIndex` (0–100 score), `heatClass` (`Strong`, `Average`, `Overburdened`, `Underperforming`), and `_heatBreakdown` (raw value, normalized 0–1 score, weight %, points for all 10 metrics).

### Source 2: Visit Impact Engine (`services/communicationImpactService.js`)
- **Function**: `computeVisitImpactV2({ reactivationWindow, touchpointMode, timeframe, startDate, endDate })`
- **What it provides**:
  - Field activity: `visits` (in-person dealer visits), `calls` (phone/email touchpoints).
  - Reactivations: `inactiveDealersVisited`, `reactivatedCount`, `reactivationRate`, `avgDaysToReactivation`, `reactivatedVolume`.
  - 2×2 Territory Matrix: `matrix.targeted` (inactive visited), `matrix.maintained` (active visited), `matrix.neglected` (inactive not visited), `matrix.selfSufficient` (active not visited).

### Source 3: Dealer Relationship Demand (`models/DealerProfile.js`)
- **Query**: `DealerProfile.find({ assignedRep: { $ne: null } })`
- **What it provides**:
  - `highTlcCount`: Count of dealers that submit loans only after in-person visits (spike-and-decay pattern).
  - `overdueCount` & `dueSoonCount`: High TLC dealers that have passed their recommended visit cadence (e.g. unvisited for 35+ days).
  - `overdueDealers[]`: Sorted list of specific overdue accounts (Dealer name, Client ID, state prefix, days unvisited, cadence).
  - `comfortStopCount` & `comfortStopDealers[]`: Dealerships with 3+ logged rep visits and $0 lifetime booked loans.

### Rep Name Normalization Layer (`config/repConfig.js`)
- In the DB, different collections use different identifiers for the same rep:
  - Rolling snapshots use capitalized aliases: `'Wstoutimore'`, `'Jharrington1'`, `'Gott'`.
  - Communication logs use full names: `'Ward Stoutimore'`, `'Janet Harrington'`, `'George Ott'`.
  - Dealer profiles use handles: `'wstoutimore'`, `'janet'`.
- `pdfGenerator.js` wraps all rep keys with `resolveRepName(rep)` before creating lookup Maps. This ensures every rep gets exact 1:1 data joined across all three subsystems.

---

## 4. PDF Structure & Page-by-Page Breakdown

### Company Overview PDF (`Scorecard_Company_Overview.pdf` — Exactly 3 Pages)
- **Page 1: Network Executive Summary**
  - Header with audit date ranges.
  - Top 4 stat cards: Booked Volume, Total Applications, Assigned Dealers, Field Visits & Reactivations.
  - Portfolio Recency table: Active, 30d inactive, 60d inactive, Long inactive distribution across company.
  - Operational Benchmarks table: Heat Index, Active Portfolio %, Look-to-Book %, Visit Reactivations, Contact Discipline.
- **Page 2: Sales Representative Master Comparison Table**
  - Master leaderboard table with every rep on one row: Heat Score, Classification, Assigned Dealers, Active %, Look-to-Book %, Approval-to-Book %, Avg Deal Size, Booked Volume, Visits, Reactivations.
  - Cohort Network Average row at the bottom.
- **Page 3: Dealer Relationship Demand (DRD) & Field Routing**
  - Network-wide DRD table: Assigned, High TLC, Overdue, Due Soon, Self-Sufficient, Comfort Stops, and Diagnostic Flag.
  - 3 Explanatory visual cards at the bottom: High TLC (Spike & Decay), Self-Sufficient (Autonomous), Comfort Stop (Empty Friction).

---

### Individual Rep PDF (`Scorecard_<rep_name>.pdf` — Exactly 5 Pages)
- **Page 1: Heat Index Score & 10-Factor Breakdown**
  - Large Heat Index badge (0–100) with classification badge and cohort peer rank (`#1 of 5`).
  - Executive Performance Evaluation box with automated coaching points (strength, weakness, account load).
  - 10-Factor Scorecard Table: Metric name, Weight %, Rep Value, Normalized 0–100 Score, Points Earned, Peer Baseline.
- **Page 2: Portfolio Recency & State Distribution**
  - 4 Stat cards: Assigned Dealers, Active Accounts, Contact Cadence (Days), Net Daily Flow.
  - Recency status table comparing Rep share % vs. Peer average share %.
  - State territory table (Total dealers, Active count, Active %, Booked Volume, Booked Deals by state).
- **Page 3: Underwriting & Pipeline Conversion**
  - 4 Stat cards: Booked Volume, Look-to-Book %, Avg Deal Size, Approval Rate.
  - Financial conversion funnel table: Total Apps, Approved Loans, Close Rate (A2B %), Overall Efficiency (L2B %), Avg Loan Size, Avg Reserve $, Avg APR, Time-to-Book days.
- **Page 4: Visit Impact & Reactivations**
  - 4 Stat cards: In-Person Visits, Reactivations, Reactivated $ Volume, Growth Effort %.
  - Field travel attribution table vs cohort peer averages.
  - 2×2 Territory Account Allocation Matrix (Targeted, Maintained, Neglected, Autonomous Organic).
- **Page 5: High TLC Action Plan & Overdue Queue**
  - 4 Stat cards: High TLC Accounts, Overdue Visits, Due Soon, Comfort Stops.
  - Priority Overdue Visit Queue table: Top overdue lot visits with dealer name, client ID, state, days unvisited, cadence, and urgency tag.
  - Comfort Stop Warning table: Dealers with 3+ visits and $0 booked loans with recommendation to pause travel.

---

## 5. Technical Mechanics & Engineering Traps Solved

### Trap 1: The PDFKit Blank Page Bug
- **Problem**: In PDFKit, if `margin: 20` is set on the document, drawing text near `pageHeight - 20` (such as in footers) triggers PDFKit's internal auto-pagination, inserting a blank page containing only the footer text before any explicit `doc.addPage()` call.
- **Solution**: Set `{ margin: 0, size: 'LETTER' }` on the PDFDocument and on every `doc.addPage({ margin: 0 })`. Use exact coordinates (`y = 756`) and `{ lineBreak: false }` for header and footer text.

### Trap 2: Corrupted Emojis in PDFKit
- **Problem**: Standard PDF fonts (Helvetica) use WinAnsi encoding, which does not support Unicode emojis (`⚠️`, `✅`). They render as garbage characters like `& þ`.
- **Solution**: Removed all emojis from PDF generator strings; replaced them with clean text badges: `[OVERDUE]`, `[DUE SOON]`, `[ON TRACK]`, `[ALERT]`.

### Trap 3: Missing Mongoose Schemas in Isolated Calls
- **Problem**: `computeVisitImpactV2` populates `dealerGroup` and `dealerLocation`. If called before those models are loaded in Node, Mongoose throws `MissingSchemaError`.
- **Solution**: Explicitly required all schemas at the top of `pdfGenerator.js` (`Application`, `DailyDealerSnapshot`, `DealerCommunication`, `DealerGroup`, `DealerLocation`, `DealerProfile`, `ScorecardReport`).

### Trap 4: Delete Button UI Sync
- **Problem**: Deleting a report via `useDeleteScorecardReport` removed the record on the backend, but the local list state did not update without a page refresh.
- **Solution**: Destructured `refetch` from `useScorecardReportsList` and called `refetchReports()` immediately upon delete completion.

---

## 6. REST API Endpoints

| Method | Path | Description |
| :--- | :--- | :--- |
| `POST` | `/analytics/pdf-scorecard/generate` | Starts background PDF generation for selected options. Returns `{ success: true, reportId }`. |
| `GET` | `/analytics/pdf-scorecard/reports` | Returns paginated list of past report runs (`page`, `limit`). |
| `GET` | `/analytics/pdf-scorecard/reports/:id` | Returns single report details, generation status, and file manifest. |
| `GET` | `/analytics/pdf-scorecard/reports/:id/files/:filename` | Streams a single PDF file directly to browser iframe or `<a download>`. |
| `GET` | `/analytics/pdf-scorecard/reports/:id/download` | Streams a `.zip` archive containing all PDFs in the report. |
| `DELETE` | `/analytics/pdf-scorecard/reports/:id` | Deletes the MongoDB document and deletes the report folder on disk. |

---

## 7. Configurator Options Reference

| Control | Available Options | Default | Description |
| :--- | :--- | :--- | :--- |
| **Report Label** | Free text input | Optional | Custom name for the report batch in history archives |
| **Financial Period** | `MTD`, `30D`, `90D`, `YTD`, `ALL`, `CUSTOM` | `MTD` | Time window for apps, approvals, and booked volume |
| **Custom Financial Dates** | Date pickers (`Start Date`, `End Date`) | Empty | Visible when Financial Period is set to `CUSTOM` |
| **Status Filter** | `All`, `Active`, `30d`, `60d`, `90d+` | `All` | Filter territory dealers by recency classification |
| **Status By** | `App Recency`, `Approval`, `Booking` | `App Recency` | Activity metric used for active/inactive classification |
| **Rolling Window** | `7 Days`, `14 Days`, `30 Days` | `7 Days` | Day window for rolling average calculation |
| **Reactivation Window** | `14 Days`, `30 Days`, `60 Days` | `30 Days` | Days after visit to credit loan submission as reactivation |
| **Touchpoint Mode** | `In-Person Visits`, `All Communications` | `In-Person Visits` | Filter for visit impact attribution |
| **Visit Timeframe** | `YTD`, `30D`, `60D`, `CUSTOM` | `YTD` | Time window for field visits and reactivations |
| **Custom Visit Dates** | Date pickers (`Start Date`, `End Date`) | Empty | Visible when Visit Timeframe is set to `CUSTOM` |
| **DRD Toggle** | Checkbox (`Include Priority TLC Queue`) | `true` | Include High TLC overdue list and comfort stop warning |
