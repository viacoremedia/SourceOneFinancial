# SPECS.md — Server Auth Routes

> Authentication endpoints for invite-only access system.
> JWT-based, role-scoped. Mounted at `/auth`.

## Endpoints

| Method | Path | Auth | Min Role | Description |
|--------|------|------|----------|-------------|
| `POST` | `/auth/login` | ❌ | — | Email + password → JWT (90d expiry) |
| `POST` | `/auth/accept-invite` | ❌ | — | Token + password + name → activate account + JWT |
| `GET` | `/auth/me` | ✅ | — | Return current user profile |
| `POST` | `/auth/change-password` | ✅ | — | Requires current + new password |
| `POST` | `/auth/invite` | ✅ | admin | Send invite email, create user with status=invited |
| `GET` | `/auth/users` | ✅ | admin | List all users (no passwordHash/inviteToken) |
| `DELETE` | `/auth/users/:id` | ✅ | admin | Remove user (role-scoped: can only remove below own level) |

## Role Hierarchy

| Role | Level | Can Invite | Can Remove |
|------|-------|------------|------------|
| `employee` | 0 | ❌ | ❌ |
| `admin` | 1 | employees | employees |
| `super_admin` | 2 | employees + admins | employees + admins |

## Files

| File | Purpose |
|------|---------|
| `routes/auth/index.js` | Express router with all auth endpoints |
| `middleware/authMiddleware.js` | `requireAuth` (JWT verify) + `requireRole(minRole)` |
| `services/emailService.js` | Nodemailer transport (Gmail SMTP), `sendInviteEmail()` |
| `models/User.js` | User schema: email, passwordHash, name, role, status, inviteToken |
| `scripts/seedAdmin.js` | One-time super_admin account creation |
| `scripts/reassignOrphans.js` | Reassign orphaned dealers to correct groups |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | Yes | Secret for signing JWTs |
| `SMTP_USER` | Yes | Gmail address for sending invites |
| `PASSWORD` | Yes | Gmail app password for SMTP |
| `CLIENT_URL` | No | Frontend URL for invite links (default: `http://localhost:5173`) |
