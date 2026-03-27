#!/usr/bin/env bash
set -euo pipefail

# BMAD Team-Aware & Skill-Aware Agents — Onboarding Wizard
#
# One command to set up everything:
#   1. Checks prerequisites (Node.js, npm, git)
#   2. Installs BMAD Method into your project (if not already installed)
#   3. Installs 169 tools (135 subagents + 32 skills + 2 custom skills)
#   4. Sets up Beads workflow graph (Dolt + bd CLI)
#
# Usage:
#   ./scripts/setup.sh /path/to/project    # full setup for a project
#   ./scripts/setup.sh global              # tools only, no BMAD install
#   ./scripts/setup.sh --help

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
INSTALL_PLUGIN=false

# ── Parse args ─────────────────────────────────────────────────────────────

for arg in "$@"; do
  case $arg in
    --plugin) INSTALL_PLUGIN=true ;;
    --help|-h)
      echo "BMAD Team-Aware & Skill-Aware Agents — Setup Wizard"
      echo ""
      echo "Usage: setup.sh [OPTIONS] PROJECT_PATH"
      echo ""
      echo "Arguments:"
      echo "  PROJECT_PATH   Target project directory (created if it doesn't exist)"
      echo "                 Use 'global' to install tools globally without BMAD"
      echo ""
      echo "Options:"
      echo "  --plugin     Also patch the OpenClaw MCP plugin"
      echo "  --help       Show this help"
      echo ""
      echo "Examples:"
      echo "  ./scripts/setup.sh ~/my-new-project     # full setup"
      echo "  ./scripts/setup.sh .                     # setup in current directory"
      echo "  ./scripts/setup.sh global                # tools only (all projects)"
      exit 0
      ;;
    *) TARGET_PROJECT="$arg" ;;
  esac
done

TARGET_PROJECT="${TARGET_PROJECT:-}"

if [ -z "$TARGET_PROJECT" ]; then
  echo "BMAD Team-Aware & Skill-Aware Agents — Setup Wizard"
  echo ""
  echo "Usage: setup.sh [OPTIONS] PROJECT_PATH"
  echo ""
  echo "  PROJECT_PATH   Target project (e.g., ~/my-project or 'global')"
  echo ""
  echo "Run setup.sh --help for more options."
  exit 1
fi

IS_GLOBAL=false
if [ "$TARGET_PROJECT" = "global" ]; then
  IS_GLOBAL=true
fi

echo ""
echo "=========================================="
echo "  BMAD Team-Aware & Skill-Aware Setup"
echo "=========================================="
echo ""

# ── Step 1: Check prerequisites ────────────────────────────────────────────

echo "[1/5] Checking prerequisites..."

check_cmd() {
  local cmd="$1"
  local name="$2"
  local install_hint="$3"
  if command -v "$cmd" &>/dev/null; then
    local version
    version=$("$cmd" --version 2>/dev/null | head -1)
    echo "  $name: $version"
    return 0
  else
    echo "  $name: NOT FOUND"
    echo "    Install: $install_hint"
    return 1
  fi
}

PREREQS_OK=true
check_cmd node "Node.js" "https://nodejs.org/ (v20+)" || PREREQS_OK=false
check_cmd npm "npm" "comes with Node.js" || PREREQS_OK=false
check_cmd git "git" "https://git-scm.com/" || PREREQS_OK=false

if [ "$PREREQS_OK" = false ]; then
  echo ""
  echo "  ERROR: Missing prerequisites. Install them and re-run."
  exit 1
fi

echo ""

# ── Step 2: Check/Install BMAD Method ──────────────────────────────────────

if [ "$IS_GLOBAL" = true ]; then
  echo "[2/5] Skipping BMAD Method check (global install)"
  echo ""
else
  echo "[2/5] Checking BMAD Method..."

  # Create project directory if it doesn't exist
  if [ ! -d "$TARGET_PROJECT" ]; then
    echo "  Creating project directory: $TARGET_PROJECT"
    mkdir -p "$TARGET_PROJECT"
  fi

  # Resolve to absolute path
  TARGET_PROJECT="$(cd "$TARGET_PROJECT" && pwd)"

  # Check if BMAD is already installed
  BMAD_FOUND=false
  if [ -d "$TARGET_PROJECT/_bmad" ]; then
    BMAD_FOUND=true
    echo "  BMAD Method found: $TARGET_PROJECT/_bmad/"
  elif ls "$TARGET_PROJECT/.claude/skills/bmad-"* &>/dev/null 2>&1; then
    BMAD_FOUND=true
    echo "  BMAD Method found: $TARGET_PROJECT/.claude/skills/bmad-*"
  fi

  if [ "$BMAD_FOUND" = false ]; then
    echo "  BMAD Method not found in $TARGET_PROJECT"
    echo ""
    echo "  Installing BMAD Method..."
    echo "  This will run the BMAD interactive installer."
    echo "  ─────────────────────────────────────────────"
    echo ""

    # Initialize git if needed (BMAD requires a git repo)
    if [ ! -d "$TARGET_PROJECT/.git" ]; then
      echo "  Initializing git repository..."
      git -C "$TARGET_PROJECT" init -q
    fi

    # Run BMAD installer
    (cd "$TARGET_PROJECT" && npx bmad-method install)

    echo ""
    echo "  ─────────────────────────────────────────────"

    # Verify BMAD installed
    if [ -d "$TARGET_PROJECT/_bmad" ] || ls "$TARGET_PROJECT/.claude/skills/bmad-"* &>/dev/null 2>&1; then
      echo "  BMAD Method installed successfully"
    else
      echo "  WARNING: BMAD Method may not have installed correctly."
      echo "  Continuing with overlay installation anyway..."
    fi
  else
    echo "  Already installed — skipping"
  fi

  echo ""
fi

# ── Step 3: Install 169 tools ─────────────────────────────────────────────

echo "[3/5] Installing 169 tools (subagents + skills + beads)..."
echo ""

# Build install.sh args
INSTALL_ARGS=("$TARGET_PROJECT")
if [ "$INSTALL_PLUGIN" = true ]; then
  INSTALL_ARGS+=("--plugin")
fi

# Delegate to existing install.sh
"$SCRIPT_DIR/install.sh" "${INSTALL_ARGS[@]}"

echo ""

# ── Step 4: Initialize Beads workflow graph ────────────────────────────────

if [ "$IS_GLOBAL" = false ] && [ -d "$TARGET_PROJECT" ]; then
  echo "[4/5] Checking Beads workflow graph..."

  if [ -d "$TARGET_PROJECT/.beads" ]; then
    echo "  Beads already initialized — skipping"
  elif command -v bd &>/dev/null; then
    echo "  Beads workflow graph will be initialized on first BMAD workflow"
    echo "  Or run: cd $TARGET_PROJECT && bd init"
  else
    echo "  Beads CLI not available — skipping"
  fi
else
  echo "[4/5] Skipping Beads init (global install)"
fi

echo ""

# ── Step 5: Done ───────────────────────────────────────────────────────────

echo "[5/5] Setup complete!"
echo ""
echo "=========================================="
echo ""

if [ "$IS_GLOBAL" = true ]; then
  echo "  Tools installed globally to ~/.claude/"
  echo ""
  echo "  Next: open any project in Claude Code and run:"
  echo ""
  echo "    /generate-team"
  echo ""
else
  echo "  Project: $TARGET_PROJECT"
  echo ""
  echo "  Next steps:"
  echo ""
  echo "    cd $TARGET_PROJECT"
  echo "    claude"
  echo ""
  echo "  Then in Claude Code:"
  echo ""
  echo "    /generate-team              # scan tech stack, create AGENTS.md"
  echo "    /bmad-create-product-brief  # start building (greenfield)"
  echo ""
fi

echo "  169 tools ready: 135 subagents + 32 skills + 2 custom skills"
echo ""
