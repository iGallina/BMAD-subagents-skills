#!/usr/bin/env bash
set -euo pipefail

# BMAD Team-Aware & Skill-Aware Agents — Uninstaller
#
# Removes everything installed by install.sh / setup.sh:
#   - generate-team and beads-handoff skills
#   - Upstream skills (32 bundled skill directories)
#   - Subagents (135 bundled agent definitions)
#   - Beads test files and plugin patches
#
# Usage:
#   ./scripts/uninstall.sh              # uninstall from global (~/.claude/)
#   ./scripts/uninstall.sh /path/to/project  # uninstall from a project
#   ./scripts/uninstall.sh --plugin     # also restore OpenClaw plugin patches

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
RESTORE_PLUGIN=false

for arg in "$@"; do
  case $arg in
    --plugin) RESTORE_PLUGIN=true ;;
    --help|-h)
      echo "Usage: uninstall.sh [OPTIONS] [PROJECT_PATH]"
      echo ""
      echo "Options:"
      echo "  --plugin     Also restore OpenClaw plugin from backup"
      echo "  --help       Show this help"
      echo ""
      echo "Arguments:"
      echo "  PROJECT_PATH   Target project (default: global ~/.claude/)"
      exit 0
      ;;
    *) TARGET_PROJECT="$arg" ;;
  esac
done

TARGET_PROJECT="${TARGET_PROJECT:-global}"

if [ "$TARGET_PROJECT" = "global" ]; then
  CLAUDE_DIR="$HOME/.claude"
  echo "=== Uninstalling from global (~/.claude/) ==="
else
  CLAUDE_DIR="$TARGET_PROJECT/.claude"
  echo "=== Uninstalling from $TARGET_PROJECT ==="
fi

echo ""
REMOVED=0

# ── Step 1: Remove custom skills ──────────────────────────────────────────

echo "[1/4] Removing custom skills..."

for skill_name in generate-team beads-handoff; do
  if [ -d "$CLAUDE_DIR/skills/$skill_name" ]; then
    rm -rf "$CLAUDE_DIR/skills/$skill_name"
    echo "  Removed: $skill_name"
    REMOVED=$((REMOVED + 1))
  fi
done

# ── Step 2: Remove upstream skills ────────────────────────────────────────

echo "[2/4] Removing upstream skills..."

SKILL_COUNT=0
# Remove only skills that we bundled (match against skills/ directory in this repo)
if [ -d "$PROJECT_DIR/skills" ]; then
  for skill_dir in "$PROJECT_DIR/skills"/*/; do
    skill_name="$(basename "$skill_dir")"
    if [ -d "$CLAUDE_DIR/skills/$skill_name" ]; then
      rm -rf "$CLAUDE_DIR/skills/$skill_name"
      SKILL_COUNT=$((SKILL_COUNT + 1))
    fi
  done
fi

if [ "$SKILL_COUNT" -gt 0 ]; then
  echo "  Removed $SKILL_COUNT upstream skills"
  REMOVED=$((REMOVED + SKILL_COUNT))
else
  echo "  No upstream skills found to remove"
fi

# ── Step 3: Remove subagents ─────────────────────────────────────────────

echo "[3/4] Removing subagents..."

AGENT_COUNT=0
if [ -d "$PROJECT_DIR/agents" ] && [ -d "$CLAUDE_DIR/agents" ]; then
  for agent_file in "$PROJECT_DIR/agents"/*.md; do
    agent_name="$(basename "$agent_file")"
    if [ -f "$CLAUDE_DIR/agents/$agent_name" ]; then
      rm -f "$CLAUDE_DIR/agents/$agent_name"
      AGENT_COUNT=$((AGENT_COUNT + 1))
    fi
  done
fi

if [ "$AGENT_COUNT" -gt 0 ]; then
  echo "  Removed $AGENT_COUNT subagents"
  REMOVED=$((REMOVED + AGENT_COUNT))
else
  echo "  No subagents found to remove"
fi

# ── Step 4: Restore OpenClaw plugin (optional) ───────────────────────────

if [ "$RESTORE_PLUGIN" = true ]; then
  echo "[4/4] Restoring OpenClaw plugin..."

  BMAD_PLUGIN="${OPENCLAW_BMAD_PLUGIN:-$HOME/.openclaw/workspace/bmad/openclaw}"
  BACKUP_DIR="$BMAD_PLUGIN/.team-skills-backup"

  if [ ! -d "$BACKUP_DIR" ]; then
    echo "  No backup found at $BACKUP_DIR — skipping"
  else
    for f in src/index.ts src/tools/bmad-start-workflow.ts src/tools/bmad-init-project.ts \
             src/tools/bmad-complete-workflow.ts src/lib/orchestrator-rules.ts \
             src/lib/state.ts src/tools/bmad-load-step.ts; do
      if [ -f "$BACKUP_DIR/$f" ]; then
        cp "$BACKUP_DIR/$f" "$BMAD_PLUGIN/$f"
        echo "  Restored: $f"
      fi
    done

    # Remove added files
    rm -f "$BMAD_PLUGIN/src/lib/team-resolver.ts"
    rm -f "$BMAD_PLUGIN/src/lib/beads.ts"
    rm -f "$BMAD_PLUGIN/src/tools/bmad-generate-team.ts"
    rm -f "$BMAD_PLUGIN/src/__tests__/team-resolver.test.ts"
    rm -f "$BMAD_PLUGIN/src/__tests__/beads.test.ts"
    rm -f "$BMAD_PLUGIN/src/__tests__/init-beads.test.ts"
    rm -f "$BMAD_PLUGIN/src/__tests__/state-beads.test.ts"
    rm -f "$BMAD_PLUGIN/src/__tests__/beads-handoff.test.ts"
    echo "  Removed overlay files from plugin"

    rm -rf "$BACKUP_DIR"
    echo "  Removed backup directory"
  fi
else
  echo "[4/4] Plugin restore skipped (use --plugin to restore)"
fi

echo ""
echo "=== Uninstall complete ==="
echo ""
echo "  Removed $REMOVED items total"
echo ""
echo "  Note: AGENTS.md files in projects are NOT removed (still useful for Claude Code)."
echo "  Note: Dolt and Beads CLI are NOT removed (may be used by other tools)."
echo "  Note: BMAD Method skills are NOT removed (this only removes the overlay)."
