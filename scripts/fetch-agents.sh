#!/usr/bin/env bash
set -euo pipefail

# Fetch latest subagent definitions from awesome-claude-code-subagents
# Run this as a maintainer to update the bundled agents/ directory

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
AGENTS_DIR="$PROJECT_DIR/agents"
REPO_URL="https://github.com/VoltAgent/awesome-claude-code-subagents.git"
TMP_DIR=$(mktemp -d)

cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

echo "=== Fetching subagents from awesome-claude-code-subagents ==="
echo ""

echo "[1/3] Cloning repository (shallow)..."
git clone --depth 1 "$REPO_URL" "$TMP_DIR/repo" 2>/dev/null

echo "[2/3] Copying agent definitions..."

# Clear existing agents
rm -rf "$AGENTS_DIR"
mkdir -p "$AGENTS_DIR"

# Find and copy all agent .md files from categories/
COUNT=0
if [ -d "$TMP_DIR/repo/categories" ]; then
  for category_dir in "$TMP_DIR/repo/categories"/*/; do
    if [ -d "$category_dir" ]; then
      for agent_file in "$category_dir"*.md; do
        if [ -f "$agent_file" ]; then
          cp "$agent_file" "$AGENTS_DIR/"
          COUNT=$((COUNT + 1))
        fi
      done
    fi
  done
elif [ -d "$TMP_DIR/repo/agents" ]; then
  for agent_file in "$TMP_DIR/repo/agents"/**/*.md; do
    if [ -f "$agent_file" ]; then
      cp "$agent_file" "$AGENTS_DIR/"
      COUNT=$((COUNT + 1))
    fi
  done
fi

echo "[3/3] Done! Copied $COUNT agent definitions to agents/"
echo ""
echo "Agents directory: $AGENTS_DIR"
ls "$AGENTS_DIR" | head -10
echo "... ($COUNT total)"
