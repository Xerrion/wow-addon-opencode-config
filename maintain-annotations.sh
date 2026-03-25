#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# maintain-annotations.sh - Manage multi-flavor WoW annotation repositories
#
# Maintains the Ketho shared API annotations and per-flavor FrameXML
# annotation worktrees. First run clones everything; subsequent runs update.
#
# Usage: ./maintain-annotations.sh [--flavor <name>] [--help]
#   --flavor <name>  Only update a specific flavor (can be repeated)
#   --help           Show this help message
#
# Supported flavors: live, classic, classic_era, classic_anniversary
# ---------------------------------------------------------------------------

# -- Colors -----------------------------------------------------------------

GREEN=$'\033[0;32m'
RED=$'\033[0;31m'
DIM=$'\033[0;90m'
RESET=$'\033[0m'

# -- Constants --------------------------------------------------------------

KETHO_REPO="https://github.com/Ketho/vscode-wow-api"
FRAMEXML_REPO="https://github.com/NumyAddon/FramexmlAnnotations.git"
ANNOTATIONS_DIR="${HOME}/.local/share/wow-annotations"
FRAMEXML_DIR="${HOME}/.local/share/wow-framexml"
BARE_DIR="${FRAMEXML_DIR}/.bare"

declare -A FLAVOR_BRANCHES=(
    [live]="live-mix-into-source"
    [classic]="classic-mix-into-source"
    [classic_era]="classic_era-mix-into-source"
    [classic_anniversary]="classic_anniversary-mix-into-source"
)
ALL_FLAVORS=(live classic classic_era classic_anniversary)

# -- State ------------------------------------------------------------------

REQUESTED_FLAVORS=()
UPDATED=0
CLONED=0

# -- Parse flags ------------------------------------------------------------

show_help() {
    printf '%s\n' "Usage: $0 [--flavor <name>] [--help]"
    printf '%s\n' ""
    printf '%s\n' "Options:"
    printf '%s\n' "  --flavor <name>  Only update a specific flavor (can be repeated)"
    printf '%s\n' "  --help           Show this help message"
    printf '%s\n' ""
    printf '%s\n' "Supported flavors: ${ALL_FLAVORS[*]}"
    printf '%s\n' ""
    printf '%s\n' "Directories:"
    printf '%s\n' "  Ketho annotations: ${ANNOTATIONS_DIR}"
    printf '%s\n' "  FrameXML flavors:  ${FRAMEXML_DIR}/<flavor>"
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --help)
            show_help
            ;;
        --flavor)
            if [[ $# -lt 2 ]]; then
                printf '%s\n' "${RED}✗${RESET} --flavor requires a value" >&2
                exit 1
            fi
            REQUESTED_FLAVORS+=("$2")
            shift 2
            ;;
        *)
            printf '%s\n' "${RED}✗${RESET} Unknown option: ${1}" >&2
            printf '%s\n' "Usage: $0 [--flavor <name>] [--help]" >&2
            exit 1
            ;;
    esac
done

# -- Validate requested flavors (Parse Don't Validate) ----------------------

validate_flavors() {
    local flavors=("$@")

    for flavor in "${flavors[@]}"; do
        if [[ -z "${FLAVOR_BRANCHES[$flavor]+set}" ]]; then
            printf '%s\n' "${RED}✗${RESET} Unknown flavor: ${flavor}" >&2
            printf '%s\n' "Supported flavors: ${ALL_FLAVORS[*]}" >&2
            exit 1
        fi
    done
}

if [[ ${#REQUESTED_FLAVORS[@]} -gt 0 ]]; then
    validate_flavors "${REQUESTED_FLAVORS[@]}"
    ACTIVE_FLAVORS=("${REQUESTED_FLAVORS[@]}")
else
    ACTIVE_FLAVORS=("${ALL_FLAVORS[@]}")
fi

# -- Guard: git must be available -------------------------------------------

if ! command -v git &>/dev/null; then
    printf '%s\n' "${RED}✗${RESET} git is not installed or not in PATH" >&2
    exit 1
fi

# -- Functions --------------------------------------------------------------

ensure_ketho_repo() {
    printf '%s\n' ""
    printf '%s\n' "${DIM}-- Ketho annotations (shared Core/) --${RESET}"

    if [[ -d "${ANNOTATIONS_DIR}/.git" ]]; then
        printf '%s\n' "${DIM}  Updating existing checkout...${RESET}"
        git -C "${ANNOTATIONS_DIR}" pull --ff-only
        git -C "${ANNOTATIONS_DIR}" submodule update --init --recursive
        printf '%s\n' "${GREEN}✓${RESET} Updated Ketho annotations"
        UPDATED=$((UPDATED + 1))
    else
        printf '%s\n' "${DIM}  Cloning fresh...${RESET}"
        git clone "${KETHO_REPO}" "${ANNOTATIONS_DIR}"
        git -C "${ANNOTATIONS_DIR}" submodule update --init --recursive
        printf '%s\n' "${GREEN}✓${RESET} Cloned Ketho annotations"
        CLONED=$((CLONED + 1))
    fi
}

ensure_bare_repo() {
    if [[ -d "${BARE_DIR}" ]]; then
        printf '%s\n' "${DIM}  Fetching FrameXML updates...${RESET}"
        git -C "${BARE_DIR}" fetch --all --prune
        printf '%s\n' "${GREEN}✓${RESET} Fetched FrameXML bare repo"
        UPDATED=$((UPDATED + 1))
    else
        printf '%s\n' "${DIM}  Cloning FrameXML bare repo...${RESET}"
        mkdir -p "${FRAMEXML_DIR}"
        git clone --bare "${FRAMEXML_REPO}" "${BARE_DIR}"
        printf '%s\n' "${GREEN}✓${RESET} Cloned FrameXML bare repo"
        CLONED=$((CLONED + 1))
    fi
}

ensure_worktree() {
    local flavor="$1"
    local branch="${FLAVOR_BRANCHES[$flavor]}"
    local worktree_dir="${FRAMEXML_DIR}/${flavor}"

    printf '%s\n' "${DIM}-- FrameXML: ${flavor} --${RESET}"

    if [[ -d "${worktree_dir}" ]]; then
        printf '%s\n' "${DIM}  Updating ${flavor} worktree...${RESET}"
        local current_branch
        current_branch="$(git -C "${worktree_dir}" branch --show-current)"
        if [[ "${current_branch}" != "${branch}" ]]; then
            printf '%s\n' "${RED}✗${RESET} Worktree ${flavor} is on '${current_branch}', expected '${branch}'" >&2
            exit 1
        fi
        git -C "${worktree_dir}" pull --ff-only origin "${branch}"
        printf '%s\n' "${GREEN}✓${RESET} Updated ${flavor} (${branch})"
        UPDATED=$((UPDATED + 1))
    else
        printf '%s\n' "${DIM}  Creating ${flavor} worktree...${RESET}"
        git -C "${BARE_DIR}" worktree add "${worktree_dir}" "${branch}"
        printf '%s\n' "${GREEN}✓${RESET} Created ${flavor} worktree (${branch})"
        CLONED=$((CLONED + 1))
    fi
}

# -- Main -------------------------------------------------------------------

printf '%s\n' "Maintaining WoW annotation repositories..."

ensure_ketho_repo

# Bare repo - once
printf '%s\n' ""
ensure_bare_repo

# Worktrees - per flavor
for flavor in "${ACTIVE_FLAVORS[@]}"; do
    printf '%s\n' ""
    ensure_worktree "${flavor}"
done

# -- Summary ----------------------------------------------------------------

printf '%s\n' ""
printf '%s\n' "Done! ${CLONED} cloned, ${UPDATED} updated."
