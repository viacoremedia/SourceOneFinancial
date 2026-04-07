# SPECS.md — Auth Feature

> Invite-only authentication system for Source One Analytics.
> JWT in localStorage, role-based access control, Nodemailer invites.

## Components

### `LoginPage.tsx`
Email + password login form. Dark-themed, matches dashboard aesthetic.
- On success → stores JWT + user in localStorage, redirects to `/`
- On error → shows inline error message

### `AcceptInvitePage.tsx`
Invite acceptance page reached via `/invite?token=xxx`.
- Sets user's name and password
- On success → auto-login, redirect to dashboard
- On expired/invalid token → shows error

### `SettingsPanel.tsx`
Slide-out panel triggered by ⚙ gear icon in header.
- **All users**: Profile display, change password
- **Admins (admin+)**: Invite user form, user list, remove employees
- **Super admins**: Remove anyone, invite admins
- Delete action requires double confirmation (type email to confirm)

## Hooks

### `useAuth.tsx`
React context + provider for auth state.
- `login(email, password)` → POST /auth/login
- `logout()` → clear localStorage
- `acceptInvite(token, password, name)` → POST /auth/accept-invite
- Auto-validates token on mount via GET /auth/me
- Provides: `user`, `token`, `isLoading`

## Types

### `types.ts`
| Type | Fields |
|------|--------|
| `AuthUser` | `id`, `email`, `name`, `role`, `status`, `createdAt` |
| `AuthState` | `user`, `token`, `isLoading` |

## Styles

| File | Purpose |
|------|---------|
| `Auth.module.css` | Login + invite page styles |
| `Settings.module.css` | Settings panel + user management styles |
