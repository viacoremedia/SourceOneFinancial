# Source One - Andrews Daily Dealer Metrics

## File Summary

| Property | Value |
|----------|-------|
| **File Name** | `andrews_daily_dealer_metrics.csv` (via `x-filename` header) |
| **MIME Type** | `text/csv` |
| **Size** | 274,135 characters |
| **Rows** | 2,489 data rows + 1 header = **2,490 lines** |
| **Received** | 2026-03-30 12:55:34 UTC |

## CSV Schema (13 Columns)

| # | Column | Example Value | Description |
|---|--------|---------------|-------------|
| 1 | `DEALER ID` | `FL319` | Unique dealer identifier (state prefix + number) |
| 2 | `DEALER NAME` | `Auction Direct RV - FL319` | Full dealer name |
| 3 | `LAST APPLICATION DATE` | `2026-03-29` | Most recent application date |
| 4 | `PRIOR APPLICATION DATE` | `2026-03-29` | Previous application date |
| 5 | `DAYS SINCE LAST APPLICATION` | `1` | Days since last application |
| 6 | `LAST APPROVAL DATE` | `2026-03-27` | Most recent approval date |
| 7 | `DAYS SINCE LAST APPROVAL` | `3` | Days since last approval |
| 8 | `LAST BOOKED DATE` | `2026-03-24` | Most recent booking date |
| 9 | `DAYS SINCE LAST BOOKING` | `6` | Days since last booking |
| 10 | `APPLICATION ACTIVITY STATUS` | `active` | Status: `active`, `long_inactive`, `never_active` |
| 11 | `LATEST COMMUNICATION DATETIME` | `2026-03-04 13:42` | Last communication timestamp |
| 12 | `REACTIVATED AFTER SALES VISIT FLAG` | `0` | Boolean flag (0/1) |
| 13 | `DAYS FROM VISIT TO NEXT APPLICATION` | `25` | Days between visit and next app |

## Activity Status Distribution

The file appears to be sorted by activity status / recency:
- **Top rows**: `active` dealers with recent dates (2026-03-29)
- **Middle rows**: `long_inactive` dealers with older dates
- **Last row**: `never_active` with no data

## Sample Data (First 5 Rows)

```csv
DEALER ID,DEALER NAME,LAST APPLICATION DATE,PRIOR APPLICATION DATE,DAYS SINCE LAST APPLICATION,LAST APPROVAL DATE,DAYS SINCE LAST APPROVAL,LAST BOOKED DATE,DAYS SINCE LAST BOOKING,APPLICATION ACTIVITY STATUS,LATEST COMMUNICATION DATETIME,REACTIVATED AFTER SALES VISIT FLAG,DAYS FROM VISIT TO NEXT APPLICATION
FL319,Auction Direct RV - FL319,2026-03-29,2026-03-29,1,2026-03-27,3,2026-03-24,6,active,2026-03-04 13:42,0,25
NC153,Blue Compass RV - Charlotte - NC153,2026-03-29,2026-03-29,1,2026-03-28,2,2026-02-12,46,active,2026-03-10 07:12,0,19
TN160,Campers Inn RV of Knoxville E - TN160,2026-03-29,2026-03-28,1,2026-03-25,5,2026-03-16,14,active,2026-02-17 13:02,0,40
SCA167,Blue Compass RV - San Marcos - SCA167,2026-03-29,2026-03-28,1,2026-03-28,2,2026-03-12,18,active,2026-03-05 18:11,0,24
```

## How Source One Sends Data

> [!IMPORTANT]
> Source One does **NOT** use multipart/form-data. They send the CSV as a **raw text body** with:
> - `Content-Type: text/csv`
> - `x-filename: andrews_daily_dealer_metrics.csv` (filename in custom header)
> - `User-Agent: node-fetch`
> - Body = raw CSV content

## What Was Fixed

The original webhook used `multer` (multipart parser), which couldn't read the body because:
1. Source One sends raw `text/csv`, not `multipart/form-data`
2. Vercel's `@vercel/node` runtime pre-consumes the request stream before Express gets it

The fix replaced multer with:
- `express.raw()` for multipart capture
- `express.text()` for raw text/csv capture  
- `busboy` for multipart parsing (future-proof)
- Filename extraction from `x-filename` header
