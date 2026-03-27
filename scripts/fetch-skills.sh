#!/usr/bin/env bash
set -euo pipefail

# Fetch upstream skill definitions from curated sources.
# Reads skill-sources.txt, clones repos, extracts SKILL.md files,
# and generates the skill catalog.
#
# Run this as a maintainer to update the bundled skills/ directory.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SKILLS_DIR="$PROJECT_DIR/skills"
SOURCES_FILE="$SCRIPT_DIR/skill-sources.txt"
CATALOG_FILE="$PROJECT_DIR/skill/references/skill-catalog.md"
TMP_DIR=$(mktemp -d)
CLONED_FILE="$TMP_DIR/.cloned"

cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

touch "$CLONED_FILE"

echo "=== Fetching skills from curated sources ==="
echo ""

if [ ! -f "$SOURCES_FILE" ]; then
  echo "ERROR: $SOURCES_FILE not found"
  exit 1
fi

# Clear existing skills
rm -rf "$SKILLS_DIR"
mkdir -p "$SKILLS_DIR"

TOTAL=0
FETCHED=0
FAILED=0

# Hash a URL to a safe directory name
url_hash() {
  echo "$1" | md5 2>/dev/null || echo "$1" | md5sum 2>/dev/null | cut -d' ' -f1 || echo "$RANDOM"
}

# Check if repo was already cloned (returns repo_dir or "FAILED")
get_repo_dir() {
  local url="$1"
  local hash
  hash=$(url_hash "$url")
  local cached
  cached=$(grep "^${hash}|" "$CLONED_FILE" 2>/dev/null | head -1 | cut -d'|' -f2) || true
  echo "$cached"
}

# Record a cloned repo
record_clone() {
  local url="$1"
  local dir="$2"
  local hash
  hash=$(url_hash "$url")
  echo "${hash}|${dir}" >> "$CLONED_FILE"
}

# Read manifest and process each entry
while IFS= read -r line || [ -n "$line" ]; do
  # Skip comments and blank lines
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line// /}" ]] && continue

  # Parse: repo_url | skill_path | slug | keywords
  IFS='|' read -r repo_url skill_path slug keywords <<< "$line"
  repo_url="$(echo "$repo_url" | xargs)"
  skill_path="$(echo "$skill_path" | xargs)"
  slug="$(echo "$slug" | xargs)"
  keywords="$(echo "$keywords" | xargs)"

  if [ -z "$repo_url" ] || [ -z "$slug" ]; then
    continue
  fi

  TOTAL=$((TOTAL + 1))

  # Check if already cloned
  repo_dir=$(get_repo_dir "$repo_url")

  if [ -z "$repo_dir" ]; then
    # Not yet cloned — clone it
    hash=$(url_hash "$repo_url")
    repo_dir="$TMP_DIR/repo-$hash"
    echo "  Cloning: $repo_url"
    if git clone --depth 1 "$repo_url" "$repo_dir" 2>/dev/null; then
      record_clone "$repo_url" "$repo_dir"
    else
      echo "    WARN: Failed to clone $repo_url — skipping"
      record_clone "$repo_url" "FAILED"
      FAILED=$((FAILED + 1))
      continue
    fi
  fi

  if [ "$repo_dir" = "FAILED" ]; then
    FAILED=$((FAILED + 1))
    continue
  fi

  # Find SKILL.md
  skill_md=""
  if [ "$skill_path" = "." ]; then
    # Root-level skill
    if [ -f "$repo_dir/SKILL.md" ]; then
      skill_md="$repo_dir/SKILL.md"
    fi
  else
    if [ -f "$repo_dir/$skill_path/SKILL.md" ]; then
      skill_md="$repo_dir/$skill_path/SKILL.md"
    elif [ -f "$repo_dir/$skill_path.md" ]; then
      skill_md="$repo_dir/$skill_path.md"
    fi
  fi

  if [ -z "$skill_md" ] || [ ! -f "$skill_md" ]; then
    echo "    WARN: No SKILL.md found for $slug in $skill_path — skipping"
    FAILED=$((FAILED + 1))
    continue
  fi

  # Copy skill to skills/{slug}/
  target_dir="$SKILLS_DIR/$slug"
  mkdir -p "$target_dir"
  cp "$skill_md" "$target_dir/SKILL.md"

  # Also copy references/ directory if it exists alongside SKILL.md
  skill_parent="$(dirname "$skill_md")"
  if [ -d "$skill_parent/references" ]; then
    cp -r "$skill_parent/references" "$target_dir/"
  fi

  echo "    Fetched: $slug"
  FETCHED=$((FETCHED + 1))
done < "$SOURCES_FILE"

echo ""
echo "[2/3] Generating skill catalog..."

# Generate skill-catalog.md from fetched skills
mkdir -p "$(dirname "$CATALOG_FILE")"
{
  echo "# Skill Catalog"
  echo ""
  echo "Curated skills fetched from the community. Use \`/generate-team\` to get recommendations based on your project's tech stack."
  echo ""
  echo "| Name | Tech Keywords | Description |"
  echo "|------|--------------|-------------|"
} > "$CATALOG_FILE"

# Re-read sources for keyword mapping, then extract descriptions from SKILL.md frontmatter
while IFS= read -r line || [ -n "$line" ]; do
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line// /}" ]] && continue

  IFS='|' read -r _repo _path slug keywords <<< "$line"
  slug="$(echo "$slug" | xargs)"
  keywords="$(echo "$keywords" | xargs)"

  skill_file="$SKILLS_DIR/$slug/SKILL.md"
  [ -f "$skill_file" ] || continue

  # Extract description from YAML frontmatter (handles single-line and multi-line)
  description=""
  in_frontmatter=false
  reading_desc=false
  while IFS= read -r fmline; do
    if [ "$fmline" = "---" ]; then
      if [ "$in_frontmatter" = true ]; then
        break
      else
        in_frontmatter=true
        continue
      fi
    fi
    if [ "$in_frontmatter" = true ]; then
      if [ "$reading_desc" = true ]; then
        # Continue reading multi-line description until next key or end
        if [[ "$fmline" =~ ^[a-z_-]+: ]] || [[ "$fmline" =~ ^--- ]]; then
          reading_desc=false
        else
          # Append continuation line (strip leading whitespace)
          trimmed="$(echo "$fmline" | sed 's/^[[:space:]]*//')"
          if [ -n "$trimmed" ]; then
            description="$description $trimmed"
          fi
          continue
        fi
      fi
      if [[ "$fmline" =~ ^description:\ *\"(.*)\" ]] || [[ "$fmline" =~ ^description:\ *\'(.*)\' ]]; then
        description="${BASH_REMATCH[1]}"
      elif [[ "$fmline" =~ ^description:\ *$ ]]; then
        # Multi-line description starts on next line
        reading_desc=true
      elif [[ "$fmline" =~ ^description:\ *(.+) ]]; then
        description="${BASH_REMATCH[1]}"
      fi
    fi
  done < "$skill_file"

  # Fallback: use slug as description if extraction failed
  if [ -z "$description" ]; then
    description="$slug skill"
  fi

  # Truncate description to 100 chars for catalog readability
  if [ ${#description} -gt 100 ]; then
    description="${description:0:97}..."
  fi

  echo "| $slug | $keywords | $description |" >> "$CATALOG_FILE"
done < "$SOURCES_FILE"

echo ""
echo "[3/3] Done!"
echo ""
echo "  Skills fetched: $FETCHED / $TOTAL"
[ "$FAILED" -gt 0 ] && echo "  Skipped/failed: $FAILED"
echo "  Skills directory: $SKILLS_DIR"
echo "  Catalog: $CATALOG_FILE"
echo ""
ls "$SKILLS_DIR" 2>/dev/null | head -10
echo "... ($FETCHED total)"
