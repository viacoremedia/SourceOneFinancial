---
description: Generate GitHub-ready Issue markdown — one Issue per Phase with full checklists and acceptance criteria
---

# Push Issues Workflow (Step 5 of 6)

You are now in PUSH TO ISSUES mode — the fifth step of the structured development flow.

Follow the project constitution and team-standards at all times.

## What to Do

For each Phase in the SPEC PLAN, output a complete **GitHub Issue markdown block**
that the user can copy-paste directly into GitHub.

## Rules

- ONE Issue per Phase (keeps total issues to 3–5 instead of 20–40)
- Each Issue must include the full task checklist from `/tasks`
- Each Issue must reference the branch name
- Each Issue must include acceptance criteria
- Add consistent labels for filtering

## Output Format

For each Phase, output:

```markdown
---

### Issue: Phase [X]: [Phase Name] — [Feature]

**Title:** `Phase X: [Phase Name] — [Feature]`

**Labels:** `feature`, `v5-workflow`

**Body:**

## Overview
[One paragraph describing what this Phase accomplishes]

## Branch
`feature/XX-[kebab-name]`

## Tasks
- [ ] Task 1 description
- [ ] Task 2 description
- [ ] Task 3 description
- [ ] Update SPECS.md + CHANGELOG.md + tests

## Acceptance Criteria
- [ ] [Criterion 1]
- [ ] [Criterion 2]
- [ ] All tests pass
- [ ] Documentation updated

---
```

After all Issues are output, end with:
**"All Phase Issues ready to copy-paste into GitHub. Run `/implement` to start coding Phase 1."**
