---
name: React Frontend Patterns
description: React 18, shadcn/ui, TanStack Query, Zustand, and Tailwind CSS patterns for SaaS dashboards and admin panels
---

# React Frontend Skill

Production-tested React patterns for SaaS applications with complex dashboards,
data-heavy views, and role-based UIs.

## Architecture Overview

```
client/src/
├── components/
│   ├── ui/              ← shadcn/ui primitives (Button, Dialog, Card, etc.)
│   ├── dashboard/       ← Dashboard-specific composites
│   ├── shared/          ← Cross-page reusable components
│   └── <feature>/       ← Feature-specific components
├── hooks/               ← TanStack Query hooks (one per API domain)
├── lib/                 ← Utilities (api.ts, utils.ts, permissions.ts)
├── pages/               ← One file per route
├── stores/              ← Zustand stores (client state only)
├── types/               ← TypeScript type definitions
└── contexts/            ← React contexts (Auth, MobileNav)
```

## State Management Strategy

### Server State → TanStack Query v5
ALL data that comes from the API uses TanStack Query.

```typescript
// hooks/use-leads.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '@/lib/api';

// Query key factory for consistent invalidation
export const leadKeys = {
  all: ['leads'] as const,
  lists: () => [...leadKeys.all, 'list'] as const,
  detail: (id: string) => [...leadKeys.all, 'detail', id] as const,
  pipeline: (stage: string) => [...leadKeys.all, 'pipeline', stage] as const,
};

export function useLeads(filters?: LeadFilters) {
  return useQuery({
    queryKey: leadKeys.lists(),
    queryFn: () => apiService.get('/api/leads', { params: filters }),
  });
}

export function useUpdateLeadStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiService.put(`/api/leads/${id}/status`, { status }),
    onSuccess: () => {
      // CRITICAL: invalidate ALL lead queries, not just specific ones.
      // Status changes can move leads between pipelines.
      queryClient.invalidateQueries({ queryKey: leadKeys.all });
    },
  });
}
```

### Client State → Zustand
For purely client-side UI state (sidebar open/closed, active tab, etc.):

```typescript
// stores/uiStore.ts
import { create } from 'zustand';

interface UIStore {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));
```

### Golden Rules
- UI components NEVER mutate data directly (Constitution Principle I)
- Server data → TanStack Query. Client UI state → Zustand.
- Never store server data in Zustand — it will go stale.

## API Service Layer

Centralized API client that handles auth, errors, and token management:

```typescript
// lib/api.ts
import axios from 'axios';

const apiService = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

// Attach JWT to every request
apiService.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 — clear token, redirect to login
apiService.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    throw error;
  }
);

export { apiService };
```

## Component Patterns

### shadcn/ui + Radix UI
Use shadcn/ui components as the base layer. They wrap Radix UI primitives
with Tailwind styling.

```tsx
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
```

### Composite Components
Build domain-specific components from shadcn primitives:

```tsx
// components/shared/UnifiedLeadCard.tsx
interface UnifiedLeadCardProps {
  lead: EnrichedLead;
  onStatusChange: (status: string) => void;
}

export function UnifiedLeadCard({ lead, onStatusChange }: UnifiedLeadCardProps) {
  // High-urgency visual indicators, inline actions, responsive layout
}
```

### Page Structure
```tsx
// pages/Dashboard.tsx
export default function Dashboard() {
  const { data: stats, isLoading } = useDashboardStats();
  const { user } = useAuth();

  if (isLoading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6 p-6">
      <HeroBanner stats={stats} user={user} />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <MetricCard title="Open Leads" value={stats.openLeads} />
        {/* ... */}
      </div>
    </div>
  );
}
```

## Responsive Design

### Single Layout Philosophy
One responsive layout — do NOT create separate mobile pages.
The old `pages/mobile/` approach was decommissioned.

```tsx
// Use Tailwind responsive classes
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* Cards stack on mobile, grid on desktop */}
</div>
```

### Mobile UX Patterns
- **Two-step selection**: "Pick then confirm" for status updates in drawers
- All primary actions MUST fit within the mobile viewport without scrolling
- Touch targets: minimum 44px × 44px
- Use Sheet/Drawer components for mobile-friendly modals

## Animation

Use Framer Motion for transitions and micro-animations:

```tsx
import { motion, AnimatePresence } from 'framer-motion';

<AnimatePresence>
  {isVisible && (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      {/* Content */}
    </motion.div>
  )}
</AnimatePresence>
```

## RBAC / Permissions

Frontend permissions MUST mirror backend roles:

```typescript
// lib/permissions.ts
const pagePermissions: Record<string, UserRole[]> = {
  '/dashboard': ['admin', 'manager', 'pm'],
  '/admin': ['admin'],
  '/reports': ['admin', 'manager', 'accountant'],
  // ...
};

export function canAccessPage(role: UserRole, path: string): boolean {
  return pagePermissions[path]?.includes(role) ?? false;
}
```

## Common Pitfalls

1. **React Query invalidation scope** — When a status change moves an entity
   between views (e.g., Open Pipeline → Jobs Pipeline), you MUST invalidate
   `keys.all`, not just specific sub-keys. Otherwise the entity "disappears"
   until a manual page refresh.

2. **Optimistic updates vs invalidation** — Prefer `invalidateQueries` over
   optimistic updates for complex state transitions. Optimistic updates can
   leave stale data if the backend shape differs from what you predicted.

3. **Skeleton loading states** — Always provide skeleton UI during loading.
   Never show a blank page or a spinner without context.
