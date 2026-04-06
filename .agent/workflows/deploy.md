---
description: Deployment checklist for staging and production releases
---

# Deployment Workflow

Follow these steps for every deployment. Do NOT skip steps — each one exists
because something has gone wrong in the past.

## Pre-Deployment

### 1. Build Verification
// turbo
- Run the full build:
  - SaaS (client): `npm run build` in `client/` — confirm zero TypeScript errors
  - SaaS (server): verify server starts without errors
  - Web: run build tool if applicable, verify output
  - WordPress: verify theme activates without errors

### 2. Environment Variables
- [ ] Check if any new env vars were added in this release
- [ ] Verify they are set in the deployment platform (Vercel, hosting panel, etc.)
- [ ] Update `docs/getting-started.md` with any new env vars
- [ ] Verify `ISOLATED_MODE` is NOT set in production/staging

### 3. Database Migrations
- [ ] Check if any schema changes require migration scripts
- [ ] Run migrations on staging first
- [ ] Verify data integrity after migration

### 4. Spec Compliance
- [ ] All features in this release have completed specs in `specs/`
- [ ] Implementation matches spec requirements
- [ ] Documentation is updated (team-standards Rule 4)

### 4.1 Documentation Sync (Auto-Draft)

**Don't write the docs from scratch. Let the AI draft them, then you verify.**

1. Ask Antigravity to review all changes in this release and generate a draft
   update for each affected doc file (see team-standards Rule 4 for the mapping)
2. Review the AI-generated draft — fix any inaccuracies
3. Commit the doc updates as part of the release

> **Why here, not later?** Once the code is deployed and the client is happy,
> doc motivation drops to zero. Doing it pre-deploy means it ships with the feature.

## Staging Deployment

### 5. Web Server Backup (Web/WordPress Projects Only)

Before pushing to any live or staging server, create a dated backup:
```
/project/backup/YYYY-MM-DD/    ← Code-only backup (no node_modules, vendor, uploads)
```

- Back up only the source code — exclude dependencies and user uploads
- Verify the backup is complete before proceeding
- Keep at least 3 recent backups for rollback capability

> **SaaS projects on Vercel:** Skip this step — Vercel maintains deployment
> history with instant rollback built in.

### 6. Deploy to Staging
- Push to staging branch or deploy via platform CI/CD
- Wait for deployment to complete successfully

### 6. Staging Smoke Test
- [ ] Core user flows work end-to-end
- [ ] Auth: login, logout, role-based access
- [ ] Primary CRUD operations
- [ ] External integrations (if testable in staging):
  - SaaS: CRM sync, email sending, report generation
  - Web: forms, contact submissions, payment flows
- [ ] Responsive: check on mobile and tablet viewports
- [ ] Check browser console for errors

### 7. Staging Sign-Off
- Get verbal or written sign-off before proceeding to production
- If issues found → fix, re-deploy to staging, and re-test

## Production Deployment

### 8. Deploy to Production
- Merge to main branch or trigger production deploy
- Monitor deployment logs for errors

### 9. Production Verification
- [ ] Site is accessible and loads correctly
- [ ] All smoke test items from Step 6 pass in production
- [ ] For SaaS: verify cron jobs are running
- [ ] For SaaS: verify webhook endpoints are reachable
- [ ] Monitor error logs for 15 minutes post-deploy

### 10. Rollback Plan
If critical issues are found:
1. Revert to previous deployment via platform (Vercel: instant rollback)
2. Document what went wrong
3. Fix in development, re-run this entire workflow

## Post-Deployment

### 11. Update Records
- [ ] Update project changelog or release notes
- [ ] Notify team of successful deployment
- [ ] Close related spec tasks / issues
