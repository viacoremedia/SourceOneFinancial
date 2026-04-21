# SPECS.md — RepScorecard

> Bottom drawer showing all reps in a sortable comparison table.

## Component: `RepScorecard.tsx`

### Props
| Prop             | Type                       | Description                           |
|------------------|----------------------------|---------------------------------------|
| `open`           | `boolean`                  | Controls drawer visibility            |
| `onClose`        | `() => void`               | Closes the drawer                     |
| `windowSize`     | `RollingWindow` (7 \| 30)  | Rolling average window size           |
| `onWindowChange` | `(w: RollingWindow) => void` | Syncs window toggle with strip      |
| `onSelectRep`    | `(rep: string) => void`    | Fires when a rep row is clicked       |

### Behavior
- **Lazy loading**: Only fetches data when `open=true` (via `useRepScorecard` hook)
- **Sortable**: Click column headers to sort. Default sort: rep name asc.
- **Clickable rows**: Clicking a rep row fires `onSelectRep` and closes the drawer.
- **Heat Index column**: Shows colored dot + score (Phase 4). Capacity badges when applicable.
- **Capacity ratio**: Shown as `{ratio}x` next to rep name.

### Table Columns (left to right)
Heat Index | Rep | Dealers | Active | 30d | 60d | Long | Reactivated | Avg App | Avg Appr | Avg Bkd | Avg Contact | Visit Resp | Gained/d | Lost/d | Net

### Data Source
`GET /analytics/rep-scorecard?window=7|30`

## Files

| File                     | Description                       |
|--------------------------|-----------------------------------|
| `RepScorecard.tsx`       | Main drawer component             |
| `RepScorecard.module.css`| Bottom drawer styles + animations |
| `index.ts`               | Barrel export                     |
