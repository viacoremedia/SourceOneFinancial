---
description: Onboard an existing or legacy codebase into the structured framework — create reverse specs, constitution, and documentation
---

# Legacy Onboard Workflow

This workflow bootstraps structure for an existing project that wasn't built
with specs, constitutions, or the agent framework. It's designed to be
incremental — you don't have to spec everything on day one.

## 1. Project Scan

Analyze the project structure to understand what exists:

// turbo
1. List top-level directories and key files
2. Identify the tech stack:
   - Languages, frameworks, libraries (check `package.json`, `requirements.txt`, `composer.json`, etc.)
   - Database (check config files, connection strings, schemas)
   - Deployment target (check `vercel.json`, `Dockerfile`, `.github/workflows/`, etc.)
3. Map the architecture:
   - Frontend: what framework, how is state managed, how are API calls made?
   - Backend: how are routes organized, is there a service layer, what middleware exists?
   - Data: what models/schemas exist, what are the relationships?

## 2. Create Architecture Document

Write `docs/architecture-overview.md` with:
- System overview (one paragraph)
- Tech stack summary
- Directory structure with explanations
- Data flow diagram (if applicable)
- Key integrations and external dependencies
- Known constraints (deployment limits, vendor lock-in, etc.)

## 3. Create the Constitution

**This is the most critical step.** A project CANNOT have structured development
without a constitution. Use `/speckit.constitution` or manually create
`.specify/memory/constitution.md`.

The constitution MUST include:
- Core principles (spec-driven, architecture binding, documentation currency)
- The tech stack and constraints you discovered in Step 1
- Code organization patterns that ALREADY EXIST in the project
- Security rules relevant to the project
- Development workflow steps
- Version: start at `0.1.0` (indicating it's a first pass)

**IMPORTANT:** The constitution should document what IS, not what you wish
the project looked like. This is a reverse-engineering exercise.

### 3.1 Code Evidence Requirement

Every principle or pattern documented in the reverse constitution MUST cite
at least **3 code evidence snippets** from the actual codebase. This prevents
hallucinating a clean architecture that doesn't exist.

For example:
```markdown
### Service Layer Pattern
This project uses a service layer for external API calls.

**Evidence:**
1. `server/services/ghlService.js:L12-L45` — GoHighLevel API client
2. `server/services/emailService.js:L8-L30` — SMTP wrapper
3. `server/routes/leads/index.js:L22` — Route calls `ghlService.getContacts()`
```

If you cannot find 3 code examples supporting a principle, it's either:
- Not actually a pattern (remove it from the constitution)
- Only partially adopted (note it as "inconsistent" and flag for clean-up)

## 4. Set Up Agent Framework

Create the `.agent/` directory with:
1. Copy `rules/team-standards.md` from the shared template
2. Copy the appropriate domain rules:
   - `rules/saas.md` for MERN/Python projects
   - `rules/web.md` for Web/WordPress projects
3. Copy relevant workflows from the shared template
4. Copy relevant skills from the shared template

## 5. Set Up Spec Kit

1. Create `.specify/` directory with templates:
   - Copy `.specify/templates/` from an existing project or run `specify init .`
   - Place the constitution from Step 3 in `.specify/memory/constitution.md`
2. Create `specs/` directory for future feature specs

## 6. Create Developer Documentation

Create the `docs/` directory with at minimum:
- `architecture-overview.md` (from Step 2)
- `getting-started.md` — how to set up the project locally
- `contributing.md` — branching strategy, commit conventions, PR process

Additional docs as applicable:
- `backend-guide.md` — API patterns, route organization, service layer
- `frontend-guide.md` — component patterns, state management, styling
- `deployment.md` — how to deploy, env vars, rollback process

## 7. Identify Existing Features (Reverse Specs)

You don't need to spec everything, but catalogue what exists:

1. List the major features/modules in the system
2. For each, create a minimal "reverse spec" in `specs/`:
   ```
   specs/
   ├── 001-existing-auth/
   │   └── spec.md        ← Documents current auth behavior
   ├── 002-existing-crm/
   │   └── spec.md        ← Documents current CRM behavior
   └── ...
   ```
3. Each reverse spec should have:
   - Feature name and brief description
   - What the feature does (observed behavior)
   - Known limitations or issues
   - "REVERSE SPEC" label to distinguish from forward specs

**DO NOT try to spec everything in one pass.** Focus on the 3–5 most critical
features. Remaining features get specced as they're touched.

## 8. Document Known Issues and Pitfalls

Create a `docs/known-issues.md` or add to the constitution:
- Undocumented assumptions
- Known bugs or tech debt
- Configuration gotchas
- Areas lacking test coverage

## 9. First Commit

Commit all framework files:
```
chore: onboard project into structured development framework

- Added .agent/ (rules, workflows, skills)
- Added .specify/ (constitution, templates)
- Created docs/ (architecture, getting-started, contributing)
- Created reverse specs for existing features
```

## 10. Incremental Adoption

From this point forward:
- All NEW feature work follows `/specify` → `/plan` → etc.
- When MODIFYING existing features, create a spec for the feature first
- Gradually fill in reverse specs as features are touched
- Update the constitution as patterns solidify (bump version)
