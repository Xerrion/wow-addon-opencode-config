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

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
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
    printf "This will remove WoW addon config items from ~/.config/opencode/. Continue? [y/N] "
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
for name in wow-addon-toolkit wow-lua-patterns wow-frame-api wow-event-handling; do
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
# Mirror-mode: enumerate the .ts files this repo would install, and remove
# their counterparts at the destination. Then prune now-empty subdirs (e.g.
# data/, savedvars/) but leave the tools/ root and any unknown files alone.

echo ""
echo "Tools:"
if [ -d "${SCRIPT_DIR}/tools" ]; then
    while IFS= read -r file; do
        rel="${file#${SCRIPT_DIR}/tools/}"
        remove_item "tools" "$rel" "file"
        remove_item "tool" "$rel" "file"
    done < <(find "${SCRIPT_DIR}/tools" -type f -name "*.ts" \
        -not -path "*/__tests__/*" -not -name "*.test.ts" | sort)

    # Prune empty subdirectories under tools/ (rmdir refuses non-empty dirs,
    # which is exactly the safety we want).
    for subdir in tools tool; do
        [ -d "${CONFIG_DIR}/${subdir}" ] || continue
        for d in "${CONFIG_DIR}/${subdir}"/*/; do
            [ -d "$d" ] || continue
            if rmdir "$d" 2>/dev/null; then
                printf '%s\n' "${GREEN}✓${RESET} Removed empty ${subdir}/$(basename "$d")/"
                REMOVED=$((REMOVED + 1))
            fi
        done
    done
fi

# -- Summary ----------------------------------------------------------------

echo ""
echo "Done! ${REMOVED} items removed."
