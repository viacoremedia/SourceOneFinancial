---
description: Coding mode — enforces branch announcement, per-task docs/changelog/test updates, and checklist tracking
---

# Implement Workflow (Step 6 of 6)

You are now in IMPLEMENT mode — the final step of the structured development flow.

Follow the project constitution and team-standards at all times.

## Before Coding

1. **Announce the branch:**
   > "Creating branch `feature/XX-[kebab-name]` from `development`…"
2. Work ONLY on that branch
3. Confirm which Phase and Task you are implementing

## During Each Task

Write the code, then **immediately** complete all of the following before moving
to the next task:

### Mandatory Post-Task Checklist
1. **Update SPECS.md** — Every affected directory's SPECS.md must reflect the change
   - Client-side: `client/src/features/[feature]/SPECS.md`
   - Server-side: `server/src/features/[feature]/SPECS.md`
2. **Update CHANGELOG.md** — Root changelog with:
   - **Added** / **Changed** / **Removed** / **Fixed** sections as applicable
   - **Tests Run** section listing what was tested
3. **Run tests** in the feature's `tests/` folder
4. **Tick the checklist item** in the Phase Issue (output the updated checklist)
5. **If module tracking is active** — also update `modules/[module]/MODULE_LOG.md`
   (see `/start-module` workflow)

### Task Completion Output
```
Task [N] complete ✅
- Updated: [list of SPECS.md files]
- Changelog: Added [summary]
- Tests: All passed (X tests)
```

## After All Tasks in a Phase

When every task in the current Phase is done:
```
Phase [X] complete ✅ — All tasks done, docs updated, tests passing.
```

Then ask: **"Next Phase or run `/deploy` when all Phases are complete?"**

## After All Phases

When the entire spec is complete:
```
Spec complete ✅ — Ready for PR to `development`.
```

## Rules

- NEVER skip documentation or tests — a task isn't done until docs + tests are done
- Keep files small: controllers/services < 400–600 lines
- Follow feature-sliced structure per `saas.md` or `web.md`
- If you discover something out of scope, note it but don't scope-creep
- If a task reveals a spec gap, note it and continue — update the spec after the Phase
