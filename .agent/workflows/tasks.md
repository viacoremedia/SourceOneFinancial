---
description: Expand a Phase into detailed tasks with acceptance criteria — ready for GitHub Issues
---

# Tasks Workflow (Step 4 of 6)

You are now in TASKS mode — the fourth step of the structured development flow.

Follow the project constitution and team-standards at all times.

## What to Do

1. Take the current Phase from the SPEC PLAN
2. Expand every bullet into **clear, actionable tasks** with acceptance criteria
3. Keep total tasks per Phase between **3–6**
4. Output the updated checklist in markdown (ready for GitHub)
5. End with: **"Tasks ready. Run `/push-issues` to create GitHub Issues or `/implement` to start coding."**

## Rules

- Each task must be small enough to complete and verify independently
- Each task must have explicit acceptance criteria
- Include file paths where work will happen (using feature-sliced structure)
- Include doc/test update tasks — these are not optional
- Tasks should be ordered by dependency

## Output Format

```markdown
## Phase [X]: [Name] — Detailed Tasks

### Task 1: [Short title]
**Description:** [What to do]
**Files:** `server/src/features/[feature]/...` or `client/src/features/[feature]/...`
**Acceptance Criteria:**
- [ ] [Specific, testable criterion]
- [ ] [Specific, testable criterion]

### Task 2: [Short title]
...

### Task N: Update Docs & Tests
**Description:** Update all affected SPECS.md, root CHANGELOG.md, run tests
**Acceptance Criteria:**
- [ ] All SPECS.md files updated (client + server side)
- [ ] CHANGELOG.md updated with Added/Changed/Removed/Fixed + Tests Run
- [ ] All tests pass

> Tasks ready. Run `/push-issues` to create GitHub Issues or `/implement` to start coding.
```
