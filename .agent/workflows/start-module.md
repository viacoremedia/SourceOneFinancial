---
description: Initialize a new module with MODULE_LOG.md for tracking changes during development
---

# Start Module Workflow

Use this when beginning work on a new module (e.g., Deep Dive, Lead Scoring,
Map System). This sets up change-tracking so all work is logged and can be
published as versioned patch notes.

## Usage

```
/start-module [Module Name] [Version]
```

Example: `/start-module Deep Dive 1.0.0`

## What It Does

### 1. Create Module Directory

```
modules/
├── ACTIVE_MODULE.md          ← Points to the currently active module
└── [module-name]/
    └── MODULE_LOG.md          ← Accumulates changes during development
```

### 2. Create ACTIVE_MODULE.md

If `modules/ACTIVE_MODULE.md` doesn't exist, create it:

```markdown
# Active Module

**Module:** [Module Name]
**Version:** [Version]
**Started:** [Date]
**Path:** modules/[module-name]/MODULE_LOG.md
```

If it already exists, update it to point to the new module.

### 3. Create MODULE_LOG.md

```markdown
# [Module Name] — v[Version]

**Started:** [Date]
**Status:** In Progress

## Added
- (none yet)

## Changed
- (none yet)

## Fixed
- (none yet)

## Removed
- (none yet)

## Files Touched
- (none yet)
```

## After Initialization

Say: **"Module `[Name]` initialized at v[Version]. MODULE_LOG.md is tracking.
All `/implement` tasks will auto-log changes here."**

## How It Integrates

After every completed task in `/implement`, the AI must also:
1. Read `modules/ACTIVE_MODULE.md` to find the active module
2. Append the change to the module's `MODULE_LOG.md` under the correct section
3. Format: `- [Description] (Phase X, Task Y)`
4. Add any new files to the `## Files Touched` section
5. This is **in addition to** the existing CHANGELOG.md and SPECS.md updates
