---
name: generate-team
description: "Generate or update AGENTS.md for a project. Use when: user asks to generate team, update agents, refresh subagent recommendations, or initialize team-aware setup for a project."
version: "1.0.0"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Agent
---

# Generate Team — AGENTS.md Generator

Analyze the current project's tech stack and generate an `AGENTS.md` file at the project root with recommended subagents and skills.

## Process

### Step 1: Detect Tech Stack

Scan these files to identify technologies:

**Config files (read and parse):**
- `package.json` → dependencies → React, Vue, Next.js, Express, TypeScript, Playwright, etc.
- `pyproject.toml` / `requirements.txt` → Python, FastAPI, Django, pytest, Supabase, etc.
- `Cargo.toml` → Rust
- `go.mod` → Go
- `Gemfile` → Ruby/Rails
- `*.csproj` → .NET

**Directory presence:**
- `supabase/` → Supabase
- `.github/workflows/` → GitHub Actions

**File presence:**
- `Dockerfile` / `docker-compose.yml` → Docker
- `playwright.config.*` → Playwright
- `terraform.tf` → Terraform

**BMAD output artifacts (if `_bmad-output/` exists, scan recursively):**

Priority 1 — Structured tables (highest confidence):
- `_bmad-output/planning-artifacts/architecture.md` — parse structured tables (| Layer | Tool |) for definitive tech stack
- `_bmad-output/planning-artifacts/prd.md` — parse "Tech Stack", "Technical Requirements", "Integrations" sections

Priority 2 — Planning docs:
- `_bmad-output/planning-artifacts/*.md` — scan all other planning docs for structured tables and tech-related headers

Priority 3 — Implementation artifacts:
- `_bmad-output/implementation-artifacts/*.md` — extract technologies from code blocks (language tags), import statements, and framework-specific patterns in story specs

Priority 4 — Test & other artifacts:
- `_bmad-output/test-artifacts/*.md` — detect testing frameworks (pytest, playwright, jest, vitest, cypress, etc.)
- `_bmad-output/brainstorming/*.md` — tech decisions in structured format only

**Scanning rules for _bmad-output:**
- Structured tables and explicit tech headers are high-confidence signals
- Code blocks with language tags (```python, ```typescript, etc.) are medium-confidence
- Ignore casual prose mentions — "we considered React" does NOT mean React is used
- Deduplicate across all sources — each technology should appear once in the final output

### Step 2: Match Subagents

Use the catalog in `references/subagent-catalog.md` to match detected technologies to recommended subagents.

**Mapping rules (tech keyword → subagents):**
- python → python-pro
- fastapi → python-pro, backend-developer, api-designer
- django → django-developer, python-pro
- react → react-specialist, frontend-developer
- typescript → typescript-pro
- vue → vue-expert, frontend-developer
- angular → angular-architect, frontend-developer
- nextjs → nextjs-developer, react-specialist
- supabase/postgresql → postgres-pro, database-administrator
- sqlite → database-administrator, sql-pro
- docker → docker-expert, devops-engineer
- kubernetes → kubernetes-specialist, devops-engineer
- playwright → test-automator, qa-expert
- pytest → test-automator, python-pro
- graphql → graphql-architect
- websocket → websocket-engineer
- electron → electron-pro
- rust → rust-engineer
- go → golang-pro
- java → java-architect
- openai/anthropic/langchain → ai-engineer, llm-architect

**Classify into groups:**
- **Implementation**: language specialists, core development, infrastructure, data-ai, dev-experience
- **Quality & Review**: quality-security category agents (test-automator, code-reviewer, qa-expert, etc.)
- **Architecture & Planning**: api-designer, cloud-architect, microservices-architect, database-optimizer, platform-engineer

### Step 2b: Detect Beads Handoffs

Check if `.beads/` directory exists at project root AND `bd` CLI is available:

```bash
test -d .beads && command -v bd >/dev/null 2>&1
```

If both conditions are true, query pending handoffs:

```bash
bd ready --label handoff --json 2>/dev/null
```

Parse the result to extract: bead ID, title, and `agent:*` labels.
If `.beads/` doesn't exist or `bd` isn't available, skip this step entirely.

### Step 3: Match Skills

**BMAD workflow skills (always include):**
- `bmad-story-pipeline` — Story implementation end-to-end
- `bmad-epic-pipeline` — Full epic delivery pipeline

**BMAD skills based on tech:**
- Testing detected → `bmad-tea-testarch-framework`, `bmad-tea-testarch-test-design`
- Playwright detected → `bmad-tea-testarch-automate`
- React/frontend detected → `bmad-bmm-create-ux-design`

**Upstream utility skills (always include):**
- `pdf` — PDF extraction, merging, splitting, form handling
- `docx` — Word document creation and editing
- `xlsx` — Excel spreadsheet operations and analysis
- `mcp-builder` — Create MCP servers for API integration

**Upstream skills based on tech:**
- react → `web-artifacts-builder`, `frontend-design`
- nextjs → `next-best-practices`, `next-cache-components`
- playwright → `webapp-testing`, `playwright-skill`
- testing → `test-driven-development`, `pypict-testing`
- python → `ruff`, `uv`
- terraform → `terraform-style-guide`, `terraform-test`
- aws → `aws-cdk`, `aws-serverless`
- cloudflare → `wrangler`, `web-perf`
- react-native → `expo-native-ui`, `expo-deployment`
- tailwind/vue/angular → `frontend-design`
- d3 → `d3-visualization`
- openai/pytorch/tensorflow → `transformers-js`
- blockchain → `audit-context-building`
- git → `using-git-worktrees`

Check `references/skill-catalog.md` for the full catalog of available upstream skills.

### Step 4: Generate AGENTS.md

Write to `{project-root}/AGENTS.md` using this template:

```markdown
<!-- Generated by generate-team | {ISO date} -->
<!-- Sources: {list of files scanned} -->

# Project Team — {Project Name}

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| {layer} | {techs} |

## Recommended Subagents

### Implementation

| Subagent | Why |
|----------|-----|
| {name} | {reason} |

### Quality & Review

| Subagent | Why |
|----------|-----|
| {name} | {reason} |

### Architecture & Planning

| Subagent | Why |
|----------|-----|
| {name} | {reason} |

## BMAD Workflow Skills

| Skill | When to Use |
|-------|------------|
| {name} | {description} |

## Recommended Skills

| Skill | When to Use |
|-------|------------|
| {name} | {description} |

## Task Handoffs (Beads)

{count} pending. Use `/beads-handoff` to manage.

| Bead | For Agent | Title |
|------|-----------|-------|
| {id} | {agent-tag} | {title} |

## Usage Notes

- Backend stories: prefer `{agent}` or `{agent}`
- Frontend stories: prefer `{agent}` or `{agent}`
- Database work: use `{agent}` or `{agent}`
- Code review & testing: use `{agent}` or `{agent}`
```

### Step 5: Report

Print a summary of what was detected and recommended.

## Important Rules

- Only recommend subagents for technologies **actually used** in the project
- Do NOT recommend agents for technologies merely mentioned in prose or future plans
- If `_bmad-output/` exists, prefer its structured data over filesystem scan (architecture tables > PRD > implementation artifacts > test artifacts)
- Scan ALL subdirectories in `_bmad-output/` recursively
- Omit empty sections (e.g., if no Quality subagents matched, skip that section)
- Keep Usage Notes practical and specific to the project
