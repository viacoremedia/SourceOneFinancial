---
name: Spec-Driven Development Methodology
description: How to write great specs, design constitutions, maintain living documents, and reverse-engineer specs for legacy codebases
---

# Spec-Driven Development Skill

This skill provides methodology knowledge for spec-driven development. It
complements the development workflows (`/specify`, `/plan`, etc.)
with the "how" and "why" of writing effective specifications.

## What is a Spec?

A spec defines **WHAT** to build and **WHY**, never **HOW**. It is:
- Written for business stakeholders, not developers
- Technology-agnostic (no mention of frameworks, databases, or APIs)
- Testable and unambiguous
- The canonical source of intent for the feature

## Writing Great Specs

### The Spec Lifecycle
```
1. Specify  → Define what to build (what + why)
2. Clarify  → Resolve ambiguities (max 3 clarifications)
3. Plan     → Technical implementation (the "how")
4. Tasks    → Break into atomic, testable work items
5. Implement → Build it, task by task
6. Verify   → Confirm spec requirements are met
```

### Spec Template Structure
```markdown
# Feature Name

## Overview
One paragraph: what is this feature and why does it matter?

## User Scenarios
For each user type:
- As a [role], I want to [action] so that [outcome]
- Include primary flow, alternative flows, and error flows

## Functional Requirements
- FR-01: [Testable requirement]
- FR-02: [Testable requirement]

## Success Criteria
Measurable, technology-agnostic outcomes:
- "Users can complete checkout in under 3 minutes"
- "System supports 10,000 concurrent users"
- "95% of searches return results in under 1 second"

## Assumptions
Explicitly state what you're assuming.

## Out of Scope
Explicitly state what this feature does NOT include.
```

### Good vs Bad Specs

| Good (what + why) | Bad (how) |
|---|---|
| "Users see search results instantly" | "API responds in under 200ms" |
| "System handles 10K concurrent users" | "Redis cache hit rate above 80%" |
| "Admins can manage user roles" | "React component renders a role dropdown" |
| "Data is preserved when users leave" | "Zustand persist middleware saves to localStorage" |

### Handling Ambiguity
- Make informed guesses based on industry standards
- Document assumptions explicitly
- Use `[NEEDS CLARIFICATION: specific question]` sparingly (max 3 per spec)
- Prioritize: scope > security/privacy > UX > technical details

## Designing Constitutions

A constitution is the governance document for a project. It defines HOW
the team works, not WHAT they build.

### Constitution Checklist
Every constitution MUST include:
- [ ] Core development principles (spec-driven, architecture binding)
- [ ] Technology stack with versions and constraints
- [ ] Code organization patterns (directory structure, naming conventions)
- [ ] Service layer rules (what calls what)
- [ ] Security rules (auth, data safety, credential management)
- [ ] Development workflow steps (spec → plan → tasks → implement → verify)
- [ ] Documentation requirements (which docs exist, when to update)
- [ ] Governance rules (how to amend the constitution itself)
- [ ] Version number and ratification date

### Maturity Levels
- **v0.1.0** — First pass from legacy onboarding (reverse-engineered)
- **v1.0.0** — Ratified by team, all sections complete
- **v1.x.0** — Minor additions (new principles, expanded sections)
- **v2.0.0** — Major revision (principle removal/redefinition)

## Reverse Specs for Legacy Codebases

When onboarding an existing project that wasn't built with specs:

### Step 1: Catalogue Existing Features
```markdown
# Existing Feature Inventory

| # | Feature | Status | Has Spec? |
|---|---------|--------|-----------|
| 001 | User Authentication | Active | No → Create |
| 002 | Lead Management | Active | No → Create |
| 003 | Report Generation | Active | No → Create |
```

### Step 2: Write Reverse Specs
For each feature, document what CURRENTLY exists:
```markdown
# [REVERSE SPEC] User Authentication

## Overview
The system authenticates users via JWT tokens. [...]

## Current Behavior
- FR-01: Users log in with email and password
- FR-02: JWT token expires after 24 hours
- FR-03: Roles: admin, manager, pm, accountant, lead_intake

## Known Limitations
- No password reset flow exists
- No MFA support
- Token refresh is not implemented

## Label
REVERSE SPEC — documents existing behavior, not new work.
```

### Step 3: Incremental Adoption
- Spec new features from scratch (full spec lifecycle)
- Spec existing features WHEN you modify them (retroactive)
- Don't try to spec everything at once — that's a recipe for abandonment

## Maintaining Living Documents

Specs, constitutions, and architecture docs are LIVING documents:

1. **When behavior changes → update the spec**
   - If you fix a bug that reveals a spec gap, update the spec
   - If requirements change, update the spec BEFORE changing code

2. **When architecture changes → update the constitution**
   - New integration added? Update tech stack section
   - New convention established? Add it to code organization
   - Version bump the constitution

3. **When docs go stale → it's a bug**
   - Stale documentation is worse than no documentation
   - Documentation currency is enforced (team-standards Rule 4)
   - Treat doc updates as part of the feature, not a follow-up task
