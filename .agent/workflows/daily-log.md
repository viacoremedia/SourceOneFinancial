---
description: Create and maintain daily work logs for tracking changes, discoveries, and progress
---

# Daily Work Log Workflow

Maintain a running record of what was done, what was discovered, and what
needs attention. These logs serve as searchable project history for the team,
future developers, and stakeholders.

## Start of Work Session

When you start working on a project for the day:

1. Create (or open) a dated log file:
   ```
   docs/logs/YYYY-MM-DD.md
   ```

2. Write the header:
   ```markdown
   # Work Log — YYYY-MM-DD

   **Author:** [Your name]
   **Project:** [Project name]
   **Branch:** [Branch you're working on]
   ```

3. As you work, log entries under these sections:

## During the Session

Track work as it happens — don't try to remember it all at the end:

```markdown
## Changes Made
- [ ] `path/to/file.js` — [what changed and why] (small / medium / large)
- [ ] `path/to/other.tsx` — [what changed and why] (small / medium / large)

## Discoveries
- [Anything unexpected you found in the codebase]
- [Undocumented assumptions you had to work around]
- [Performance issues, security concerns, tech debt]

## Bugs & Issues Found
- [Bug description] — Filed as Issue #XX / Fixed in this session / Deferred
- [Issue description] — [Status]

## Tasks Completed
- [x] [Task from spec or board]
- [x] [Task from spec or board]

## Tasks Remaining / Deferred
- [ ] [What still needs to be done]
- [ ] [What was discovered but deferred to a future session]
```

## End of Work Session

Before you stop for the day:

1. **Update the log** with final status on all items
2. **Summarize** in 2-3 sentences: what was accomplished, what's next
3. **Ask the AI to generate a summary** of the session if you want a
   stakeholder-friendly version
4. **Commit the log** with the day's work:
   ```
   docs: add work log for YYYY-MM-DD
   ```

## Log Structure

```
docs/
└── logs/
    ├── 2026-03-10.md
    ├── 2026-03-11.md
    ├── 2026-03-12.md
    └── 2026-03-13.md
```

## Why Bother?

- **For the team:** "What did we work on yesterday?" is answered in 30 seconds.
- **For future devs:** Git blame shows what changed; logs explain WHY.
- **For stakeholders:** AI can summarize a week of logs into a status report.
- **For you:** When a bug appears weeks later, the log shows what was touched
  and what discoveries were made during that session.

## Tips

- Don't over-document trivial changes. A one-line CSS fix doesn't need a
  paragraph — just note the file and `(small)`.
- DO document discoveries and weird behavior. That's the gold in these logs.
- If you find a bug but aren't fixing it now, create a GitHub Issue AND note
  it in the log with the Issue number.
