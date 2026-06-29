# Source One — Project Resumption Notes

**Last Updated:** June 29, 2026  
**Status:** Waiting for data from Andrew Bowgen (ECN Capital / Source One)  
**Email Sent:** June 29, 2026 — requesting historical CSV exports + daily OMNI webhook setup

---

## Where We Left Off

### Email Sent to Andrew (June 29, 2026)

Requested:
1. One-time historical CSV export of each of 3 OMNI tables (Jan 1, 2025 → present)
2. Daily scheduled OMNI export to our webhook: `https://source-one-data-transfer.vercel.app/webhook`
3. Confirmation of whether OMNI can schedule daily automated exports
4. Confirmation of shared dealer ID across all 3 tables (join key)

Offered both full-table daily dumps and incremental (new/updated only) — whatever's easiest in OMNI.

### What's Built and Ready

**Webhook is live and prepared for all 3 new table formats.** When Andrew sends a CSV, the system will:
1. Auto-detect which table it is (via header matching)
2. Route to the correct ingestion service
3. Bulk upsert into MongoDB
4. Log the result

Files built in this session:

| File | Purpose |
|---|---|
| `server/services/csvParserService.js` | 3 new parser registrations (`dealer_communication`, `main_application`, `dealer_information`) + case-insensitive detection |
| `server/models/Application.js` | Mongoose model — 34 fields covering all Main Application Table columns |
| `server/models/DealerCommunication.js` | Mongoose model — 19 fields covering all Dealer Communication Table columns |
| `server/models/DealerLocation.js` | Enriched with ~40 new optional fields from Dealer Information Table |
| `server/models/FileIngestionLog.js` | Added `parserType` field + compound unique index (sourcePayload + parserType) |
| `server/services/applicationIngestionService.js` | CSV → Application documents (upsert on `applicationId`) |
| `server/services/communicationIngestionService.js` | CSV → DealerCommunication documents (upsert on `sourceCommunicationId`) |
| `server/services/dealerInfoIngestionService.js` | CSV → enriches DealerLocation documents (upsert on `dealerId`) |
| `server/webhook/routes.js` | Dynamic `ingestionRouter` map dispatches to correct service |
| `server/scripts/testNewParsers.js` | Parser detection smoke test (5/5 pass) |

### What's NOT Deployed Yet

These changes are **local only** — not yet pushed to Vercel. The production webhook still only handles the legacy `dealer_metrics` format. Deploy when ready.

---

## What To Do When Data Arrives

### Step 1: Validate Column Names

Andrew's email listed columns with inconsistent formatting. When we get the first real CSV:

1. Open the CSV and check the actual header row
2. Compare against our registered parser headers in `csvParserService.js`
3. Key risk: Andrew listed `Applicationdate Date` — if the actual column includes the ` Date` suffix, update the parser registration

Run the test script to verify detection works with real headers:
```bash
cd server && node scripts/testNewParsers.js
```

### Step 2: Deploy to Vercel

```bash
cd server && vercel --prod
```

Or push to the repo if CI/CD is set up.

### Step 3: Test with Real CSV

```bash
# Send a test CSV to the webhook
curl -X POST "https://source-one-data-transfer.vercel.app/webhook" \
  -F "file=@/path/to/test_file.csv" \
  -F "source=omni-bi"
```

Check results:
- `GET /webhook/health` — verify ingestion logged
- `GET /webhook/logs` — check for errors
- `GET /webhook/ingestion-log` — check processing status
- Check MongoDB directly for new documents in the `applications`, `dealercommunications`, or `dealerlocations` collections

### Step 4: Handle Historical Data

Andrew will send a one-time historical export (Jan 2025 → present). This could be:
- Emailed as CSV attachments
- Placed in shared Dropbox folder

If emailed/Dropbox, manually POST each file to the webhook:
```bash
curl -X POST "https://source-one-data-transfer.vercel.app/webhook" \
  -F "file=@dealer_communication_table.csv"

curl -X POST "https://source-one-data-transfer.vercel.app/webhook" \
  -F "file=@main_application_table.csv"

curl -X POST "https://source-one-data-transfer.vercel.app/webhook" \
  -F "file=@dealer_information_table.csv"
```

Large files (>50MB) may need to be split or the Vercel `maxDuration` increased (currently 60s in `vercel.json`).

---

## What To Build Next (After Data Is Flowing)

### Phase 2 — API Endpoints

Build query endpoints for the new data:

| Endpoint | Purpose | Priority |
|---|---|---|
| `GET /analytics/applications` | Application pipeline data (filters: date range, dealer, status, rep, state) | **HIGH** |
| `GET /analytics/applications/summary` | Aggregate stats: total apps, approvals, bookings, $ financed per period | **HIGH** |
| `GET /analytics/communications` | Communication history (filters: date range, rep, type, dealer) | MEDIUM |
| `GET /analytics/dealers/:id/detail` | Full dealer profile (enriched DealerLocation + recent apps + comms) | MEDIUM |
| `GET /analytics/pipeline` | Funnel metrics: apps → approvals → bookings conversion rates | **HIGH** |
| `GET /analytics/revenue` | $ amounts: financed, reserve, backend by dealer/rep/state/period | **HIGH** |

### Phase 3 — Computed Metrics (Replace Legacy DailyDealerSnapshot)

The 3 new tables give us raw data. We need to compute the metrics that Caleb's old CSV pre-computed:

| Metric | Source | How |
|---|---|---|
| Days since last application per dealer | Application table | `MAX(applicationDate)` per `clientDealerId`, compute delta from today |
| Days since last approval per dealer | Application table | `MAX(approvalDate)` where `wasApproved = true` per dealer |
| Days since last booking per dealer | Application table | `MAX(bookedDate)` per dealer |
| Activity status per dealer | Computed | Same thresholds: active (<30d), 30d_inactive, 60d_inactive, long_inactive |
| Latest communication per dealer | Communication table | `MAX(communicationEventDatetime)` per `recipientOrganizationName` |
| Reactivated after visit flag | Both tables | Visit communication followed by application within N days |
| Application/approval/booking counts | Application table | COUNT per dealer per period |
| $ volume | Application table | SUM(amountFinanced) per dealer/rep/state per period |

Consider whether to:
- (A) Compute these on-the-fly from raw data (simpler, always current)
- (B) Build a new daily snapshot/rollup job that pre-computes them (faster queries, same pattern as existing `DailyDealerSnapshot`)

Recommendation: Start with (A), move to (B) if query performance becomes an issue.

### Phase 4 — Dashboard Enhancements

| Feature | Description | Joseph's Request? |
|---|---|---|
| **Application Pipeline Funnel** | Visual funnel: Apps → Approvals → Bookings with conversion rates | Yes |
| **Revenue Dashboard** | $ financed, $ reserve, $ backend by dealer/rep/state/month | Yes |
| **Communication Timeline** | Per-dealer timeline of all rep interactions | Yes |
| **Enhanced Dealer Detail** | Full profile panel with address, phone, lifecycle, platform flags | New capability |
| **Push Notifications** | Text/email alerts on anomalies (RSF-style app volume drops) | Yes — Joseph's #1 ask |
| **Dealer Heat Map** | Geographic visualization of dealer network | Yes — mentioned geo/heat map |
| **Rep Visit → Dealer Performance Correlation** | Measure ROI per rep visit | Yes — core ask |
| **Projections** | Monthly/yearly projections with seasonality | Yes — discussed in Feb emails |

### Phase 5 — Long-Term (From Prototype Documentation)

- Predictive churn detection
- Revenue-at-risk quantification
- Intelligent visit routing for reps
- Email drip campaigns based on dealer activity (not in Phase 1 budget)
- Prospect integration via stat survey data (not in Phase 1 budget)

---

## Key People

| Person | Role | Contact |
|---|---|---|
| **Andrew Bowgen** | ECN Capital — project lead, OMNI table creator | abowgen@ecncapitalcorp.com |
| **Michael Opdahl** | Source One — decision maker, paused project Apr 14 | mopdahl@source1financial.com |
| **Joseph Krimker** | Source One — end user, wants dashboard + notifications | jkrimker@source1financial.com |
| **Caleb Lindsay** | Source One — IT, set up original webhook test (legacy) | clindsay@source1financial.com |
| **Ariy** | ViaCore | ariy@viacoremedia.com |
| **Harman** | ViaCore | harman@viacoremedia.com |

---

## Important Context

- **Michael Opdahl shut the project down on April 14** — no ad-hoc data requests, all communication through him. Andrew picking it back up suggests this has been resolved, but be aware of the history.
- **The old Caleb CSV is dead** — Andrew's 3 OMNI tables replace it entirely. Don't reference the old format in communications.
- **No PII in these tables** — Andrew confirmed. This simplifies data handling.
- **Webhook URL**: `https://source-one-data-transfer.vercel.app/webhook` — deployed on Vercel, server in `server/` directory.
- **Dashboard URL**: Separate Vercel deployment from `client/` directory.
- **Database**: MongoDB Atlas (`Dev` cluster) — connection string in `server/.env`.

---

## Andrew's 3 OMNI Tables (Column Reference)

### Dealer Communication Table (19 columns)
`SOURCESYSTEMCOMMUNICATIONID`, `SOURCESYSTEM`, `COMMUNICATIONORGANIZATIONNAME`, `COMMUNICATIONUSERNAME`, `COMMUNICATIONUSERFULLNAME`, `COMMUNICATIONUSEREMAIL`, `COMMUNICATIONTYPE`, `RECIPIENTRELATIONSHIPTYPE`, `RECIPIENTORGANIZATIONNAME`, `INTERNALRELATIONSHIPID1`, `INTERNALRELATIONSHIPID2`, `COMMUNICATIONRESULT1`, `COMMUNICATIONFEEDBACK1`, `COMMUNICATIONEVENTDATETIME`, `COMMUNICATIONEVENTTIMZEONE`, `LASTCOMMUNICATIONEVENTDATETIME`, `ISPROSPECT`, `ISACTIVERELATIONSHIP`, `ISINACTIVERELATIONSHIP`

### Main Application Table (34 columns)
`Applicationid`, `Underwriter`, `Amountfinanced`, `Term`, `Status`, `Dealername`, `Dealergroup`, `Dealerstate`, `Dealercity`, `Applicationdate Date`, `Approvaldate Date`, `Bookeddate Date`, `Collateralyear`, `Collateraltype`, `Collateralnewused`, `Coficoauto8`, `Dti`, `Pti`, `Dealerrepresentative`, `Timetobook`, `Timetodecision`, `Dealerminimumrate`, `Cashdown`, `Totaldown`, `Isbusinessapp`, `Timetolastfund`, `Timetolastdecisiontolastcontract`, `Apr`, `Programmanual`, `Programdefault`, `Ltv`, `Dealerreserveamount`, `Dealerreservepercent`, `Backend`, `Invoice`, `Primaryficoauto8`, `Lender`, `Primarystate`, `Applicationsubmitteduser`, `Wasapproved`, `Wasapprovednotbooked`, `Clientdealerid`

### Dealer Information Table (34 columns)
`DEALERID`, `CLIENTDEALERID`, `ISACTIVE`, `ENROLLMENTDATE`, `ACTIVATEDDATE`, `DEACTIVATEDDATE`, `DEALERAGREEMENTDATE`, `DEALERLICENSEEXPIRATION`, `TERMINATIONDATE`, `DEALERNAME`, `DBA`, `DEALERGROUP`, `REGION`, `DEALERADDRESS`, `DEALERCITY`, `DEALERSTATE`, `DEALERPOSTALCODE`, `COUNTY`, `DEALERPHONENUMBER`, `DEALERFAXNUMBER`, `COLLATERALTYPE`, `DEALERREPRESENTATIVE`, `DOCUMENTDELIVERY`, `BOOKOUT`, `GLOBALID`, `ISACTIVEFORDEALERTRACK`, `ISACTIVEFORROUTEONE`, `ISESIGNALLOWED`, `ISFUNDINGRESERVEHOLD`, `ISBMODEALER`, `ISMEDALLIONDEALER`, `ISACTIVEFORROUTEONECANADA`, `ISACTIVEFORCREDITLANE`, `ISACTIVEFORCUDL`, `ISSOURCEONEONLY`, `ISFSBDEALER`, `ISSALESTAXREQUIRED`, `ISMULTIDECISIONENABLED`
