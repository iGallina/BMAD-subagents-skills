# BMAD Team-Aware & Skill-Aware Agents

> An overlay for [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD) that makes agents aware of available [subagents](https://github.com/VoltAgent/awesome-claude-code-subagents) and [skills](https://github.com/VoltAgent/awesome-agent-skills) when working on projects.

## The Problem

When BMAD spawns an agent to execute a workflow (Dev implementing a story, QA writing tests, Architect designing systems), **the agent has no idea what specialized subagents or skills are available**. A Dev agent working on a FastAPI + React project doesn't know it can delegate to `python-pro` for backend work or `react-specialist` for frontend components.

Meanwhile, there are **131 specialized subagents** across 10 categories available — but agents can't use what they don't know about.

## The Solution

This overlay adds **team awareness** to the BMAD workflow:

1. **Scans your project** — detects technologies from `package.json`, `requirements.txt`, `pyproject.toml`, `Cargo.toml`, `Dockerfile`, architecture docs, etc.
2. **Maps tech to subagents** — ~50 technology keywords mapped to the right specialists
3. **Generates `AGENTS.md`** — a project-level file with recommended subagents + skills
4. **Injects into agent prompts** — when BMAD spawns a Dev/QA/Architect agent, they receive filtered recommendations based on their role

### Example: SmartAutomacao project (Python/FastAPI/Supabase/Docker)

```markdown
# Project Team — SmartAutomacao

## Tech Stack
| Layer | Technologies |
|-------|-------------|
| Language | Python |
| Backend | Python, FastAPI, SQLAlchemy, Supabase |
| Database | PostgreSQL |
| Infra | Docker |

## Recommended Subagents

### Implementation
| Subagent | Why |
|----------|-----|
| python-pro | python |
| postgres-pro | postgresql |
| backend-developer | fastapi |
| docker-expert | docker |

### Architecture & Planning
| Subagent | Why |
|----------|-----|
| api-designer | fastapi |
```

---

## Installation

### Prerequisites

- [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD) v6.2+ installed (`npx bmad-method install`)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
- Subagents from [awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents) (optional but recommended for full matching)

### Install to a project

```bash
# Clone this repo
git clone https://github.com/iGallina/BMAD-subagents-skills.git

# Install skill to your project
cd BMAD-subagents-skills
./scripts/install.sh /path/to/your/project
```

This installs the `generate-team` skill into your project's `.claude/skills/` alongside your existing BMAD skills.

### Install globally (all projects)

```bash
./scripts/install.sh global
```

Installs to `~/.claude/skills/generate-team/` — available in every Claude Code session.

### For OpenClaw users (optional)

If you use the OpenClaw MCP plugin, add `--plugin` to also patch the plugin for automatic prompt injection:

```bash
./scripts/install.sh /path/to/your/project --plugin
```

This enables:
- `bmad_generate_team` MCP tool
- Auto-injection of team recommendations into spawned agent prompts
- Auto-regeneration of AGENTS.md after architecture/PRD workflows

---

## Usage

### For existing projects (brownfield)

Open Claude Code in your project and run:

```
/generate-team
```

Or just ask: *"generate the AGENTS.md for this project"*

Claude will scan your project files, detect the tech stack, and create `AGENTS.md` at the project root.

### For new projects (greenfield)

If using the OpenClaw plugin (`--plugin`), `bmad_init_project` auto-generates AGENTS.md. Otherwise, run `/generate-team` after initial setup.

### Updating after stack changes

When your tech stack changes (e.g., SQLite → Supabase, adding Redis, switching to React):

```
/generate-team
```

The skill re-scans everything and regenerates AGENTS.md with updated recommendations.

---

## How It Works

### Tech Stack Detection

Scans project files in order of priority:

| Source | What it detects |
|--------|----------------|
| `_bmad-output/planning-artifacts/architecture.md` | Structured table data from architecture decisions |
| `package.json` | React, Vue, Next.js, Express, TypeScript, Playwright, etc. |
| `pyproject.toml` / `requirements.txt` | Python, FastAPI, Django, pytest, Supabase, etc. |
| `Cargo.toml` | Rust |
| `go.mod` | Go |
| `Gemfile` | Ruby/Rails |
| File/dir presence | Docker, Supabase, GitHub Actions, Playwright, Terraform |

Architecture docs are parsed for **structured tables only** — prose mentions like "we considered React but chose Vue" don't produce false positives.

### Subagent Matching

Maps detected technologies to subagents across 10 categories:

| Category | Examples |
|----------|----------|
| 01-core-development | backend-developer, frontend-developer, api-designer |
| 02-language-specialists | python-pro, typescript-pro, rust-engineer, golang-pro |
| 03-infrastructure | docker-expert, kubernetes-specialist, terraform-engineer |
| 04-quality-security | test-automator, code-reviewer, qa-expert |
| 05-data-ai | postgres-pro, ai-engineer, llm-architect |
| 06-developer-experience | refactoring-specialist, mcp-developer |
| 07-specialized-domains | fintech-engineer, game-developer |
| 08-business-product | product-manager, technical-writer |
| 09-meta-orchestration | multi-agent-coordinator, workflow-orchestrator |
| 10-research-analysis | market-researcher, competitive-analyst |

Results are classified into groups for role-based filtering:
- **Implementation** — language specialists, core dev, infrastructure
- **Quality & Review** — testing, security, code review
- **Architecture & Planning** — API design, DB optimization

### Prompt Injection (OpenClaw plugin mode)

When `bmad_start_workflow` spawns an agent, it reads `AGENTS.md` and injects a **filtered excerpt** based on the agent's role:

| Agent Role | Sees |
|-----------|------|
| Dev (Amelia) | Implementation + Quality + Usage Notes |
| QA (Quinn) | Quality + Implementation |
| Architect (Winston) | Architecture + Implementation |
| SM (Bob) in impl phase | Implementation |

This keeps prompts focused — a Dev agent doesn't see architecture recommendations, and an Architect doesn't see testing tools.

### Auto-Regeneration (OpenClaw plugin mode)

AGENTS.md is automatically regenerated after these workflows complete:
- `create-architecture`
- `create-prd`
- `correct-course`
- `technical-research`
- `document-project`

---

## Project Structure

```
BMAD-subagents-skills/
├── plugin/
│   ├── new/src/                     # All source files (new + modified)
│   │   ├── lib/team-resolver.ts     # Core: tech detection + subagent matching
│   │   ├── tools/bmad-generate-team.ts  # MCP tool wrapper
│   │   ├── tools/bmad-start-workflow.ts # Modified: team section injection
│   │   ├── tools/bmad-init-project.ts   # Modified: initial AGENTS.md generation
│   │   ├── tools/bmad-complete-workflow.ts # Modified: auto-regeneration
│   │   ├── lib/orchestrator-rules.ts    # Modified: team awareness rules
│   │   ├── index.ts                     # Modified: registers new tool
│   │   └── __tests__/team-resolver.test.ts  # 36 tests
│   └── patches/                     # Diffs for patching existing installs
├── skill/
│   ├── SKILL.md                     # generate-team Claude Code skill
│   └── references/
│       └── subagent-catalog.md      # Full catalog of 131 subagents
├── scripts/
│   ├── install.sh                   # Installer (skill-only or skill+plugin)
│   └── uninstall.sh                 # Revert plugin changes
└── README.md
```

## Compatibility

| Component | Version |
|-----------|---------|
| BMAD Method | v6.2+ |
| Claude Code | Latest |
| OpenClaw plugin (optional) | v0.1.0+ |
| Node.js / Bun | 20+ |

## Related Projects

- [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) — The core BMAD framework
- [awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents) — 131 specialized subagents
- [awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) — Reusable agent skills

## License

MIT
