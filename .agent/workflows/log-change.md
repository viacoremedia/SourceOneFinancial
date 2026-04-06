---
description: Manual fallback to log a missed change to the active module's MODULE_LOG.md
---

# Log Change Workflow

Use this as a manual fallback when a change was made but not automatically
logged to the active module's `MODULE_LOG.md`.

## Usage

```
/log-change [description]
```

Example: `/log-change Added retry logic to ghlService.js`

## What It Does

1. **Read** `modules/ACTIVE_MODULE.md` to find the active module
2. If no active module → prompt the user to run `/start-module` first
3. **Ask** which section the change belongs to:
   - **Added** — New feature, file, or capability
   - **Changed** — Modified existing behavior
   - **Fixed** — Bug fix or correction
   - **Removed** — Deleted feature, file, or deprecated code
4. **Append** the change to the correct section in `MODULE_LOG.md`:
   ```
   - [Description] (manual log)
   ```
5. **Update** the `## Files Touched` section if the user specifies affected files

## Output

```
Change logged ✅
Module: [Module Name]
Section: [Added/Changed/Fixed/Removed]
Entry: [Description] (manual log)
```

## When to Use

- You forgot to log a change during `/implement`
- You made a quick fix outside the normal workflow
- You need to retroactively document work from a previous session
- The AI missed an auto-log step
