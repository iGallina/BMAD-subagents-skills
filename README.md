# BMAD Team-Aware & Skill-Aware Agents

An overlay for the BMAD Method plugin that makes agents aware of available subagents and skills when working on projects.

## What It Does

When BMAD spawns an agent (Dev, QA, Architect, etc.), it now knows which Claude Code subagents and skills are appropriate for the project's tech stack.

- **`AGENTS.md`** — Auto-generated file at project root with recommended subagents + skills
- **Prompt injection** — Spawned agents receive filtered team recommendations in their context
- **Dynamic updates** — AGENTS.md regenerates after architecture/PRD workflows complete
- **Tech detection** — Scans `package.json`, `requirements.txt`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `Dockerfile`, architecture docs, etc.

## Installation

### Prerequisites

- BMAD Method installed (standard installation)
- Claude Code with bmad-skills plugin
- Subagents from [awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents) in `~/.openclaw/workspace/bmad/core/claude-subagents/`

### Quick Install

```bash
git clone <this-repo> ~/.openclaw/workspace/projects/bmad-team-skills
cd ~/.openclaw/workspace/projects/bmad-team-skills
./scripts/install.sh
```

### What install.sh Does

1. Copies new files into the BMAD OpenClaw plugin:
   - `src/lib/team-resolver.ts` — Tech stack detection + subagent matching
   - `src/tools/bmad-generate-team.ts` — MCP tool for AGENTS.md generation
2. Patches existing plugin files:
   - `src/index.ts` — Registers `bmad_generate_team` tool
   - `src/tools/bmad-start-workflow.ts` — Injects team section into agent prompts
   - `src/tools/bmad-init-project.ts` — Generates initial AGENTS.md
   - `src/tools/bmad-complete-workflow.ts` — Auto-regenerates after architecture workflows
   - `src/lib/orchestrator-rules.ts` — Adds team awareness rules
   - `src/tools/bmad-load-step.ts` — Fixes missing import (pre-existing bug)
3. Installs the `generate-team` skill globally (`~/.claude/skills/generate-team/`)
4. Runs TypeScript typecheck to verify

## Usage

### For new projects (greenfield)

```bash
# In Claude Code session:
# 1. Initialize BMAD project normally
#    bmad_init_project → AGENTS.md is auto-generated
# 2. Continue with workflows — agents are now team-aware
```

### For existing projects (brownfield)

```bash
# In Claude Code session:
/generate-team
# Or just ask: "generate AGENTS.md for this project"
```

### Adding /generate-team command to a project

```bash
mkdir -p .claude/commands
cat > .claude/commands/generate-team.md << 'EOF'
---
description: "Generate or update AGENTS.md with recommended subagents and skills"
---
Run the `generate-team` skill to analyze this project and generate/update AGENTS.md.
EOF
```

### Manual regeneration

After significant stack changes (e.g., SQLite → Supabase):
```
/generate-team
```

## How It Works

### Tech Stack Detection

Scans project files in order of priority:

1. `_bmad-output/planning-artifacts/architecture.md` — Structured table data only (no prose matching)
2. `package.json` — npm dependencies
3. `pyproject.toml` / `requirements.txt` — Python packages
4. `Cargo.toml`, `go.mod`, `Gemfile` — Language-specific configs
5. File/directory presence — `Dockerfile`, `supabase/`, `.github/workflows/`, `playwright.config.*`

### Subagent Matching

Maps ~50 technology keywords to 131 subagents across 10 categories. Results are classified into:

- **Implementation** — Language specialists, core dev, infrastructure
- **Quality & Review** — Testing, security, code review
- **Architecture & Planning** — API design, DB optimization

### Prompt Injection

When `bmad_start_workflow` spawns an agent, it reads `AGENTS.md` and injects a **filtered excerpt** based on the agent's role:

| Agent Role | Sees |
|-----------|------|
| Dev (Amelia) | Implementation + Quality + Usage Notes |
| QA (Quinn) | Quality + Implementation |
| Architect (Winston) | Architecture + Implementation |
| SM (Bob) in impl phase | Implementation |

### Auto-Regeneration

AGENTS.md is automatically regenerated after these workflows complete:
- `create-architecture`
- `create-prd`
- `correct-course`
- `technical-research`
- `document-project`

## Files

```
bmad-team-skills/
├── plugin/
│   ├── new/                    # New files to add
│   │   ├── src/lib/team-resolver.ts
│   │   └── src/tools/bmad-generate-team.ts
│   └── patches/                # Diffs for existing files
│       ├── index.ts.patch
│       ├── bmad-start-workflow.ts.patch
│       ├── bmad-init-project.ts.patch
│       ├── bmad-complete-workflow.ts.patch
│       ├── orchestrator-rules.ts.patch
│       └── bmad-load-step.ts.patch
├── skill/
│   ├── SKILL.md                # generate-team skill
│   └── references/
│       └── subagent-catalog.md
├── scripts/
│   ├── install.sh              # One-step installer
│   └── uninstall.sh            # Revert changes
├── tests/
│   └── team-resolver.test.ts   # 36 tests
└── README.md
```

## Compatibility

- BMAD Method v6.0+
- OpenClaw plugin v0.1.0+
- Claude Code with bmad-skills plugin
- Node.js 20+ / Bun
