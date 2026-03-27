#!/usr/bin/env bash
set -euo pipefail

# BMAD Team-Aware & Skill-Aware Agents — Installer
#
# Two installation modes:
#   1. Skill-only (default) — installs generate-team as a Claude Code skill
#      Works with standard BMAD v6.2+ (skills-based distribution)
#   2. Plugin mode (--plugin) — also patches the OpenClaw MCP plugin
#      For OpenClaw-based workflows with bmad_start_workflow prompt injection

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
INSTALL_PLUGIN=false

# Parse args
for arg in "$@"; do
  case $arg in
    --plugin) INSTALL_PLUGIN=true ;;
    --help|-h)
      echo "Usage: install.sh [OPTIONS] [PROJECT_PATH]"
      echo ""
      echo "Options:"
      echo "  --plugin     Also patch the OpenClaw MCP plugin (for prompt injection)"
      echo "  --help       Show this help"
      echo ""
      echo "Arguments:"
      echo "  PROJECT_PATH   Target project (default: current directory)"
      echo "                 Use 'global' to install skill to ~/.claude/skills/"
      exit 0
      ;;
    *) TARGET_PROJECT="$arg" ;;
  esac
done

# Determine target
TARGET_PROJECT="${TARGET_PROJECT:-$(pwd)}"

echo "=== BMAD Team-Aware Installer ==="
echo ""

# ── Step 0: Provision Beads CLI (Dolt + bd) ──────────────────────────────

echo "[0/4] Checking Beads infrastructure..."

if command -v dolt &>/dev/null; then
  echo "  Dolt already installed: $(dolt version 2>/dev/null | head -1)"
else
  echo "  Installing Dolt (version-controlled SQL database)..."
  if command -v brew &>/dev/null; then
    brew install dolt 2>&1 | tail -2
  else
    echo "  ERROR: Homebrew not found. Install Dolt manually: https://docs.dolthub.com/introduction/installation"
    exit 1
  fi
fi

if command -v bd &>/dev/null; then
  echo "  Beads CLI already installed: $(bd version 2>/dev/null | head -1)"
else
  echo "  Installing Beads CLI..."
  if command -v npm &>/dev/null; then
    npm install -g @beads/bd 2>&1 | tail -2
  elif command -v go &>/dev/null; then
    go install github.com/steveyegge/beads/cmd/bd@latest 2>&1 | tail -2
  else
    echo "  ERROR: Neither npm nor go found. Install bd manually: https://github.com/steveyegge/beads"
    exit 1
  fi
  if ! command -v bd &>/dev/null; then
    echo "  ERROR: Failed to install bd CLI."
    exit 1
  fi
fi

echo ""

# ── Step 1: Install skill ─────────────────────────────────────────────────

if [ "$TARGET_PROJECT" = "global" ]; then
  SKILL_DIR="$HOME/.claude/skills/generate-team"
  AGENTS_DEST="$HOME/.claude/agents"
  echo "[1/4] Installing generate-team skill globally..."
else
  SKILL_DIR="$TARGET_PROJECT/.claude/skills/generate-team"
  AGENTS_DEST="$TARGET_PROJECT/.claude/agents"
  echo "[1/4] Installing generate-team skill to project..."
fi

mkdir -p "$SKILL_DIR/references"
cp "$PROJECT_DIR/skill/SKILL.md" "$SKILL_DIR/"
cp "$PROJECT_DIR/skill/references/subagent-catalog.md" "$SKILL_DIR/references/"
if [ -f "$PROJECT_DIR/skill/references/skill-catalog.md" ]; then
  cp "$PROJECT_DIR/skill/references/skill-catalog.md" "$SKILL_DIR/references/"
fi
echo "  Installed generate-team at: $SKILL_DIR"

# Install beads-handoff skill alongside generate-team
BEADS_SKILL_DIR="${SKILL_DIR%generate-team}beads-handoff"
mkdir -p "$BEADS_SKILL_DIR"
cp "$PROJECT_DIR/skill/beads-handoff/SKILL.md" "$BEADS_SKILL_DIR/"
echo "  Installed beads-handoff at: $BEADS_SKILL_DIR"

# ── Step 2a: Install subagents ─────────────────────────────────────────────

BUNDLED_AGENTS="$PROJECT_DIR/agents"

if [ -d "$BUNDLED_AGENTS" ] && [ "$(ls -A "$BUNDLED_AGENTS"/*.md 2>/dev/null)" ]; then
  echo "[2/4] Installing subagents..."
  mkdir -p "$AGENTS_DEST"
  AGENT_COUNT=0
  for agent_file in "$BUNDLED_AGENTS"/*.md; do
    cp "$agent_file" "$AGENTS_DEST/"
    AGENT_COUNT=$((AGENT_COUNT + 1))
  done
  echo "  Installed $AGENT_COUNT subagents to: $AGENTS_DEST"
else
  echo "[2/4] WARNING: No bundled agents found at $BUNDLED_AGENTS"
  echo "  Run scripts/fetch-agents.sh first to download subagent definitions"
fi

# ── Step 2b: Install upstream skills ───────────────────────────────────────

BUNDLED_SKILLS="$PROJECT_DIR/skills"
if [ "$TARGET_PROJECT" = "global" ]; then
  SKILLS_DEST="$HOME/.claude/skills"
else
  SKILLS_DEST="$TARGET_PROJECT/.claude/skills"
fi

if [ -d "$BUNDLED_SKILLS" ]; then
  SKILL_COUNT=0
  for skill_dir in "$BUNDLED_SKILLS"/*/; do
    if [ -f "$skill_dir/SKILL.md" ]; then
      skill_name="$(basename "$skill_dir")"
      target_skill="$SKILLS_DEST/$skill_name"
      mkdir -p "$target_skill"
      cp -r "$skill_dir"* "$target_skill/"
      SKILL_COUNT=$((SKILL_COUNT + 1))
    fi
  done
  if [ "$SKILL_COUNT" -gt 0 ]; then
    echo "  Installed $SKILL_COUNT upstream skills to: $SKILLS_DEST"
  fi
else
  echo "  No bundled skills found. Run scripts/fetch-skills.sh first."
fi

# ── Step 3: Generate initial AGENTS.md ─────────────────────────────────────

if [ "$TARGET_PROJECT" != "global" ] && [ -d "$TARGET_PROJECT" ]; then
  echo "[3/4] Checking for initial AGENTS.md generation..."

  if [ -f "$TARGET_PROJECT/AGENTS.md" ]; then
    echo "  AGENTS.md already exists — skipping (use /generate-team to update)"
  else
    echo "  AGENTS.md will be generated on first /generate-team invocation"
    echo "  Or ask Claude: 'generate the AGENTS.md for this project'"
  fi
else
  echo "[3/4] Skipping AGENTS.md generation (global install)"
fi

# ── Step 4: Plugin patches (optional) ──────────────────────────────────────

if [ "$INSTALL_PLUGIN" = "true" ]; then
  BMAD_PLUGIN="${OPENCLAW_BMAD_PLUGIN:-$HOME/.openclaw/workspace/bmad/openclaw}"

  if [ ! -f "$BMAD_PLUGIN/src/index.ts" ]; then
    echo "[4/4] WARNING: OpenClaw plugin not found at $BMAD_PLUGIN"
    echo "  Skipping plugin patches. Set OPENCLAW_BMAD_PLUGIN if needed."
  else
    echo "[4/4] Patching OpenClaw plugin at $BMAD_PLUGIN..."

    # Backup originals
    BACKUP_DIR="$BMAD_PLUGIN/.team-skills-backup"
    mkdir -p "$BACKUP_DIR/src/tools" "$BACKUP_DIR/src/lib"

    for f in src/index.ts src/tools/bmad-start-workflow.ts src/tools/bmad-init-project.ts \
             src/tools/bmad-complete-workflow.ts src/lib/orchestrator-rules.ts \
             src/lib/state.ts src/tools/bmad-load-step.ts; do
      if [ -f "$BMAD_PLUGIN/$f" ] && [ ! -f "$BACKUP_DIR/$f" ]; then
        cp "$BMAD_PLUGIN/$f" "$BACKUP_DIR/$f"
      fi
    done

    # Copy new files
    cp "$PROJECT_DIR/plugin/new/src/lib/team-resolver.ts" "$BMAD_PLUGIN/src/lib/"
    cp "$PROJECT_DIR/plugin/new/src/lib/beads.ts" "$BMAD_PLUGIN/src/lib/"
    cp "$PROJECT_DIR/plugin/new/src/lib/state.ts" "$BMAD_PLUGIN/src/lib/"
    cp "$PROJECT_DIR/plugin/new/src/tools/bmad-generate-team.ts" "$BMAD_PLUGIN/src/tools/"
    cp "$PROJECT_DIR/plugin/new/src/__tests__/team-resolver.test.ts" "$BMAD_PLUGIN/src/__tests__/"
    cp "$PROJECT_DIR/plugin/new/src/__tests__/beads.test.ts" "$BMAD_PLUGIN/src/__tests__/"
    cp "$PROJECT_DIR/plugin/new/src/__tests__/init-beads.test.ts" "$BMAD_PLUGIN/src/__tests__/"
    cp "$PROJECT_DIR/plugin/new/src/__tests__/state-beads.test.ts" "$BMAD_PLUGIN/src/__tests__/"
    cp "$PROJECT_DIR/plugin/new/src/__tests__/beads-handoff.test.ts" "$BMAD_PLUGIN/src/__tests__/"

    # Apply patches (with fallback to full file copy)
    patch_file() {
      local target="$1"
      local patch="$2"
      if /usr/bin/patch --dry-run -N "$BMAD_PLUGIN/$target" "$patch" > /dev/null 2>&1; then
        /usr/bin/patch -N "$BMAD_PLUGIN/$target" "$patch" > /dev/null
        echo "  Patched: $target"
      elif /usr/bin/patch -R --dry-run "$BMAD_PLUGIN/$target" "$patch" > /dev/null 2>&1; then
        echo "  Already patched: $target"
      else
        if [ -f "$PROJECT_DIR/plugin/new/$target" ]; then
          cp "$PROJECT_DIR/plugin/new/$target" "$BMAD_PLUGIN/$target"
          echo "  Replaced: $target (patch didn't apply cleanly)"
        fi
      fi
    }

    PATCHES_DIR="$PROJECT_DIR/plugin/patches"
    patch_file "src/index.ts" "$PATCHES_DIR/index.ts.patch"
    patch_file "src/tools/bmad-start-workflow.ts" "$PATCHES_DIR/bmad-start-workflow.ts.patch"
    patch_file "src/tools/bmad-init-project.ts" "$PATCHES_DIR/bmad-init-project.ts.patch"
    patch_file "src/tools/bmad-complete-workflow.ts" "$PATCHES_DIR/bmad-complete-workflow.ts.patch"
    patch_file "src/lib/orchestrator-rules.ts" "$PATCHES_DIR/orchestrator-rules.ts.patch"
    patch_file "src/tools/bmad-load-step.ts" "$PATCHES_DIR/bmad-load-step.ts.patch"

    echo "  Backups at: $BACKUP_DIR"
  fi
else
  echo "[4/4] Plugin patches skipped (use --plugin to enable)"
fi

echo ""
echo "=== Installation complete ==="
echo ""
echo "Usage in Claude Code:"
echo "  /generate-team          — Generate/update AGENTS.md"
echo "  /beads-handoff          — Create/claim inter-agent task handoffs"
echo "  Or ask: 'generate the AGENTS.md for this project'"
echo ""
echo "Beads: Workflow gating + cross-agent handoffs powered by bd CLI + Dolt"
echo ""
echo "To install on another project:"
echo "  $SCRIPT_DIR/install.sh /path/to/project"
