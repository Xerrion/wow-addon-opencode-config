#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# uninstall.sh - Remove WoW addon config items from OpenCode config dir
#
# Removes the known files and directories installed by install.sh.
# Use --yes to skip the confirmation prompt.
# ---------------------------------------------------------------------------

# -- Colors -----------------------------------------------------------------

GREEN=$'\033[0;32m'
RED=$'\033[0;31m'
DIM=$'\033[0;90m'
RESET=$'\033[0m'

# -- Resolve paths ----------------------------------------------------------

CONFIG_DIR="${HOME}/.config/opencode"

# -- Parse flags ------------------------------------------------------------

AUTO_YES=false
for arg in "$@"; do
    case "$arg" in
        --yes) AUTO_YES=true ;;
        *)
            printf '%s\n' "${RED}✗${RESET} Unknown option: ${arg}" >&2
            echo "Usage: $0 [--yes]" >&2
            exit 1
            ;;
    esac
done

# -- State ------------------------------------------------------------------

REMOVED=0

# -- Guard: nothing to do if config dir missing -----------------------------

if [ ! -d "$CONFIG_DIR" ]; then
    echo "Nothing to do - OpenCode config directory does not exist."
    exit 0
fi

# -- Confirmation prompt ----------------------------------------------------

if [ "$AUTO_YES" = false ]; then
    printf "This will remove 12 WoW addon config items from ~/.config/opencode/. Continue? [y/N] "
    read -r answer
    case "$answer" in
        [yY]|[yY][eE][sS]) ;;
        *)
            echo "Aborted."
            exit 0
            ;;
    esac
fi

# -- Removal helper ---------------------------------------------------------

remove_item() {
    local subdir="$1" name="$2" kind="$3"  # kind: "file" or "dir"
    local path="${CONFIG_DIR}/${subdir}/${name}"

    if [ ! -e "$path" ] && [ ! -L "$path" ]; then
        return 0
    fi

    if [ "$kind" = "dir" ]; then
        rm -rf "$path"
    else
        rm -f "$path"
    fi
    printf '%s\n' "${GREEN}✓${RESET} Removed ${subdir}/${name}"
    REMOVED=$((REMOVED + 1))
}

# -- Agents -----------------------------------------------------------------

echo "Agents:"
for name in wow-addon.md; do
    remove_item "agents" "$name" "file"
    remove_item "agent" "$name" "file"
done

# -- Skills -----------------------------------------------------------------

echo ""
echo "Skills:"
for name in wow-addon-dev wow-lua-patterns wow-frame-api wow-event-handling; do
    remove_item "skills" "$name" "dir"
    remove_item "skill" "$name" "dir"
done

# -- Commands ---------------------------------------------------------------

echo ""
echo "Commands:"
for name in wow-review wow-scaffold; do
    remove_item "commands" "${name}.md" "file"
    remove_item "command" "${name}.md" "file"
done

# -- Tools ------------------------------------------------------------------

echo ""
echo "Tools:"
for name in wow-api-lookup.ts wow-wiki-fetch.ts wow-event-info.ts wow-blizzard-source.ts wow-addon-lint.ts; do
    remove_item "tools" "$name" "file"
    remove_item "tool" "$name" "file"
done

# -- Summary ----------------------------------------------------------------

echo ""
echo "Done! ${REMOVED} items removed."
