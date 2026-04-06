# SPECS.md — StatsBar Component

> Header bar displaying high-level counts and latest report date.

## Files

| File                   | Lines | Description              |
|------------------------|-------|--------------------------|
| `StatsBar.tsx`         | ~60   | Main component           |
| `StatsBar.module.css`  | ~50   | Scoped styles            |
| `index.ts`             | 1     | Barrel export            |

## Props

| Prop          | Type      | Description                              |
|---------------|-----------|------------------------------------------|
| `groupCount`  | `number?` | Total dealer groups                      |
| `dealerCount` | `number?` | Total independent dealers                |

## Description
Displays the project title ("Source One — Dealer Analytics"), latest report date, and summary counts. Positioned in the page header area above filters.
