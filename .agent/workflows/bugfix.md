---
description: Structured workflow for diagnosing and fixing bugs with spec traceability
---

# Bug Fix Workflow

Follow these steps to diagnose, fix, and document a bug.

## Fast-Track Path (Cosmetic / Non-Functional Fixes)

If the issue is **purely cosmetic** (CSS, typos, formatting, copy) and does
NOT touch business logic, data models, or API routes:

1. Fix the issue
2. Verify visually — check responsive, check affected pages
3. Commit with `style:` or `chore:` prefix:
   ```
   style(<scope>): <what was fixed>
   ```
4. Done — skip the remaining steps below

> **⚠️ Gut check:** If at any point you realize the fix touches behavior,
> data flow, or auth — STOP. Use the full workflow below.

---

## Full Workflow (Behavioral / Functional Bugs)

## 1. Document the Bug

**Immediately** create or update a bug report:

1. **Create a GitHub Issue** — this is the official tracking record. Include:
   - **Title**: Clear, specific description of the problem
   - **Severity label**: `critical` / `urgent` / `not-urgent`
   - **Reproduction steps**: Exact steps to trigger the bug
   - **Expected behavior**: What should happen
   - **Actual behavior**: What actually happens
   - **Environment**: Browser, OS, dev/staging/production
2. **Notify the team** — post in the team channel with the Issue link
3. Assign the Issue to yourself if you're picking it up

## 2. Check Existing Specs

Before diving into code:
1. Search `specs/` for the feature this bug relates to
2. Read the spec — does the current behavior violate what was specified?
3. If yes, the fix MUST restore spec-compliant behavior
4. If the spec is ambiguous or missing the case, note this for Step 6

## 3. Check Known Pitfalls

Review the project's known pitfalls and gotchas:
- Check the project's Antigravity knowledge base for documented patterns
- For MERN projects: check enum validation mismatches, silent schema failures,
  React Query invalidation gaps, cascading deletion requirements
- For Web projects: check browser compatibility edge cases, WordPress hook priority issues

## 4. Root Cause Analysis

1. Reproduce the bug locally (use `ISOLATED_MODE=true` for SaaS projects)
2. Identify the root cause — not just the symptom
3. Document the root cause clearly before writing any fix

## 5. Implement the Fix

1. Write the fix — keep it minimal and focused
2. Add a regression test if a test suite exists
3. Verify the fix resolves the bug
4. Verify the fix doesn't break other functionality:
   - For SaaS: run `npm run build` in `client/`, smoke test related features
   - For Web: test across target browsers, check responsive behavior

## 6. Update Specs (If Needed)

If the bug revealed:
- A **spec gap** → update the spec to cover the missing case
- An **undocumented assumption** → add it to the spec's assumptions section
- A **new pitfall** → document it for team knowledge

## 7. Commit

```
fix(<scope>): <description of what was fixed>

Root cause: <brief explanation>
Refs: specs/<NNN-feature> (if applicable)
```

Update `docs/` if the fix changes any documented behavior (team-standards Rule 4).
