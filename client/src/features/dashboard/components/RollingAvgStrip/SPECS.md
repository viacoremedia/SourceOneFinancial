# SPECS.md — RollingAvgStrip

> Compact data ticker showing 5 core rolling averages with deltas and churn flow.

## Component: `RollingAvgStrip.tsx`

### Props
| Prop             | Type                           | Description                           |
|------------------|--------------------------------|---------------------------------------|
| `data`           | `NetworkRollingAvgResponse \| null` | Rolling avg data from hook       |
| `isLoading`      | `boolean`                      | Shows skeleton when true              |
| `windowSize`     | `RollingWindow` (7 \| 30)      | Current window selection              |
| `onWindowChange` | `(w: RollingWindow) => void`   | Toggle handler                        |

### Metrics Displayed
1. Avg App Days
2. Avg Approval Days
3. Avg Booking Days
4. Avg Contact Days
5. Visit Response Days

Each metric shows: value (heatmap-colored) + period-over-period delta badge.

### Churn Summary (right side)
- Gained/day (green)
- Lost/day (red)
- Net delta (directional color)

### States
- **Loading**: Skeleton shimmer animation
- **Insufficient data**: "Need ≥2 report dates" message
- **Normal**: Full metric display

### Data Source
`GET /analytics/rolling-averages?window=7|30&states=TX,FL`

## Files

| File                        | Description                  |
|-----------------------------|------------------------------|
| `RollingAvgStrip.tsx`       | Main strip component         |
| `RollingAvgStrip.module.css`| Glassmorphic strip styles    |
| `index.ts`                  | Barrel export                |
