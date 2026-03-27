# BMAD Team-Aware & Skill-Aware Agents

> An overlay for [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD) that makes agents aware of available [subagents](https://github.com/VoltAgent/awesome-claude-code-subagents) and [skills](https://github.com/VoltAgent/awesome-agent-skills) when working on projects.

## The Problem

When BMAD spawns an agent to execute a workflow (Dev implementing a story, QA writing tests, Architect designing systems), **the agent has no idea what specialized subagents or skills are available**. A Dev agent working on a FastAPI + React project doesn't know it can delegate to `python-pro` for backend work or `react-specialist` for frontend components.

Meanwhile, there are **135 specialized subagents** across 10 categories and **32+ curated skills** from the community available — but agents can't use what they don't know about.

## The Solution

This overlay adds **team and skill awareness** to the BMAD workflow:

1. **Scans your project** — detects technologies from `package.json`, `requirements.txt`, `pyproject.toml`, `Cargo.toml`, `Dockerfile`, architecture docs, etc.
2. **Maps tech to subagents and skills** — ~60 technology keywords mapped to the right specialists and relevant skills
3. **Generates `AGENTS.md`** — a project-level file with recommended subagents, BMAD workflow skills, and upstream skills
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

## BMAD Workflow Skills
| Skill | When to Use |
|-------|------------|
| bmad-story-pipeline | Story implementation end-to-end |
| bmad-epic-pipeline | Full epic delivery pipeline |

## Recommended Skills
| Skill | When to Use |
|-------|------------|
| ruff | Fast Python linter and formatter |
| uv | Python package and project manager |
```

---

## Installation

### Prerequisites

- [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD) v6.2+ installed (`npx bmad-method install`)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
- [Dolt](https://docs.dolthub.com/introduction/installation) — version-controlled SQL database (auto-installed via Homebrew)
- [Beads](https://github.com/steveyegge/beads) (`bd` CLI) — task graph for workflow gating + agent handoffs (auto-installed)

### Install globally (recommended)

```bash
git clone https://github.com/iGallina/BMAD-subagents-skills.git
cd BMAD-subagents-skills
./scripts/install.sh global
```

This installs everything in one step:
- **Dolt + Beads CLI** — auto-installed if not present
- **135 subagents** to `~/.claude/agents/` — immediately available in all projects
- **32 upstream skills** to `~/.claude/skills/` — curated from Anthropic, Vercel, Expo, HashiCorp, Cloudflare, and more
- **generate-team skill** to `~/.claude/skills/generate-team/`
- **beads-handoff skill** to `~/.claude/skills/beads-handoff/`

### Install to a specific project

```bash
./scripts/install.sh /path/to/your/project
```

Installs subagents and skill scoped to that project's `.claude/` directory.

### For OpenClaw users (optional)

Add `--plugin` to also patch the OpenClaw MCP plugin for automatic prompt injection:

```bash
./scripts/install.sh /path/to/your/project --plugin
```

This enables:
- `bmad_generate_team` MCP tool
- Auto-injection of team recommendations into spawned agent prompts
- Auto-regeneration of AGENTS.md after architecture/PRD workflows

### Updating subagents and skills

To pull the latest definitions from upstream:

```bash
./scripts/fetch-agents.sh     # update bundled subagents
./scripts/fetch-skills.sh     # update bundled skills
./scripts/install.sh global   # re-install everything
```

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
| `_bmad-output/**/*.md` | Full scan of all BMAD artifacts — architecture tables (highest priority), PRD tech requirements, implementation story specs, test frameworks |
| `package.json` | React, Vue, Next.js, Express, TypeScript, Playwright, etc. |
| `pyproject.toml` / `requirements.txt` | Python, FastAPI, Django, pytest, Supabase, etc. |
| `Cargo.toml` | Rust |
| `go.mod` | Go |
| `Gemfile` | Ruby/Rails |
| File/dir presence | Docker, Supabase, GitHub Actions, Playwright, Terraform |

BMAD artifacts are scanned with priority weighting — architecture tables and PRD tech sections have highest confidence, while implementation stories and test specs provide supporting signals. Prose mentions like "we considered React but chose Vue" don't produce false positives.

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

### Skill Matching

Maps detected technologies to curated upstream skills from the community:

| Tech Keyword | Skills Recommended |
|-------------|-------------------|
| react | `web-artifacts-builder`, `frontend-design` |
| nextjs | `next-best-practices`, `next-cache-components` |
| python | `ruff`, `uv` |
| playwright | `webapp-testing`, `playwright-skill` |
| terraform | `terraform-style-guide`, `terraform-test` |
| aws | `aws-cdk`, `aws-serverless` |
| react-native | `expo-native-ui`, `expo-deployment` |
| cloudflare | `wrangler`, `web-perf` |
| _always | `pdf`, `docx`, `xlsx`, `mcp-builder` |

Skills are split into two sections in AGENTS.md:
- **BMAD Workflow Skills** — pipeline skills (`bmad-story-pipeline`, `bmad-epic-pipeline`, etc.)
- **Recommended Skills** — upstream community skills matched to your tech stack

The curated skill sources are defined in `scripts/skill-sources.txt`. To add more skills, append entries and run `./scripts/fetch-skills.sh`.

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

### Beads Integration — Workflow Gating & Agent Handoffs

Powered by [Beads](https://github.com/steveyegge/beads) (`bd` CLI), the workflow state system uses a persistent dependency graph backed by [Dolt](https://docs.dolthub.com/) (a version-controlled SQL database).

**Beads replaces `state.json`** as the single source of truth for workflow state:

| Concept | How it maps to Beads |
|---------|---------------------|
| Workflow prerequisites | `bd dep add` blocking dependencies |
| Phase gating | `bd ready --label workflow` returns only unblocked workflows |
| Active workflow | Bead with status `in_progress` |
| Completed workflows | Closed beads |

**Cross-agent handoffs** — when an agent discovers work outside its specialty:

```
/beads-handoff
```

This creates a bead tagged with the target subagent (e.g., `agent:security-engineer`). The next agent to run will see pending handoffs in AGENTS.md and can claim them.

**Workflow dependency graph** — seeded automatically by `bmad_init_project`:

```
create-product-brief (analysis, no blockers)
  └── blocks: create-prd (planning)
        ├── blocks: create-architecture (solutioning)
        │     └── blocks: create-epics-and-stories
        │           └── blocks: sprint-planning (implementation)
        ├── blocks: validate-prd
        └── blocks: create-ux-design
```

---

## Project Structure

```
BMAD-subagents-skills/
├── agents/                           # 135 bundled subagent definitions (.md)
├── skills/                           # 32 bundled upstream skill directories
│   ├── pdf/SKILL.md                 #   Anthropic official skills
│   ├── next-best-practices/SKILL.md #   Vercel Labs skills
│   ├── expo-native-ui/SKILL.md      #   Expo team skills
│   ├── terraform-style-guide/SKILL.md # HashiCorp skills
│   ├── ruff/SKILL.md                #   Astral Python tools
│   └── ...                          #   + 27 more
├── plugin/
│   ├── new/src/                     # All source files (new + modified)
│   │   ├── lib/beads.ts             # Beads CLI wrapper (bd commands)
│   │   ├── lib/state.ts             # Beads-backed state (replaces state.json)
│   │   ├── lib/team-resolver.ts     # Core: tech detection + subagent/skill matching
│   │   ├── lib/orchestrator-rules.ts    # Modified: team + beads awareness rules
│   │   ├── tools/bmad-generate-team.ts  # MCP tool wrapper
│   │   ├── tools/bmad-start-workflow.ts # Modified: team section injection
│   │   ├── tools/bmad-init-project.ts   # Modified: beads init + AGENTS.md
│   │   ├── tools/bmad-complete-workflow.ts # Modified: auto-regeneration
│   │   ├── index.ts                     # Modified: registers new tool
│   │   └── __tests__/                   # Tests (beads + team + skills)
│   └── patches/                     # Diffs for patching existing installs
├── skill/
│   ├── SKILL.md                     # generate-team Claude Code skill
│   ├── beads-handoff/SKILL.md       # beads-handoff skill (agent task handoffs)
│   └── references/
│       ├── subagent-catalog.md      # Catalog of 131 subagents
│       └── skill-catalog.md         # Catalog of 32 curated upstream skills
├── scripts/
│   ├── install.sh                   # Installer (agents + skills + optional plugin)
│   ├── fetch-agents.sh              # Update bundled agents from upstream
│   ├── fetch-skills.sh              # Update bundled skills from curated sources
│   ├── skill-sources.txt            # Curated manifest of skill repos + tech keywords
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
| Dolt | Latest |
| Beads (`bd`) | v0.60+ |

## Related Projects

- [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) — The core BMAD framework
- [Beads](https://github.com/steveyegge/beads) — Distributed graph issue tracker for AI agents
- [bmad-withbeads](https://github.com/ozenalp22/bmad-withbeads) — Original beads + BMAD integration (inspiration)
- [awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents) — 135 specialized subagents (source for bundled agents)
- [awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) — Community skill index (one of several sources for bundled skills)
- [awesome-skills.com](https://awesome-skills.com/) — Largest skill directory (3,600+ skills indexed)
- [travisvn/awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills) — Curated skill collection
- [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) — Skills + SaaS integrations

## License

MIT
