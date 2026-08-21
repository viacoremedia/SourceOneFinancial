# SPECS.md — Auth Feature

> Invite-only authentication system for Source One Analytics.
> JWT in localStorage, role-based access control, Nodemailer invites.

## Components

### `LoginPage.tsx`
Email + password login form. Dark-themed, matches dashboard aesthetic.
- On success → stores JWT + user in localStorage, redirects to `/`
- On error → shows inline error message
- Includes "Forgot password?" link to `/forgot-password` and password visibility toggle

### `ForgotPasswordPage.tsx`
Self-service password recovery requested at `/forgot-password`.
- User enters email address
- On submit → calls POST `/auth/forgot-password`
- Shows success confirmation card instructing user to check their email

### `ResetPasswordPage.tsx`
Secure password reset form reached via `/reset-password?token=xxx`.
- Validates token on mount via GET `/auth/verify-reset-token`
- Inputs for new password and confirm password with length + match validation
- On success → updates password, receives JWT, and auto-logs in redirecting to dashboard
- If expired/invalid → displays clear guidance and a button to request a new link

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
