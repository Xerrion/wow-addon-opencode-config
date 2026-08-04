#!/usr/bin/env bash
set -euo pipefail
shopt -s nullglob

# ---------------------------------------------------------------------------
# install.sh - Copy WoW addon agents, skills, commands, and tools into OpenCode
#
# Usage: ./install.sh [--force] [--annotations]
#   --force        Replace existing files/directories instead of skipping
#   --annotations  Run maintain-annotations.sh after install
# ---------------------------------------------------------------------------

# -- Colors -----------------------------------------------------------------

GREEN=$'\033[0;32m'
YELLOW=$'\033[0;33m'
RED=$'\033[0;31m'
RESET=$'\033[0m'

# -- Resolve paths ----------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_DIR="${HOME}/.config/opencode"

# Platform-native annotation storage - must match maintain-annotations.sh.
ANNOTATIONS_DIR="${HOME}/.local/share/wow-annotations"
FRAMEXML_DIR="${HOME}/.local/share/wow-framexml"

# -- State ------------------------------------------------------------------

FORCE=false
ANNOTATIONS=false
INSTALLED=0
SKIPPED=0

# -- Parse flags ------------------------------------------------------------

for arg in "$@"; do
    case "$arg" in
        --force) FORCE=true ;;
        --annotations) ANNOTATIONS=true ;;
        *)
            printf '%s\n' "${RED}✗${RESET} Unknown option: ${arg}" >&2
            echo "Usage: $0 [--force] [--annotations]" >&2
            exit 1
            ;;
    esac
done

# -- Guard: OpenCode must be installed --------------------------------------

if [ ! -d "$CONFIG_DIR" ]; then
    printf '%s\n' "${RED}✗${RESET} OpenCode config directory not found. Install OpenCode first." >&2
    exit 1
fi

# -- Directory name detection -----------------------------------------------
# OpenCode supports both singular (command/) and plural (commands/) directory
# names. We detect which variant exists, falling back to sensible defaults.

resolve_config_subdir() {
    local plural="$1"
    local singular="$2"
    local default="$3"

    if [ -d "${CONFIG_DIR}/${plural}" ]; then
        echo "${CONFIG_DIR}/${plural}"
    elif [ -d "${CONFIG_DIR}/${singular}" ]; then
        echo "${CONFIG_DIR}/${singular}"
    else
        mkdir -p "${CONFIG_DIR}/${default}"
        echo "${CONFIG_DIR}/${default}"
    fi
}

AGENTS_DIR="$(resolve_config_subdir "agents" "agent" "agents")"
SKILLS_DIR="$(resolve_config_subdir "skills" "skill" "skills")"
COMMANDS_DIR="$(resolve_config_subdir "commands" "command" "commands")"
TOOLS_DIR="$(resolve_config_subdir "tools" "tool" "tools")"

# -- Copy helper ------------------------------------------------------------

install_item() {
    local source="$1"
    local target="$2"
    local label="$3"
    local replaced=false

    # Source must exist - fail fast on bad repo state
    if [ ! -e "$source" ]; then
        printf '%s\n' "${RED}✗${RESET} Source not found: ${source}" >&2
        return 1
    fi

    # Target already exists
    if [ -e "$target" ]; then
        if [ "$FORCE" = true ]; then
            rm -rf "$target"
            replaced=true
        else
            printf '%s\n' "${YELLOW}-${RESET} Skipped ${label} (already exists, use --force to replace)"
            SKIPPED=$((SKIPPED + 1))
            return 0
        fi
    fi

    # Copy: use -R for directories, plain cp for files
    if [ -d "$source" ]; then
        cp -R "$source" "$target"
    else
        cp "$source" "$target"
    fi

    if [ "$replaced" = true ]; then
        printf '%s\n' "${YELLOW}  Replaced ${label}${RESET}"
    else
        printf '%s\n' "${GREEN}✓${RESET} Installed ${label}"
    fi
    INSTALLED=$((INSTALLED + 1))
}

# -- Agents (individual .md files) ------------------------------------------

echo "Agents:"
for file in "${SCRIPT_DIR}/agents/"*.md; do
    name="$(basename "$file")"
    install_item "$file" "${AGENTS_DIR}/${name}" "$name"
done

# -- Skills (entire directories, not individual files) ----------------------

echo ""
echo "Skills:"
for dir in "${SCRIPT_DIR}/skills/"*/; do
    name="$(basename "$dir")"
    install_item "${SCRIPT_DIR}/skills/${name}" "${SKILLS_DIR}/${name}" "$name"
done

# -- Commands (individual .md files) ----------------------------------------

echo ""
echo "Commands:"
for file in "${SCRIPT_DIR}/commands/"*.md; do
    name="$(basename "$file")"
    install_item "$file" "${COMMANDS_DIR}/${name}" "$name"
done

# -- Tools (.ts files, recursively, preserving subdirectory structure) ------
# Skips __tests__/ directories and *.test.ts files - those are dev-only.

echo ""
echo "Tools:"
while IFS= read -r file; do
    rel="${file#${SCRIPT_DIR}/tools/}"
    target="${TOOLS_DIR}/${rel}"
    target_dir="$(dirname "$target")"
    [ -d "$target_dir" ] || mkdir -p "$target_dir"
    install_item "$file" "$target" "$rel"
done < <(find "${SCRIPT_DIR}/tools" -type f -name "*.ts" \
    -not -path "*/__tests__/*" -not -name "*.test.ts" | sort)

# -- Tool dependencies ------------------------------------------------------
# Tools under tools/ import 'zod' and '@opencode-ai/plugin/tool'. Declare them
# in ~/.config/opencode/package.json so OpenCode can resolve them at runtime.

echo ""
echo "Tool dependencies:"

PKG_JSON="${CONFIG_DIR}/package.json"
TOOL_DEPS=("zod:latest" "@opencode-ai/plugin:latest")

if [ ! -f "$PKG_JSON" ]; then
    cat > "$PKG_JSON" <<'EOF'
{
  "name": "opencode-config",
  "private": true,
  "dependencies": {
    "zod": "latest",
    "@opencode-ai/plugin": "latest"
  }
}
EOF
    printf '%s\n' "${GREEN}✓${RESET} Created ${PKG_JSON} with zod and @opencode-ai/plugin"
elif command -v jq >/dev/null 2>&1; then
    for dep in "${TOOL_DEPS[@]}"; do
        name="${dep%%:*}"
        version="${dep#*:}"
        if ! tmp="$(mktemp)"; then
            printf '%s\n' "${YELLOW}!${RESET} Failed to create temp file for ${name}; skipping" >&2
            continue
        fi
        if jq --arg n "$name" --arg v "$version" \
            '.dependencies = (.dependencies // {}) | .dependencies[$n] = (.dependencies[$n] // $v)' \
            "$PKG_JSON" > "$tmp"; then
            mv "$tmp" "$PKG_JSON"
            printf '%s\n' "${GREEN}✓${RESET} Ensured ${name} present in ${PKG_JSON}"
        else
            rm -f "$tmp"
            printf '%s\n' "${RED}✗${RESET} Failed to update ${PKG_JSON} for ${name} (file may be invalid JSON or unreadable; inspect ${PKG_JSON})" >&2
        fi
    done
else
    printf '%s\n' "${YELLOW}-${RESET} jq not found - add 'zod' and '@opencode-ai/plugin' to ${PKG_JSON} manually"
fi

if command -v bun >/dev/null 2>&1; then
    if (cd "$CONFIG_DIR" && bun install --silent); then
        printf '%s\n' "${GREEN}✓${RESET} Ran bun install in ${CONFIG_DIR}"
    else
        printf '%s\n' "${YELLOW}-${RESET} bun install failed - run 'bun install' manually in ${CONFIG_DIR}"
    fi
else
    printf '%s\n' "${YELLOW}-${RESET} bun not found - run 'bun install' manually in ${CONFIG_DIR}"
fi

# -- Summary ----------------------------------------------------------------

echo ""
echo "Done! ${INSTALLED} items installed, ${SKIPPED} skipped."

# -- Annotations (optional) -------------------------------------------------

is_annotations_ok=false
if [ "$ANNOTATIONS" = true ]; then
    echo ""
    echo "Setting up annotations..."
    if "${SCRIPT_DIR}/maintain-annotations.sh"; then
        is_annotations_ok=true
    else
        printf '%s\n' "${RED}✗${RESET} Annotation setup failed (config install succeeded - run maintain-annotations.sh manually)" >&2
    fi
fi

# -- Annotation access for agents ---------------------------------------------
# Agents read the annotation trees from arbitrary project directories, so
# OpenCode needs external_directory read permission on BOTH annotation roots.
# The config dir itself needs no entry - OpenCode always reads its own config.

# Escape a string for use inside a JSON string literal. HOME may legally
# contain quotes, backslashes, or control characters, and the emitted
# permission block must stay copy-pasteable as valid JSON.
json_escape() {
    local s="$1" i ch esc
    s=${s//\\/\\\\}
    s=${s//\"/\\\"}
    for ((i = 1; i < 32; i++)); do
        printf -v ch "\\$(printf '%03o' "$i")"
        printf -v esc '\\u%04x' "$i"
        s=${s//"$ch"/"$esc"}
    done
    printf '%s' "$s"
}

if [ "$is_annotations_ok" = true ]; then
    echo ""
    echo "Annotation access for agents:"
    echo 'Both entries below are required under "permission" in your opencode.json'
    echo "(one per annotation directory - copy the block as-is):"
    echo ""
    printf '%s\n' "  \"external_directory\": {"
    printf '%s\n' "    \"$(json_escape "${ANNOTATIONS_DIR}")/**\": \"allow\","
    printf '%s\n' "    \"$(json_escape "${FRAMEXML_DIR}")/**\": \"allow\""
    printf '%s\n' "  }"
fi

# -- Next steps -------------------------------------------------------------

echo ""
echo "Next steps:"
if [ "$is_annotations_ok" = true ]; then
    echo "  1. See README.md for multi-flavor annotation details"
else
    echo "  1. Set up annotations:"
    echo "     ./maintain-annotations.sh"
    echo "  2. See README.md for full setup instructions"
fi
