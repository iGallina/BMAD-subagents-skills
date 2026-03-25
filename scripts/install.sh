#!/usr/bin/env bash
set -euo pipefail

# BMAD Team-Aware & Skill-Aware Agents — Installer
# Installs overlay on top of standard BMAD Method plugin

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Configurable paths
BMAD_PLUGIN="${OPENCLAW_BMAD_PLUGIN:-$HOME/.openclaw/workspace/bmad/openclaw}"
CLAUDE_SKILLS="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"

echo "=== BMAD Team-Aware Installer ==="
echo ""
echo "Plugin path: $BMAD_PLUGIN"
echo "Skills path: $CLAUDE_SKILLS"
echo ""

# Verify BMAD plugin exists
if [ ! -f "$BMAD_PLUGIN/src/index.ts" ]; then
  echo "ERROR: BMAD plugin not found at $BMAD_PLUGIN"
  echo "Set OPENCLAW_BMAD_PLUGIN to the correct path."
  exit 1
fi

# Verify subagents exist
SUBAGENTS_DIR="$BMAD_PLUGIN/../../core/claude-subagents"
if [ ! -d "$SUBAGENTS_DIR" ]; then
  SUBAGENTS_DIR="$BMAD_PLUGIN/../core/claude-subagents"
fi
if [ ! -d "$SUBAGENTS_DIR" ]; then
  echo "WARNING: claude-subagents not found. AGENTS.md will generate without subagent recommendations."
  echo "Install from: https://github.com/VoltAgent/awesome-claude-code-subagents"
fi

# ── Step 1: Backup originals ──────────────────────────────────────────────
echo "[1/5] Backing up original files..."
BACKUP_DIR="$BMAD_PLUGIN/.team-skills-backup"
mkdir -p "$BACKUP_DIR/tools" "$BACKUP_DIR/lib"

for f in src/index.ts src/tools/bmad-start-workflow.ts src/tools/bmad-init-project.ts \
         src/tools/bmad-complete-workflow.ts src/lib/orchestrator-rules.ts \
         src/tools/bmad-load-step.ts; do
  if [ -f "$BMAD_PLUGIN/$f" ] && [ ! -f "$BACKUP_DIR/$f" ]; then
    cp "$BMAD_PLUGIN/$f" "$BACKUP_DIR/$f"
  fi
done
echo "  Backups saved to $BACKUP_DIR"

# ── Step 2: Copy new files ────────────────────────────────────────────────
echo "[2/5] Installing new files..."
cp "$PROJECT_DIR/plugin/new/src/lib/team-resolver.ts" "$BMAD_PLUGIN/src/lib/"
cp "$PROJECT_DIR/plugin/new/src/tools/bmad-generate-team.ts" "$BMAD_PLUGIN/src/tools/"
cp "$PROJECT_DIR/plugin/new/src/__tests__/team-resolver.test.ts" "$BMAD_PLUGIN/src/__tests__/"
echo "  Installed: team-resolver.ts, bmad-generate-team.ts, team-resolver.test.ts"

# ── Step 3: Apply patches ─────────────────────────────────────────────────
echo "[3/5] Patching existing files..."
PATCHES_DIR="$PROJECT_DIR/plugin/patches"

patch_file() {
  local target="$1"
  local patch="$2"
  if /usr/bin/patch --dry-run -N "$BMAD_PLUGIN/$target" "$patch" > /dev/null 2>&1; then
    /usr/bin/patch -N "$BMAD_PLUGIN/$target" "$patch"
    echo "  Patched: $target"
  elif /usr/bin/patch -R --dry-run "$BMAD_PLUGIN/$target" "$patch" > /dev/null 2>&1; then
    echo "  Already patched: $target (skipping)"
  else
    echo "  WARNING: Could not patch $target — copying modified version directly"
    # Fallback: copy the full modified file from the working plugin
    local basename=$(basename "$target")
    local dir=$(dirname "$target")
    if [ -f "$PROJECT_DIR/plugin/new/$target" ]; then
      cp "$PROJECT_DIR/plugin/new/$target" "$BMAD_PLUGIN/$target"
    fi
  fi
}

patch_file "src/index.ts" "$PATCHES_DIR/index.ts.patch"
patch_file "src/tools/bmad-start-workflow.ts" "$PATCHES_DIR/bmad-start-workflow.ts.patch"
patch_file "src/tools/bmad-init-project.ts" "$PATCHES_DIR/bmad-init-project.ts.patch"
patch_file "src/tools/bmad-complete-workflow.ts" "$PATCHES_DIR/bmad-complete-workflow.ts.patch"
patch_file "src/lib/orchestrator-rules.ts" "$PATCHES_DIR/orchestrator-rules.ts.patch"
patch_file "src/tools/bmad-load-step.ts" "$PATCHES_DIR/bmad-load-step.ts.patch"

# ── Step 4: Install skill ─────────────────────────────────────────────────
echo "[4/5] Installing generate-team skill..."
mkdir -p "$CLAUDE_SKILLS/generate-team/references"
cp "$PROJECT_DIR/skill/SKILL.md" "$CLAUDE_SKILLS/generate-team/"
cp "$PROJECT_DIR/skill/references/subagent-catalog.md" "$CLAUDE_SKILLS/generate-team/references/"
echo "  Installed skill at $CLAUDE_SKILLS/generate-team/"

# ── Step 5: Verify ────────────────────────────────────────────────────────
echo "[5/5] Verifying installation..."
cd "$BMAD_PLUGIN"

# Install deps if needed
if [ ! -d "node_modules" ]; then
  npm install --silent 2>/dev/null || true
fi

# Typecheck
if npx tsc --noEmit 2>/dev/null; then
  echo "  TypeScript: OK"
else
  echo "  WARNING: TypeScript errors detected (may be pre-existing)"
fi

echo ""
echo "=== Installation complete ==="
echo ""
echo "Usage:"
echo "  Greenfield: bmad_init_project will auto-generate AGENTS.md"
echo "  Brownfield: run /generate-team in any Claude Code session"
echo ""
echo "To add /generate-team command to a project:"
echo "  mkdir -p .claude/commands"
echo "  echo '---"
echo "  description: \"Generate AGENTS.md with recommended subagents\"'"
echo "  echo '---'"
echo "  echo 'Run the generate-team skill.' > .claude/commands/generate-team.md"
