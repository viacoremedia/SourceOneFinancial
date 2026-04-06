---
name: Client Handoff Patterns
description: Patterns for project documentation, admin guides, training materials, and support handoff to clients or new team members
---

# Client Handoff Skill

Patterns for creating documentation that enables smooth project handoff to
clients, support teams, or new developers.

## Project Documentation Package

Every project handoff should include:

```
docs/
├── architecture-overview.md    ← System design and data flow
├── getting-started.md          ← Dev environment setup
├── admin-guide.md              ← For client administrators
├── deployment.md               ← How to deploy and rollback
├── contributing.md             ← For future developers
└── known-issues.md             ← Outstanding bugs and tech debt
```

## Admin Guide Template

For client stakeholders who manage the system:

```markdown
# [Project Name] — Admin Guide

## Overview
What the system does, in plain language.

## Accessing the System
- URL: [production URL]
- Login: [how to log in]
- Roles: [what each role can do]

## Common Tasks

### [Task 1: e.g., Managing Users]
Step-by-step with screenshots.

### [Task 2: e.g., Generating Reports]
Step-by-step with screenshots.

## FAQ

### [Common question 1]
Answer.

### [Common question 2]
Answer.

## Support
- Primary contact: [name and email]
- Response time: [SLA details]
- Escalation: [when and how to escalate]
```

## Developer Handoff Checklist

When handing a project to a new developer or team:

### Access & Credentials
- [ ] Repository access granted
- [ ] Deployment platform access (Vercel, hosting, etc.)
- [ ] Database access (Atlas, phpMyAdmin, etc.)
- [ ] Third-party API credentials documented (not shared in chat)
- [ ] Domain registrar access (if applicable)
- [ ] Email/SMTP service access (if applicable)

### Documentation
- [ ] Architecture overview is current
- [ ] Getting-started guide is tested (follow it on a fresh machine)
- [ ] All environment variables documented
- [ ] Deployment process documented
- [ ] Known issues and tech debt documented

### Knowledge Transfer
- [ ] Walkthrough of codebase structure
- [ ] Explanation of key architectural decisions
- [ ] Tour of the spec/constitution system
- [ ] Overview of external integrations and their quirks
- [ ] Handoff of any tribal knowledge (gotchas, workarounds)

### Support Transition
- [ ] Define support period (e.g., 30 days post-handoff)
- [ ] Establish communication channel
- [ ] Document escalation process

## Training Materials Template

```markdown
# [Feature Name] — Training Guide

## Who This Is For
[Role: admin, project manager, sales team, etc.]

## What You'll Learn
- [Skill 1]
- [Skill 2]

## Step-by-Step Instructions

### Step 1: [Action]
[Description with screenshot]

### Step 2: [Action]
[Description with screenshot]

## Tips & Best Practices
- [Tip 1]
- [Tip 2]

## Troubleshooting
| Problem | Solution |
|---------|----------|
| [Issue 1] | [Fix 1] |
| [Issue 2] | [Fix 2] |
```

## Maintenance Handoff

For ongoing support after project completion:

### SLA Template
```markdown
# Support & Maintenance Agreement

## Scope
- Bug fixes for existing functionality
- Security patches
- Minor content updates

## Not Included
- New feature development
- Design changes
- Third-party API changes (cost handled separately)

## Response Times
| Severity | Response | Resolution |
|----------|----------|------------|
| Critical (site down) | 2 hours | 24 hours |
| High (feature broken) | 4 hours | 48 hours |
| Medium (cosmetic) | 24 hours | 1 week |
| Low (enhancement) | 48 hours | Next sprint |

## Billing
- Retainer: [X hours/month]
- Overage: [$/hour]
```
