# SPECS.md — Server Webhook

> Receives daily CSV data from Source One via HTTP POST.

## Routes

### `POST /webhook`
Receives raw CSV file delivery. Handles multipart/form-data, text/csv, and raw binary.

**Flow**:
1. Parses incoming body (multipart, string, or Buffer)
2. Extracts filename from Content-Disposition, custom headers, or query params
3. Saves raw payload to `WebhookPayload` collection
4. Detects CSV format via `csvParserService.detectParser()`
5. If recognized, triggers `ingestDealerMetricsCSV()` (fire-and-forget after responding)

**Response**: `200 { success: true, processing: true }`

---

### `GET /webhook`
Returns recent webhook payloads (for debugging).

**Query Params**: `?limit=5` (max 20)

---

### `GET /webhook/ingestion-log`
Returns CSV processing history from `FileIngestionLog`.

**Query Params**: `?limit=10&status=completed`

---

### `GET /webhook/:id`
Returns full payload by ID (includes raw file content).

## Files

| File        | Description                      |
|-------------|----------------------------------|
| `routes.js` | Express router with all endpoints |
