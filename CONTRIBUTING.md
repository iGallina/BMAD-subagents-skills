# Contributing

Thanks for your interest in contributing to BMAD Team-Aware & Skill-Aware Agents.

## Reporting Bugs

Open an issue at [github.com/iGallina/BMAD-subagents-skills/issues](https://github.com/iGallina/BMAD-subagents-skills/issues) with:

- What you expected vs what happened
- Steps to reproduce
- Your OS and Node.js version
- The output of `./scripts/setup.sh --help` (to confirm you have the latest version)

## Adding a New Upstream Skill

The easiest way to contribute is adding a skill to the curated catalog.

1. Find the skill's GitHub repo (must have a `SKILL.md` file)
2. Edit `scripts/skill-sources.txt` — add a line:
   ```
   https://github.com/org/repo | path/to/skill | skill-slug | tech-keyword1,tech-keyword2
   ```
3. Run `./scripts/fetch-skills.sh` to verify it fetches correctly
4. Add the tech keyword mapping to `TECH_SKILL_MAP` in `plugin/new/src/lib/team-resolver.ts`
5. Add a test for the new mapping in `plugin/new/src/__tests__/team-resolver.test.ts`
6. Submit a PR

## Adding a New Tech Keyword Mapping

If a technology is already detected but doesn't map to the right subagents or skills:

1. Edit `TECH_SUBAGENT_MAP` or `TECH_SKILL_MAP` in `plugin/new/src/lib/team-resolver.ts`
2. Update `skill/SKILL.md` Step 2 (subagents) or Step 3 (skills) to document the new mapping
3. Add a test
4. Submit a PR

## Development Setup

```bash
git clone https://github.com/iGallina/BMAD-subagents-skills.git
cd BMAD-subagents-skills

# Fetch latest agents and skills
./scripts/fetch-agents.sh
./scripts/fetch-skills.sh

# Install to test locally
./scripts/install.sh global
```

## Code Style

- Shell scripts: `set -euo pipefail`, use `echo` for output, quote all variables
- TypeScript: follow existing patterns in `plugin/new/src/`
- Tests: colocated in `plugin/new/src/__tests__/`, use vitest

## Pull Requests

- Keep PRs focused — one feature or fix per PR
- Update README.md if your change affects the user-facing experience
- Update CHANGELOG.md with your change
- Test your changes: run `./scripts/fetch-skills.sh` and `./scripts/install.sh global`
