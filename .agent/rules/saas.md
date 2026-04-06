# SaaS Project Rules (MERN / Python)

These rules apply to all SaaS projects built with the MERN stack (MongoDB, Express,
React, Node.js) and/or Python services. They supplement the team-standards.md rules.

## 1. Monorepo Structure

SaaS projects follow a consistent monorepo layout. No additional top-level project
directories may be added without amending the project constitution.

```
project-root/
├── client/          ← React/Vite/TypeScript frontend
├── server/          ← Node.js/Express backend
├── server-py/       ← Python services (if applicable)
├── specs/           ← Feature specifications (NNN-feature-name/)
├── docs/            ← Developer documentation
├── .agent/          ← Antigravity agent config
└── .specify/        ← Spec Kit memory and templates
```

## 2. Backend Architecture

### Route Organization
- **Folder-per-feature**: `server/routes/<feature>/index.js`
- Each route file defines an Express router
- Auth middleware MUST be applied at the router level: `router.use(auth)`
- For files with mixed public/protected endpoints, apply auth per-route instead

### Service Layer (Mandatory)
- ALL external API calls MUST go through `server/services/<name>Service.js`
- Route handlers MUST NOT call external APIs directly
- Services own: API communication, rate limiting, error handling, data transformation
- One service file per integration domain (e.g., `ghlService.js`, `emailService.js`)

### Models
- One Mongoose schema per file in `server/models/<ModelName>.js`
- Enum fields MUST have explicit validation — Mongoose silently drops invalid values
- Be aware of status enum differences between models (e.g., `BookedDesign` uses
  `'pending'`, NOT `'active'` as its initial state)
- Non-schema fields passed to `.create()` are silently ignored — always verify
  your payload matches the schema

### Middleware
- `server/middleware/auth.js` — JWT verification (token in Authorization header)
- `server/middleware/authorize.js` — Role-based access control
- Error middleware MUST return standardized `{ success, message }` JSON

### Cron & Automation
- Each automated job tracks: `status` (pending/processing/completed/failed),
  `errorReason`, `completedAt`
- Cron handlers MUST be idempotent
- Use Secret Headers for internal worker endpoints to prevent unauthorized triggers

## 3. Frontend Architecture

### State Management
- **Server state**: TanStack Query v5 (React Query)
  - One hook file per API domain: `hooks/use-<domain>.ts`
  - All API calls go through a centralized `apiService` (handles JWT, 401 redirects)
  - Use `queryClient.invalidateQueries({ queryKey: keys.all })` for state transitions
    that affect multiple views
- **Client state**: Zustand stores
  - Stores handle UI state only — NOT business logic
  - UI components MUST NOT mutate data directly; they call store actions

### Components
- Use shadcn/ui + Radix UI as the component primitive layer
- Tailwind CSS for styling — follow the project's design system
- Pages: one file per route in `pages/<PageName>.tsx`
- Shared components: organized under `components/` with primitives in `components/ui/`
- Framer Motion for transitions and micro-animations

### Responsive Design
- Single responsive layout — do NOT create separate mobile pages/routes
- Mobile-first approach with responsive breakpoints
- All user-facing features MUST work on desktop and tablet at minimum

### Type Safety
- TypeScript types in `src/types/` — one file per domain
- No `any` — use proper generics, unions, and type guards
- API response types MUST match backend response shapes

## 4. Python Services

### Script Architecture
- One script per task: `custom_timeframe_google.py`, `bing_ads.py`, etc.
- Scripts are invoked by Node.js via `child_process.spawn`
- Output: valid JSON to stdout for Node.js consumption
- Errors: to stderr with structured error messages
- Config: `google-ads.yml`, environment variables, credential files

### Node ↔ Python Integration
- Always wrap `JSON.parse()` of Python stdout in `try/catch`
- Log raw output on parse failure for debugging
- Implement multi-platform failover: if a secondary platform (Bing, Meta) fails,
  the primary report should still complete — log the `errorReason`
- Return partial results on individual platform failure

## 5. Deployment (Vercel)

- Serverless function timeouts: 10s (Hobby) / 60s (Pro) — design accordingly
- Heavy processing MUST be broken into smaller serverless functions or use workers
- Environment variables: managed through Vercel dashboard, documented in
  `docs/getting-started.md`
- `ISOLATED_MODE=true` MUST be set for local development
- `ISOLATED_MODE` MUST NOT be set in production/staging

## 6. Caching

- Use a Cache model with configurable TTLs (5–60 min depending on data type)
- Cache MUST be invalidated when underlying data changes
- All cache reads MUST have a fallback to live data
