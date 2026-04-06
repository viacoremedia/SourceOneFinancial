---
description: Clarify a spec — summarize understanding and ask up to 3 targeted questions before planning
---

# Clarify Workflow (Step 2 of 6)

You are now in CLARIFY mode — the second step of the structured development flow.

Follow the project constitution and team-standards at all times.

## What to Do

1. **Summarize** what you understood from the SPEC SUMMARY in **one short paragraph**
2. **Ask maximum 3 clarifying questions** (numbered) to remove ambiguity
   - Focus on questions that affect architecture, scope, or acceptance criteria
   - Don't ask about things you can reasonably infer from the constitution/rules
3. End with: **"Once answered, run `/plan` to proceed."**

## Rules

- Do NOT plan or code
- Do NOT ask more than 3 questions — if you have more, prioritize the most impactful
- If everything is clear from the SPEC SUMMARY step, say so and suggest moving directly to `/plan`
- Questions should be specific and actionable, not open-ended

## Output Format

```markdown
## CLARIFY

**Understanding:** [One paragraph summary of what will be built]

### Questions
1. [Specific question affecting architecture/scope]
2. [Specific question affecting acceptance criteria]
3. [Specific question, if needed]

> Once answered, run `/plan` to proceed.
```
