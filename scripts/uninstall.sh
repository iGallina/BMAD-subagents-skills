#!/usr/bin/env bash
set -euo pipefail

# BMAD Team-Aware — Uninstaller
# Restores original BMAD plugin files from backup

BMAD_PLUGIN="${OPENCLAW_BMAD_PLUGIN:-$HOME/.openclaw/workspace/bmad/openclaw}"
CLAUDE_SKILLS="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
BACKUP_DIR="$BMAD_PLUGIN/.team-skills-backup"

echo "=== BMAD Team-Aware Uninstaller ==="

if [ ! -d "$BACKUP_DIR" ]; then
  echo "ERROR: No backup found at $BACKUP_DIR"
  echo "Cannot uninstall — backups were not created during installation."
  exit 1
fi

echo "[1/3] Restoring original files..."
for f in src/index.ts src/tools/bmad-start-workflow.ts src/tools/bmad-init-project.ts \
         src/tools/bmad-complete-workflow.ts src/lib/orchestrator-rules.ts \
         src/tools/bmad-load-step.ts; do
  if [ -f "$BACKUP_DIR/$f" ]; then
    cp "$BACKUP_DIR/$f" "$BMAD_PLUGIN/$f"
    echo "  Restored: $f"
  fi
done

echo "[2/3] Removing added files..."
rm -f "$BMAD_PLUGIN/src/lib/team-resolver.ts"
rm -f "$BMAD_PLUGIN/src/tools/bmad-generate-team.ts"
rm -f "$BMAD_PLUGIN/src/__tests__/team-resolver.test.ts"
echo "  Removed: team-resolver.ts, bmad-generate-team.ts, team-resolver.test.ts"

echo "[3/3] Removing skill..."
rm -rf "$CLAUDE_SKILLS/generate-team"
echo "  Removed: generate-team skill"

echo ""
echo "=== Uninstall complete ==="
echo "Note: AGENTS.md files in projects are NOT removed (they are still useful for Claude Code)."
