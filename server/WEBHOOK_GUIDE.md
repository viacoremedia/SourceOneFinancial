# Webhook Integration Guide — Source One Dealer Data

This document specifies the technical requirements, authentication credentials, and expected schemas for delivering automated daily/weekly report files to the Viacore Source One Platform.

---

## 1. Webhook Endpoint Details

- **Production URL:** `https://source-one-data-transfer.vercel.app/webhook`
- **Method:** `POST`
- **Authentication:** Token-based (Required)
- **Content-Type Supported:** 
  - `multipart/form-data` (Recommended for scheduled multi-file or single-file exports)
  - `text/csv` / `text/plain` (Direct raw CSV body delivery)
  - `application/octet-stream` (Raw binary stream)

---

## 2. Authentication & Credentials

All incoming webhook requests must supply the pre-shared authentication token.

### Credential Value
```
so_wh_live_ecn_8f2b7a91c4e6d302
```

### Supported Header Methods (Any of the following):
1. **Standard Bearer Token (Recommended):**
   ```http
   Authorization: Bearer so_wh_live_ecn_8f2b7a91c4e6d302
   ```
2. **Custom Webhook Token Header:**
   ```http
   x-webhook-token: so_wh_live_ecn_8f2b7a91c4e6d302
   ```
3. **API Key Header:**
   ```http
   x-api-key: so_wh_live_ecn_8f2b7a91c4e6d302
   ```
4. **Query Parameter (Fallback):**
   ```http
   POST https://source-one-data-transfer.vercel.app/webhook?token=so_wh_live_ecn_8f2b7a91c4e6d302
   ```

Requests missing a valid token will receive `401 Unauthorized`.

---

## 3. Supported Report Tables & Column Schemas

The webhook ingestion pipeline automatically detects which table is being delivered by inspecting CSV headers (case-insensitive, handling Windows/Excel BOM characters). You may upload files individually on their own schedule or together in a single multi-part batch.

### Table 1: Master Dealer Information (`dealer_information`)
- **Purpose:** Enriches dealer profiles, contact details, enrollment dates, and platform configuration flags.
- **Key Identifying Headers:** `DEALERID`, `CLIENTDEALERID`, `ISACTIVE`, `ENROLLMENTDATE`, `DEALERNAME`

### Table 2: Sales Communications (`dealer_communication`)
- **Purpose:** Tracks sales representative dealer visits, touchpoints, call notes, and contact events.
- **Key Identifying Headers:** `SOURCESYSTEMCOMMUNICATIONID`, `COMMUNICATIONTYPE`, `COMMUNICATIONEVENTDATETIME`, `COMMUNICATIONUSERFULLNAME`, `RECIPIENTORGANIZATIONNAME`

### Table 3: Main Application Pipeline (`main_application`)
- **Purpose:** Individual loan application records, underwriting stages, approvals, and booking metrics.
- **Key Identifying Headers:** `APPLICATIONID`, `AMOUNTFINANCED`, `STATUS`, `DEALERNAME`, `APPLICATIONDATE DATE`

*(Note: Legacy single-table `dealer_metrics` format remains supported for backwards compatibility).*

---

## 4. Transmission Examples

### A. Multipart Form-Data (Recommended for multi-file daily batches)
Attach each CSV as a file field. File field names can be arbitrary (`file`, `report`, `table`, etc.):

```bash
curl -X POST "https://source-one-data-transfer.vercel.app/webhook" \
  -H "Authorization: Bearer so_wh_live_ecn_8f2b7a91c4e6d302" \
  -F "dealers=@/path/to/dealer_information.csv" \
  -F "comms=@/path/to/salescomms.csv" \
  -F "apps=@/path/to/main_application.csv"
```

### B. Single File Multipart Upload
```bash
curl -X POST "https://source-one-data-transfer.vercel.app/webhook" \
  -H "Authorization: Bearer so_wh_live_ecn_8f2b7a91c4e6d302" \
  -F "file=@/path/to/daily_report.csv"
```

### C. Raw Text/CSV Direct Body Upload
When sending raw CSV in the HTTP body:
```bash
curl -X POST "https://source-one-data-transfer.vercel.app/webhook" \
  -H "Authorization: Bearer so_wh_live_ecn_8f2b7a91c4e6d302" \
  -H "Content-Type: text/csv" \
  -H "X-Filename: daily_applications.csv" \
  --data-binary @/path/to/daily_applications.csv
```

---

## 5. Expected API Responses

| Status Code | Response Body | Description |
|---|---|---|
| **200 OK** | `{"success": true, "message": "Webhook processed and saved successfully", "filesReceived": 3, "processing": true, "ingestion": [...]}` | Payload persisted to `WebhookPayload` and all tables parsed & ingested |
| **401 Unauthorized** | `{"success": false, "error": "Unauthorized", "message": "Invalid or missing webhook authentication token."}` | Token missing or incorrect |
| **400 Bad Request** | `{"success": false, "error": "Empty Payload", "message": "No data or files were provided in the request."}` | Empty body or missing files |
| **500 Internal Error**| `{"success": false, "error": "Internal Server Error", "details": "..."}` | Unexpected processing error |

---

## 6. Diagnostic & Monitoring Endpoints

### Health Check (Public / Uptime Monitoring)
```http
GET https://source-one-data-transfer.vercel.app/webhook/health
```
Returns system timestamp, database connectivity status, last received delivery, and 24-hour event counts.

### Event Logs (Auditing)
```http
GET https://source-one-data-transfer.vercel.app/webhook/logs?limit=50
```
Returns queryable audit trail including `request_received`, `parse_success`, `ingestion_complete`, `ingestion_failed`, and `unauthorized_attempt`.

### Ingestion History
```http
GET https://source-one-data-transfer.vercel.app/webhook/ingestion-log?limit=20
```
Returns detailed row counts, processing durations, and status per processed CSV.

---

## 7. Partner Email Template (Reply to Andrew Bowgen & Tim Kim)

```markdown
Hi Andrew, Tim,

Great to hear from you, and welcome aboard, Tim! We are thrilled to get the daily automated reports connected to Viacore.

Our receiving webhook is re-enabled, hardened, and ready for your daily distribution. Here are the integration details:

### Endpoint
- **URL:** https://source-one-data-transfer.vercel.app/webhook
- **Method:** POST
- **Authentication:** Bearer Token

### Credentials
- **Token:** so_wh_live_ecn_8f2b7a91c4e6d302
- **Header:** `Authorization: Bearer so_wh_live_ecn_8f2b7a91c4e6d302`
  *(Alternatively, you can pass `x-webhook-token: so_wh_live_ecn_8f2b7a91c4e6d302`)*

### Supported Formats & Tables
You can send the three report tables either as separate daily files or together in a single multipart POST:
1. **Master Dealer Information** (`dealer_information_...csv`)
2. **Sales Communications** (`salescomms_...csv`)
3. **Main Application Pipeline** (`Main_data_...csv`)

Our ingestion engine automatically detects the table format from the headers, logs every delivery to our audit database, and updates the dashboard live.

Feel free to send a test delivery anytime. You can also verify the service status at:
https://source-one-data-transfer.vercel.app/webhook/health

Looking forward to our call next week to finalize the distribution schedule!

Best regards,
Josh
```
