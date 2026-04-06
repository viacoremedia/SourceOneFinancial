---
description: Break a spec into 3–5 Phases with 3–6 tasks each — structured plan before any coding
---

# Plan Workflow (Step 3 of 6)

You are now in PLAN mode — the third step of the structured development flow.

Follow the project constitution and team-standards at all times.

## What to Do

1. Take the clarified spec and break it into **3–5 Phases maximum**
2. Each Phase should have **3–6 actionable tasks**
3. Phases should follow a logical dependency order:
   - Data models / schemas first
   - Backend routes and services second
   - Frontend components and integration third
   - Testing and polish last
4. Reference the feature-sliced structure from `saas.md` or `web.md` as applicable
5. End with: **"Plan complete. Run `/tasks` to expand a Phase, or `/push-issues` to generate GitHub Issues."**

## Rules

- Do NOT code yet
- Each Phase = one GitHub Issue (keeps total issues to 3–5, not 20–40)
- Tasks within a Phase should be sequential and completable in one session
- Reference which side each task affects: `[client]`, `[server]`, or `[both]`
- Include SPECS.md, CHANGELOG.md, and test updates as explicit tasks where applicable

## Output Format

```markdown
## SPEC PLAN — [Feature Name] (Branch: `feature/XX-[kebab-name]`)

### Phase 1: [Name]
- [ ] [server] Task 1 description
- [ ] [client] Task 2 description
- [ ] [both] Task 3 description — update SPECS.md + tests

### Phase 2: [Name]
- [ ] ...

### Phase 3: [Name]
- [ ] ...

> Plan complete. Run `/tasks` to expand a Phase, or `/push-issues` to generate GitHub Issues.
```
