---
description: Initialize a new project with the full structured framework — constitution, specs, rules, skills, and documentation
---

# Project Initialization Workflow

Use this when starting a brand new project from scratch.

## 1. Choose Project Type

Determine the project type:
- **SaaS** — MERN stack, Python services, API-driven application
- **Web** — HTML/CSS/JS, PHP, WordPress, consumer-facing website
- **Hybrid** — Both (rare, but keep both domain rules)

## 2. Create Project Repository

// turbo
1. Create the project directory
2. Initialize Git: `git init`
3. Create `.gitignore` with appropriate entries:
   - SaaS: `node_modules/`, `.env`, `dist/`, `build/`
   - Web: `node_modules/`, `.env`, `dist/`, `vendor/` (PHP)
   - WordPress: `.env`, `wp-config-local.php`, `uploads/`

## 3. Copy Framework Files

From the shared template repository (cobalt-flare):

// turbo
1. Copy `.agent/rules/team-standards.md` (always)
2. Copy domain-specific rules:
   - SaaS: `.agent/rules/saas.md`
   - Web: `.agent/rules/web.md`
   - Hybrid: both
3. Copy all `.agent/workflows/` (all workflows are useful for all project types)
4. Copy relevant `.agent/skills/`:
   - SaaS: `mern-api/`, `react-frontend/`, `python-service/`, `node-python-bridge/`, `spec-methodology/`
   - Web: `wordpress-theme/`, `php-site/`, `responsive-web/`, `spec-methodology/`
   - All: `client-handoff/`

## 4. Initialize Spec Kit

// turbo
1. Run `specify init .` if the Spec Kit CLI is installed
   - OR manually create `.specify/` directory with templates from the shared template
2. Copy the starter constitution:
   - SaaS: `starters/saas-constitution.md` → `.specify/memory/constitution.md`
   - Web: `starters/web-constitution.md` → `.specify/memory/constitution.md`

## 5. Customize the Constitution

The starter constitution is a template — customize it for this specific project:

1. Update the project name and description
2. Adjust the technology stack section:
   - Add specific frameworks, libraries, versions
   - Add external integrations
   - Add deployment target details
3. Add project-specific constraints:
   - Performance requirements
   - Security requirements (PCI, HIPAA, etc.)
   - Client-specific conventions
4. Review all principles — remove any that don't apply, add any that are missing
5. Set version to `1.0.0` and ratification date
6. Run `/speckit.constitution` to validate and finalize

## 6. Create Documentation Structure

// turbo
Create the `docs/` directory with initial files:

### SaaS Projects:
- `docs/architecture-overview.md` — System architecture, data flow, integrations
- `docs/getting-started.md` — Local setup, env vars, running the dev server
- `docs/backend-guide.md` — Route patterns, service layer, models, middleware
- `docs/frontend-guide.md` — Component patterns, hooks, state management, styling
- `docs/deployment.md` — Vercel/hosting config, env var management, rollback
- `docs/contributing.md` — Branching, commits, PR process, code review expectations

### Web Projects:
- `docs/architecture-overview.md` — Site structure, CMS setup, integrations
- `docs/getting-started.md` — Local setup, WordPress install, theme activation
- `docs/development-guide.md` — Coding standards, file organization, asset pipeline
- `docs/deployment.md` — Hosting setup, FTP/SSH details, DNS configuration
- `docs/contributing.md` — Branching, commits, PR/review process
- `docs/content-guide.md` — How to manage content, custom post types, ACF fields

## 7. Create `specs/` Directory

// turbo
1. Create `specs/` directory
2. The first feature spec will be created via `/specify`

## 8. Create Initial README

Write `README.md` with:
- Project name and one-line description
- Tech stack summary
- Quick start instructions (link to `docs/getting-started.md`)
- Link to `docs/architecture-overview.md`
- Link to `docs/contributing.md`
- Team contacts / project owner

## 9. Initial Commit

```
chore: initialize project with structured development framework

- Set up .agent/ (rules, workflows, skills)
- Created .specify/ (constitution, templates)
- Created docs/ (architecture, getting-started, contributing)
- Ready for first feature spec via /specify
```

## 10. First Feature

You're ready! Start your first feature:
```
/specify <describe what you want to build>
```

This will create a numbered spec, branch, and start the structured workflow.
