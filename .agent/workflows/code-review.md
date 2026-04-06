---
description: Code review checklist for pull requests — ensures spec compliance, security, and quality
---

# Code Review Workflow

Use this checklist when reviewing a PR or preparing your own PR for review.

## 1. Spec Compliance

- [ ] Does the PR reference a spec in `specs/`? (required for all feature work)
- [ ] Does the implementation match the spec's functional requirements?
- [ ] Are all acceptance criteria from the spec satisfied?
- [ ] If the PR deviates from the spec, is the deviation documented and justified?

### 1.1 Style Commit Sentinel

If the commit uses `style:` or `chore:` prefix (Quick-Fix Exception, Rule 2.1):
- [ ] Verify that **zero** logical operators (`&&`, `||`, `? :`), state variables,
  or conditionals were modified in the change
- [ ] Verify no data models, API routes, or auth logic were touched
- [ ] If any of the above were modified → **reject** the Quick-Fix status and
  require a proper spec reference

## 2. Constitution Check

- [ ] Does the project have a ratified constitution? If not, stop — create one first.
- [ ] Does the change comply with all constitutional principles?
- [ ] Specifically check:
  - Architecture boundaries (client vs server responsibilities)
  - Service layer enforcement (no direct external API calls in routes)
  - RBAC parity (frontend permissions match backend authorization)

## 3. Domain Rules

### For SaaS projects (check against saas.md):
- [ ] Routes follow folder-per-feature pattern
- [ ] Auth middleware applied at router level
- [ ] Business logic in services, not route handlers
- [ ] Mongoose schemas have explicit enum validation
- [ ] Frontend uses hook-based API layer (not direct fetch calls)
- [ ] React Query invalidation covers all affected views

### For Web projects (check against web.md):
- [ ] WCAG 2.1 AA accessibility met
- [ ] Core Web Vitals targets met
- [ ] SEO requirements satisfied
- [ ] WordPress coding standards followed (if WP project)
- [ ] Responsive design works at all breakpoints

## 4. Security

- [ ] No hardcoded secrets, API keys, or credentials
- [ ] All new routes have appropriate auth middleware
- [ ] User input is validated and sanitized
- [ ] Error responses don't leak internal details
- [ ] For SaaS: `ISOLATED_MODE` guard on new external service calls
- [ ] For Web/PHP: prepared statements for all DB queries, output escaped

## 5. Performance

- [ ] No N+1 query patterns
- [ ] No unnecessary re-renders (check React component dependencies)
- [ ] Heavy operations are properly async/deferred
- [ ] Caching used where appropriate
- [ ] Images optimized (Web projects)

## 6. Type Safety

- [ ] No `any` types (TypeScript projects)
- [ ] New types defined in `src/types/` or equivalent
- [ ] API response types match backend shapes

## 7. Documentation (Rule 4)

- [ ] `docs/` updated if the change affects documented areas
- [ ] README updated if new top-level features added
- [ ] Inline code comments for non-obvious logic
- [ ] Spec updated if the implementation revealed spec gaps

## 8. Testing

- [ ] Build passes (`npm run build` / equivalent)
- [ ] Tests pass (if test suite exists)
- [ ] Manual smoke test completed for UI changes
- [ ] Edge cases considered and handled

## Approval

A PR is ready to merge when ALL applicable checklist items pass.
If any item fails, document the issue and request changes.
