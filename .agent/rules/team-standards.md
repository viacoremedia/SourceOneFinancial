# Team Development Standards

These rules apply to **every project** and **every developer** on the team.
They are non-negotiable guardrails for quality, security, and consistency.

## 1. Constitution Required

Every project MUST have a ratified constitution in `.specify/memory/constitution.md`
before any feature work begins. If a project is missing a constitution, development
MUST pause until one is created via `/speckit.constitution` or by adapting a starter
template from the shared framework.

A constitution MUST define, at minimum:
- Core development principles (spec-driven, architecture binding)
- Technology stack and constraints
- Code organization patterns
- Development workflow steps
- Security and data safety rules applicable to the project

## 2. Spec-Driven Development

Every change that introduces or modifies system behavior MUST be preceded by a
corresponding spec update, or an explicit justification explaining why a spec
change is unnecessary.

- Specs and architecture documents in the repository are the **canonical source of intent**.
- Generated code MUST align with these documents.
- Implementation tasks MUST reference the spec item(s) they fulfill.
- Chat-only decisions are NOT durable and are NOT binding.

### 2.1 The Quick-Fix Exception

For purely cosmetic or non-functional changes, a full spec is **not required**.
This includes: CSS tweaks, typo fixes, copy changes, formatting corrections,
dependency version bumps, and linting fixes.

**Requirements for quick-fixes:**
- The commit message MUST use `style:` or `chore:` type prefix.
- The change MUST NOT touch business logic, data models, API routes, or
  authentication/authorization code.
- If during the fix you discover the change DOES touch behavior, STOP —
  escalate to the full `/bugfix` or `/specify` workflow.

## 3. Architecture Is Binding

Documented architectural decisions may NOT be violated without:
1. Revising the architecture documentation first
2. Explicitly acknowledging the trade-off in the revision
3. Getting team review on the change

Architecture docs, specs, and rules MUST be stored as versioned, human-readable
Markdown files in the repository.

## 4. Documentation Currency

Developer documentation MUST be kept in sync with the codebase. A feature is NOT
complete until its documentation is current. After completing any feature that changes:

| Change Type | Docs to Update |
|---|---|
| New routes, models, or services | `docs/backend-guide.md` |
| New pages, hooks, or components | `docs/frontend-guide.md` |
| New integrations or data flows | `docs/architecture-overview.md` |
| New env vars or setup steps | `docs/getting-started.md` |
| Deployment or infra changes | `docs/deployment.md` |
| New conventions or rules | `docs/contributing.md` |

If a `docs/` directory does not exist, create it as part of the project constitution.

## 5. Security Baseline

- NEVER commit secrets, API keys, or credentials to the repository.
- `.env` files MUST be in `.gitignore` at BOTH root and subdirectory levels.
- For projects with live integrations (CRM, email, payment), use an `ISOLATED_MODE`
  environment flag to prevent accidental production mutations during development.
- All API routes serving sensitive data MUST have authentication middleware applied.
- Error responses MUST NOT leak stack traces or internal details in production.

## 6. Git Standards

### Commit Messages
Use conventional commit format:
```
<type>(<scope>): <description>

[optional body]

Refs: specs/<NNN-feature-name>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

### Branching Strategy

Four protected tiers. Changes flow upward only:

```
Feature branches → Development → Staging → Main
```

| Branch | Purpose | Protected? |
|--------|---------|------------|
| `main` | Mirror of production. Always deployable. | ✅ PR-only |
| `staging` | Internal review and testing before production. | ✅ PR-only |
| `development` | Active integration of completed features. | ✅ PR-only |
| `NNN-feature-name` | Individual feature or fix work. | ❌ |

**Rules:**
- Feature branches branch off from `development`.
- When merging `development` → `staging`, create a merge branch
  (e.g., `merge/staging-YYYY-MM-DD`) to resolve conflicts before the PR.
- No direct pushes to `main`, `staging`, or `development`.
- All integration into protected branches is done via Pull Requests.
- Communicate to the team when you push to any protected branch.

**Feature branch naming:**
- Features: `NNN-feature-short-name` (matches spec number)
- Bug fixes: `fix/short-description`

## 7. Error Handling

All API error responses MUST follow a standardized format:
```json
{
  "success": false,
  "message": "Human-readable error description"
}
```

HTTP status codes MUST be used correctly:
| Code | Usage |
|------|-------|
| 200 | Success |
| 201 | Created |
| 400 | Bad request / validation failure |
| 401 | Unauthorized (no/invalid token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Resource not found |
| 409 | Conflict (duplicate, state mismatch) |
| 500 | Internal server error |

## 8. Type Safety

- TypeScript projects: NO `any` type. Define types in a dedicated types directory.
- JavaScript projects: Use JSDoc annotations for function signatures.
- Mongoose schemas MUST have explicit validation on enum fields.

## 9. Code Review Required

No code merges to main without review. To prevent bottlenecks on a small team,
reviews are **tiered by change type**:

| Change Type | Review Required |
|-------------|----------------|
| Feature work (has a spec) | Full peer review via `/code-review` |
| Bug fixes (behavioral) | Peer review — reviewer can focus on the fix scope |
| Quick-fixes (`style:` / `chore:`) | AI-verified review + human thumbs-up |

**AI-Verified Review** (for quick-fixes only): Antigravity runs the
`/code-review` checklist. If it passes (especially the Style Commit Sentinel),
a team member gives a quick "looks good" without a line-by-line audit.

A PR is ready for any level of review when:
1. It references the spec item(s) it fulfills (feature work only)
2. Documentation has been updated per Rule 4
3. Tests pass (where a test suite exists)
4. It follows the domain rules (saas.md or web.md) applicable to the project

## 10. Rules Override Workflows

If a workflow, instruction, or request conflicts with these rules, these rules
take precedence. The only way to override a rule is to formally amend this
document with team consensus.
