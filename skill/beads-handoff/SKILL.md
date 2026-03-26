---
name: beads-handoff
description: Create, claim, or complete inter-agent task handoffs using Beads
version: 1.0.0
tags:
  - beads
  - handoff
  - coordination
allowed-tools:
  - Bash
  - Read
---

# Beads Handoff — Inter-Agent Task Management

Hand off work to specialized subagents via Beads. Use when you discover work outside your specialty, or when you need to check for tasks assigned to your role.

## Create a handoff (for another agent)

```bash
bd create "<what needs doing>" --labels "handoff,agent:<target-subagent>" --description "<context, files, acceptance criteria>" --silent
```

Example:
```bash
bd create "Review auth middleware for IDOR" --labels "handoff,agent:security-engineer" --description "Potential IDOR in /api/users/:id. See src/middleware/auth.ts:45" --silent
```

## Check for tasks assigned to you

```bash
bd ready --label "agent:<your-agent-name>" --json
```

## Claim a task

```bash
bd update <bead-id> --claim
```

## Complete a task

```bash
bd close <bead-id> --reason "<what was done, files changed>"
```

## Add dependency between tasks

```bash
bd dep add <blocked-bead-id> <blocking-bead-id>
```

## View task details

```bash
bd show <bead-id> --json --long
```

## Rules

- **Tag format**: `agent:<subagent-name>` (e.g., `agent:security-engineer`, `agent:performance-engineer`)
- **Always include context**: file paths, line numbers, acceptance criteria in description
- **One bead per handoff**: do not bundle unrelated work
- **Titles under 80 chars**: be specific about the ask
- **Check before starting work**: run `bd ready --label "agent:<your-role>"` to see pending handoffs
