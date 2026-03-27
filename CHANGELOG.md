# Changelog

## v1.0.0 — 2026-03-27

### Initial Release

**169 tools** for BMAD Method — 135 subagents + 32 upstream skills + 2 custom skills.

#### Subagent Awareness
- Bundled 135 specialized subagents from [awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents)
- ~60 technology keywords mapped to the right specialists
- Role-based filtering: Dev sees Implementation + Quality, QA sees Quality + Implementation, Architect sees Architecture + Implementation
- `fetch-agents.sh` to update bundled agents from upstream

#### Skill Awareness
- Bundled 32 curated upstream skills from Anthropic, Vercel Labs, Expo, HashiCorp, Cloudflare, Astral, Trail of Bits, HuggingFace, and community
- Tech-stack-based skill recommendations (react, nextjs, python, terraform, aws, playwright, etc.)
- AGENTS.md splits into "BMAD Workflow Skills" and "Recommended Skills" sections
- `fetch-skills.sh` with curated `skill-sources.txt` manifest
- Generated `skill-catalog.md` reference

#### Beads Integration
- Workflow gating via dependency graph (Beads + Dolt)
- Cross-agent handoffs with `/beads-handoff`
- Phase derivation from bead states (replaces `state.json`)
- Automatic workflow dependency seeding on project init

#### Onboarding
- `setup.sh` wizard — one command for full BMAD + overlay setup
- `install.sh` for overlay-only installs
- Supports global and project-scoped installations
- Auto-installs Dolt and Beads CLI

#### Custom Skills
- `/generate-team` — scans project, detects tech stack, generates AGENTS.md
- `/beads-handoff` — creates/claims inter-agent task handoffs
