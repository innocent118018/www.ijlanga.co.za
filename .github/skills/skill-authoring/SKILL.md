---
name: skill-authoring
description: 'Create reusable agent skills from observed workflows. Use when turning a repeatable process into a custom SKILL.md, clarifying decision points, and defining completion checks.'
user-invocable: true
---

# Skill Authoring

## When to Use
- You want to turn a repeatable workflow into a reusable agent skill.
- You are documenting a multi-step process that others or an agent can execute again.
- You need to capture the reasoning, decision branches, and completion checks behind a process.
- You are creating a custom skill for a project or personal workflow.

## Procedure
1. Review the conversation or task history and identify the workflow being followed.
2. Extract the step-by-step process, including the sequence of actions and required context.
3. Identify the decision points and branching logic that change the next action.
4. Define what success looks like by recording completion checks or evidence required before the task is considered done.
5. Decide the scope:
   - Workspace skill for team-shared workflows → `.github/skills/<skill-name>/`
   - Personal skill for cross-workspace habits → `~/.copilot/skills/<skill-name>/`
6. Draft the `SKILL.md` with valid YAML frontmatter and a clear description that contains trigger words for discovery.
7. Structure the body with these sections:
   - When to Use
   - Procedure
   - Decision Points
   - Completion Checks
8. Validate the skill before finishing:
   - folder name matches `name`
   - YAML is valid
   - description is specific and keyword-rich
   - instructions are actionable, not vague
   - workflow is reusable without hidden context
9. If there is ambiguity, ask a few focused clarifying questions rather than guessing.

## Decision Points
- Repeatable workflow with multiple steps? → Skill
- Single focused task with parameter inputs? → Prompt
- Guidance that applies broadly to most work? → Instruction file
- Need context isolation or tool restrictions? → Custom agent
- Need deterministic lifecycle enforcement? → Hook

## Completion Checks
- The workflow is precise enough to be repeated by another agent or human.
- The process includes both the core steps and the branching logic.
- It states how to decide when the task is complete.
- It is saved in the correct location for the intended scope.
- The `name` and folder match, and the description is discoverable.

## Skill Template

```markdown
---
name: skill-name
description: 'Short, specific summary of the skill and the situations where it applies.'
user-invocable: true
---

# Skill Name

## When to Use
- Trigger situation one
- Trigger situation two

## Procedure
1. Step one
2. Step two
3. Step three

## Decision Points
- If X, do Y
- If Z, do A

## Completion Checks
- Outcome is verified
- Evidence is recorded
- No unresolved blockers remain
```

## Quality Bar
A good skill should be:
- specific enough to be used without extra interpretation
- concise enough to load quickly
- structured enough to be reused reliably
- discoverable through wording in the `description`
