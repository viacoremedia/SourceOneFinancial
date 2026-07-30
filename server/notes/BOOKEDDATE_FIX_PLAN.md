# Fix: Use `bookedDate` for Booking Metrics

> **Status**: PENDING — waiting for Tuesday call with Joseph (Aug 5, 2pm EST)  
> **Created**: Jul 30, 2026  
> **Impact**: $37M → $65M network volume (closes $27M of the $83M gap)

## Problem

Dashboard filters ALL metrics by `applicationDate`, but booked volume should be filtered by `bookedDate`. This misses 565 deals ($27.4M) that were applied for in prior months but booked in July.

### Verified Numbers (Jul 30)

| Approach | Deals | Volume |
|---|---|---|
| Current dashboard (applicationDate) | 837 | $37.48M |
| By bookedDate | 1,402 | $64.91M |
| Joseph's OMNI | — | $83M |

Remaining ~$18M gap is likely data freshness (batch import lag vs OMNI real-time).

## Root Cause

`server/services/dealerStatsService.js` line 67:
```javascript
match.applicationDate = {};  // Should use bookedDate for booked metrics
```

## Proposed Fix: Dual-Pipeline Architecture

Split `getDealerStatsMap()` into two pipelines:
- **Pipeline 1** (applicationDate): `apps`, `approvals`, `inHouse`
- **Pipeline 2** (bookedDate): `booked`, `bookedDollars`

Merge into same output shape → zero API/frontend changes.

## Files to Modify (4 total)

1. **`server/services/dealerStatsService.js`** — Core fix: dual pipeline
2. **`server/services/rollingAverages.js` (L580-617)** — Independent aggregation uses applicationDate
3. **`server/routes/analytics/index.js` (L2247-2263)** — Dealer360 overview inline aggregation
4. **`server/routes/analytics/index.js` (L2427-2434)** — Dealer360 sparkline buckets by applicationDate

### No Change Needed
- `communicationImpactService.js` — already uses bookedDate correctly
- All route consumers of `getDealerStatsMap` / `getNetworkAggregateStats` — auto-fixed by service change
- All frontend components — API contract unchanged

## Consumers Auto-Fixed (8 routes)

- `GET /executive-summary` (banner KPIs, MTD/YTD pacing, monthly trend)
- `GET /groups/:slug` (group detail)
- `GET /groups` (group list)
- `GET /dealers` (dealer table, both sort paths)
- `GET /dealer-stats` (standalone API)

## Questions for Joseph (Tuesday call)
- How far behind is our latest ingestion vs OMNI real-time?
- Does OMNI "$83M" include non-"Booked" status deals?
- Is their dollar field `amountFinanced` or something else?

## Rep Breakdown (bookedDate July)

| Rep | Deals | Volume |
|-----|-------|--------|
| jsmith | 289 | $12.54M |
| gott | 249 | $12.14M |
| S1House | 169 | $9.01M |
| jweller | 167 | $7.31M |
| jharrington1 | 197 | $7.20M |
| dzilberchtein | 82 | $3.91M |
| wstoutimore | 62 | $3.66M |
| ljablonoski | 33 | $2.59M |
| gcoulombe | 65 | $2.35M |
| jrubi | 38 | $1.81M |
| pcarter | 32 | $1.47M |
| edominguez | 19 | $0.91M |
| **TOTAL** | **1,402** | **$64.91M** |

S1House IS included in network totals — not excluded.
Zero orphan deals, zero null amountFinanced values.
