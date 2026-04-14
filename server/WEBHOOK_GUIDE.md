# Webhook Integration Guide – Source One Dealer Data

## Endpoint Details

- **URL:** `https://source-one-data-transfer.vercel.app/webhook`
- **Method:** `POST`
- **Content-Type:** `multipart/form-data`, `text/csv`, or raw binary

## Payload Requirements

The endpoint accepts CSV file delivery in multiple formats:

1. **Multipart form-data** — Attach the CSV as a standard file upload field
2. **Raw text/CSV** — Send the CSV content directly as the request body with `Content-Type: text/csv`
3. **Binary** — Raw binary body with appropriate content-type

You may include additional metadata (e.g., `reportName`, `source`) as standard text fields within the form data.

## Testing the Webhook

```bash
# Multipart file upload
curl -X POST "https://source-one-data-transfer.vercel.app/webhook" \
  -F "file=@/path/to/your/test_file.csv" \
  -F "source=omni-bi"

# Raw CSV body
curl -X POST "https://source-one-data-transfer.vercel.app/webhook" \
  -H "Content-Type: text/csv" \
  -H "X-Filename: daily_report.csv" \
  --data-binary @/path/to/your/test_file.csv
```

## Expected Responses

| Status | Meaning |
|--------|---------|
| **200 OK** | Webhook processed and data saved successfully |
| **400 Bad Request** | Empty payload — no data or files provided |
| **500 Internal Server Error** | Unexpected processing error |

## Diagnostic Endpoints

### Health Check
```
GET https://source-one-data-transfer.vercel.app/webhook/health
```
Returns server status, database connectivity, last webhook received, and event counts for the last 24 hours.

### Event Logs
```
GET https://source-one-data-transfer.vercel.app/webhook/logs
```
Returns persistent webhook event history. Query parameters:
- `?limit=50` — Number of entries (max 200)
- `?eventType=request_received` — Filter by event type
- `?since=2026-04-01` — Filter from date
- `?until=2026-04-14` — Filter to date

### Recent Payloads
```
GET https://source-one-data-transfer.vercel.app/webhook
```
Returns the most recent raw webhook payloads (for debugging content).

### Ingestion History
```
GET https://source-one-data-transfer.vercel.app/webhook/ingestion-log
```
Returns CSV processing results with status, row counts, and timing.

## Troubleshooting

1. **No data arriving?** → Hit `/webhook/health` to confirm the server is up and check `lastReceived`
2. **Data arriving but not processing?** → Check `/webhook/logs?eventType=parse_error` for format issues
3. **Ingestion failing?** → Check `/webhook/logs?eventType=ingestion_failed` for error details
4. **Re-process a failed payload?** → `POST /webhook/reingest/:payloadId`
