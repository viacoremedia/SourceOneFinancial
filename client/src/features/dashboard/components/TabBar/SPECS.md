# SPECS.md — TabBar Component

> Two-tab toggle: "Dealer Groups" and "Independent Dealers".

## Files

| File                 | Lines | Description              |
|----------------------|-------|--------------------------|
| `TabBar.tsx`         | ~35   | Main component           |
| `TabBar.module.css`  | ~30   | Scoped styles            |
| `index.ts`           | 1     | Barrel export            |

## Props

| Prop         | Type                              | Description                    |
|--------------|-----------------------------------|--------------------------------|
| `activeTab`  | `'groups' \| 'dealers'`           | Currently active tab           |
| `onTabChange`| `(tab: TabId) => void`            | Tab switch handler             |
| `groupCount` | `number?`                         | Badge count for groups tab     |
| `dealerCount`| `number?`                         | Badge count for dealers tab    |

## Description
Renders two tab buttons with optional count badges. Active tab gets a highlighted bottom border and teal text.
