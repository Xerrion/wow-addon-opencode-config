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

# -- Tools (individual .ts files) -------------------------------------------

echo ""
echo "Tools:"
for file in "${SCRIPT_DIR}/tools/"*.ts; do
    name="$(basename "$file")"
    install_item "$file" "${TOOLS_DIR}/${name}" "$name"
done

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
