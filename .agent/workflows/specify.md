---
description: Start a new spec/feature — read the request, list requirements, flag gaps. No coding yet.
---

# Specify Workflow (Step 1 of 6)

You are now in SPECIFY mode — the first step of the structured development flow.

Follow the project constitution and team-standards at all times.

## What to Do

1. **Read** the user's request carefully
2. **Output a SPEC SUMMARY** with:
   - Feature name
   - High-level goal
   - All explicit requirements
   - Tech constraints (client/server separation, feature-sliced structure, etc.)
3. **List ambiguities or missing details** (max 3 questions if needed)
4. End with: **"Ready for CLARIFY step. Run `/clarify` to proceed."**

## Rules

- Do NOT create branches, plans, or code yet
- Do NOT skip to implementation
- If the request is clear enough, you may note "No clarifying questions needed"
- Reference the project constitution for architectural constraints
- Reference `saas.md` or `web.md` for domain-specific constraints

## Output Format

```markdown
## SPEC SUMMARY

**Feature:** [Name]
**Goal:** [One sentence]

### Requirements
1. [Requirement from user request]
2. ...

### Tech Constraints
- [Applicable constraints from constitution/rules]

### Open Questions
1. [Question, if any]

> Ready for CLARIFY step. Run `/clarify` to proceed.
```
