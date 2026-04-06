# SPECS.md — Client

> Frontend for Source One Dealer Performance Analytics.
> Vite + React (TypeScript).

## Directory Structure

| Path                | Purpose                                        |
|---------------------|-------------------------------------------------|
| `src/core/`         | Shared components, hooks, services, styles      |
| `src/features/`     | Feature-sliced modules                          |
| `src/App.tsx`       | Root component (renders Dashboard)              |
| `src/main.tsx`      | Vite entry point                                |
| `vite.config.ts`    | Vite configuration                              |

## Environment Variables

| Variable       | Description            | Example                    |
|----------------|------------------------|----------------------------|
| `VITE_API_URL` | Backend API base URL   | `http://localhost:3001`    |

## Build & Dev

```bash
npm run dev      # Start dev server (port 5173)
npm run build    # Production build → dist/
npm run preview  # Preview production build
```
