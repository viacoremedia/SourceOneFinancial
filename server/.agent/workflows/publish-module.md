---
description: Publish module changes to DB as a versioned patch note
---

# Publish Module Workflow

Use this when a module is complete and you want to publish all accumulated
changes from `MODULE_LOG.md` as a versioned patch note.

## Usage

```
/publish-module
```

## What It Does

### 1. Read the Active Module

Read `modules/ACTIVE_MODULE.md` to identify the current module and version.

### 2. Compile the Patch Note

Read `modules/[module-name]/MODULE_LOG.md` and compile all entries into a
structured patch note:

```markdown
# [Module Name] — v[Version] Patch Notes

**Published:** [Date]
**Phases Completed:** [X]

## Added
- [All accumulated Added items]

## Changed
- [All accumulated Changed items]

## Fixed
- [All accumulated Fixed items]

## Removed
- [All accumulated Removed items]

## Files Touched
- [Complete list]
```

### 3. Archive the Log

1. Copy the compiled patch note to `modules/[module-name]/PATCH_v[Version].md`
2. Update `MODULE_LOG.md` status to `Published`
3. Clear or archive `ACTIVE_MODULE.md` (set to "No active module")

### 4. Output for Database

Output the patch note in a format suitable for database insertion:

```json
{
  "module": "[Module Name]",
  "version": "[Version]",
  "publishedAt": "[ISO Date]",
  "added": ["item 1", "item 2"],
  "changed": ["item 1"],
  "fixed": ["item 1"],
  "removed": [],
  "filesTouched": ["file1.ts", "file2.ts"]
}
```

## After Publishing

Say: **"Module `[Name]` v[Version] published ✅ Patch notes archived at
`modules/[module-name]/PATCH_v[Version].md`."**
