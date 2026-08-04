# WoW Addon OpenCode Config

Agent, skills, commands, and custom tools for World of Warcraft addon development with [OpenCode](https://opencode.ai).

## What's Included

| Type | Name | Description |
| --- | --- | --- |
| **Agent** | `wow-addon` | WoW addon research subagent - API lookups, event payloads, Blizzard source patterns, best-practice guidance |
| **Skill** | `wow-addon-toolkit` | Core tool reference - all 5 custom tools documented with usage examples |
| **Skill** | `wow-lua-patterns` | WoW Lua idioms - namespace pattern, global caching, metatables, hooks, SavedVariables |
| **Skill** | `wow-frame-api` | Frame/UI API - CreateFrame, anchoring, backdrops, animations, widgets, taint avoidance |
| **Skill** | `wow-event-handling` | Event system - registration, dispatch, AceEvent, combat lockdown, listener factories |
| **Command** | `/wow-review` | Code review pipeline - static analysis, API verification, event checks, pattern review |
| **Command** | `/wow-scaffold` | Scaffold new addon - full project with Ace3, Options companion, CI, build tooling |
| **Script** | `maintain-annotations` | Manage multi-flavor FrameXML annotations (Retail, Classic, Classic Era, Anniversary) |
| **Tool** | `wow-api-lookup` | Search LuaLS annotations for API signatures, widget methods, enums |
| **Tool** | `wow-wiki-fetch` | Fetch behavioral docs from warcraft.wiki.gg |
| **Tool** | `wow-event-info` | Look up event names and payloads (all FrameXML events) |
| **Tool** | `wow-blizzard-source` | Browse Blizzard FrameXML source code (supports per-flavor queries) |

## Prerequisites

1. [OpenCode](https://opencode.ai) installed and configured
2. [Bun](https://bun.sh) runtime (required for custom tool execution)
3. [git](https://git-scm.com) (required for annotation setup and updates)
4. A supported shell:
   - **macOS / Linux**: Bash (the `.sh` scripts)
   - **Windows**: PowerShell 5.1+ or [PowerShell 7 (`pwsh`)](https://learn.microsoft.com/powershell/) (the `.ps1` scripts)
5. WoW API annotations (see setup below)
6. [luacheck](https://github.com/mpeterv/luacheck) (optional, for linting)
7. [ripgrep (`rg`)](https://github.com/BurntSushi/ripgrep) (required for local annotation and source searches)

## Quick Start

### macOS / Linux

```bash
# 1. Clone this repo
git clone https://github.com/Xerrion/wow-addon-opencode-config.git ~/Projects/wow-addon-opencode-config

# 2. Run the installer
cd ~/Projects/wow-addon-opencode-config
./install.sh

# 3. Install with annotations (clones Ketho + multi-flavor FrameXML)
./install.sh --annotations
```

### Windows (PowerShell)

```powershell
# 1. Clone this repo
git clone https://github.com/Xerrion/wow-addon-opencode-config.git ~\Projects\wow-addon-opencode-config

# 2. Run the installer
cd ~\Projects\wow-addon-opencode-config
.\install.ps1

# 3. Install with annotations (clones Ketho + multi-flavor FrameXML)
.\install.ps1 -Annotations
```

After annotation setup succeeds, the installer prints the fully expanded absolute paths of **both** annotation directories as a ready-to-copy `external_directory` block. Agents read the annotation trees from arbitrary project directories, so both entries must be added under `permission` in your `opencode.json` — one per annotation directory. (The OpenCode config directory itself needs no entry.)

macOS / Linux:

```json
"permission": {
  "external_directory": {
    "/home/you/.local/share/wow-annotations/**": "allow",
    "/home/you/.local/share/wow-framexml/**": "allow"
  }
}
```

Windows (forward slashes keep the paths valid JSON):

```json
"permission": {
  "external_directory": {
    "C:/Users/you/AppData/Local/wow-annotations/**": "allow",
    "C:/Users/you/AppData/Local/wow-framexml/**": "allow"
  }
}
```

## Annotation Setup

The custom tools require local WoW API annotation files. These provide type-accurate API signatures, widget definitions, enum values, and event payloads for all WoW versions.

### Automatic Setup (Recommended)

The `--annotations` flag on the install script handles everything - cloning the Ketho annotation repo and setting up multi-flavor FrameXML worktrees:

```bash
# macOS / Linux
./install.sh --annotations

# Windows (PowerShell)
.\install.ps1 -Annotations
```

### Multi-Flavor Architecture

Annotations are split across two repositories:

- **Ketho repo** (`wow-annotations`) - Shared API signatures, widget types, enums, events, and library stubs
- **FrameXML repo** (`wow-framexml`) - Blizzard's UI source code, separated into per-flavor worktrees

Four game flavors are supported:

| Worktree | Flavor | Description |
| --- | --- | --- |
| `live` | Retail | The War Within, current live servers |
| `classic` | Classic/MoP | Classic Mists of Pandaria |
| `classic_era` | Classic Era | Vanilla Classic (Era servers) |
| `classic_anniversary` | Anniversary Classic | 20th Anniversary Classic |

### Directory Structure

Annotations live under the platform-native user data root:

| Platform | Data root | Ketho repo | FrameXML flavors |
| --- | --- | --- | --- |
| macOS / Linux | `~/.local/share` | `~/.local/share/wow-annotations/` | `~/.local/share/wow-framexml/<flavor>/` |
| Windows | `%LOCALAPPDATA%` | `%LOCALAPPDATA%\wow-annotations\` | `%LOCALAPPDATA%\wow-framexml\<flavor>\` |

```
<data root>/wow-annotations/    # Ketho repo (shared APIs, widgets, events)
<data root>/wow-framexml/       # Multi-flavor FrameXML
  .bare/                        # Bare clone
  live/                         # Retail
  classic/                      # Classic/MoP
  classic_era/                  # Classic Era
  classic_anniversary/          # Anniversary Classic
```

To use a custom location instead, set the `WOW_ANNOTATIONS_ROOT` and/or `WOW_FRAMEXML_ROOT` environment variables — the custom tools honor them over the platform default.

### Managing Annotations

Use the `maintain-annotations` script to update or set up individual flavors:

```bash
# Update all flavors
./maintain-annotations.sh

# Set up or update a single flavor
./maintain-annotations.sh --flavor live
./maintain-annotations.sh --flavor classic
./maintain-annotations.sh --flavor classic_era
./maintain-annotations.sh --flavor classic_anniversary
```

```powershell
# Windows equivalents
.\maintain-annotations.ps1
.\maintain-annotations.ps1 -Flavor live
```

### Querying Specific Flavors

The `wow-blizzard-source` tool accepts a `flavor` parameter to query FrameXML for a specific flavor. When no flavor is specified, it defaults to Retail (`live`).

### Manual Setup (Legacy)

If you prefer to manage annotations manually without multi-flavor support:

```bash
# macOS / Linux: clone the annotation repository
git clone https://github.com/Ketho/vscode-wow-api ~/.local/share/wow-annotations

# Initialize the FrameXML submodule
cd ~/.local/share/wow-annotations
git submodule update --init --recursive
```

```powershell
# Windows: clone the annotation repository
git clone https://github.com/Ketho/vscode-wow-api "$env:LOCALAPPDATA\wow-annotations"

# Initialize the FrameXML submodule
cd "$env:LOCALAPPDATA\wow-annotations"
git submodule update --init --recursive
```

### What the Annotations Include

- **API files** - one annotation file per C_ namespace (C_Item, C_LootHistory, etc.)
- **Widget types** - Frame, Button, StatusBar, Texture, Font, Animation
- **Enums and types** - Enum.ItemQuality, structures, mixins
- **Library stubs** - Ace3, LibSharedMedia, LibDataBroker, LibDBIcon, LibStub
- **FrameXML source** - Blizzard's UI code with injected type annotations (per-flavor)

## Updating

To update to the latest config:

```bash
# macOS / Linux
cd ~/Projects/wow-addon-opencode-config
git pull
./install.sh --force
```

```powershell
# Windows (PowerShell)
cd ~\Projects\wow-addon-opencode-config
git pull
.\install.ps1 -Force
```

To update annotations:

```bash
# macOS / Linux: update all annotation repos and flavors
./maintain-annotations.sh

# Or just one flavor
./maintain-annotations.sh --flavor live
```

```powershell
# Windows equivalents
.\maintain-annotations.ps1
.\maintain-annotations.ps1 -Flavor live
```

## Uninstalling

```bash
# macOS / Linux
cd ~/Projects/wow-addon-opencode-config
./uninstall.sh
```

```powershell
# Windows (PowerShell)
cd ~\Projects\wow-addon-opencode-config
.\uninstall.ps1
```

Or skip the confirmation prompt:

```bash
./uninstall.sh --yes
```

```powershell
.\uninstall.ps1 -Yes
```
