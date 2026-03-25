# WoW Addon OpenCode Config

Agent, skills, commands, and custom tools for World of Warcraft addon development with [OpenCode](https://opencode.ai).

## What's Included

| Type | Name | Description |
| --- | --- | --- |
| **Agent** | `wow-addon` | WoW addon development expert - API lookups, code review, event handling, UI patterns |
| **Skill** | `wow-addon-dev` | Core tool reference - all 5 custom tools documented with usage examples |
| **Skill** | `wow-lua-patterns` | WoW Lua idioms - namespace pattern, global caching, metatables, hooks, SavedVariables |
| **Skill** | `wow-frame-api` | Frame/UI API - CreateFrame, anchoring, backdrops, animations, widgets, taint avoidance |
| **Skill** | `wow-event-handling` | Event system - registration, dispatch, AceEvent, combat lockdown, listener factories |
| **Command** | `/wow-review` | Code review pipeline - static analysis, API verification, event checks, pattern review |
| **Command** | `/wow-scaffold` | Scaffold new addon - full project with Ace3, Options companion, CI, build tooling |
| **Tool** | `wow-api-lookup` | Search LuaLS annotations for API signatures, widget methods, enums |
| **Tool** | `wow-wiki-fetch` | Fetch behavioral docs from warcraft.wiki.gg |
| **Tool** | `wow-event-info` | Look up event names and payloads (1,727 events) |
| **Tool** | `wow-blizzard-source` | Browse Blizzard FrameXML source code |
| **Tool** | `wow-addon-lint` | Static analysis for WoW Lua anti-patterns (7 categories) |

## Prerequisites

1. [OpenCode](https://opencode.ai) installed and configured
2. [Bun](https://bun.sh) runtime (required for custom tool execution)
3. WoW API annotations (see setup below)
4. [luacheck](https://github.com/mpeterv/luacheck) (optional, for linting)

## Quick Start

### macOS / Linux

```bash
# 1. Clone this repo
git clone <repo-url> ~/Projects/wow-addon-opencode-config

# 2. Run the installer
cd ~/Projects/wow-addon-opencode-config
./install.sh

# 3. Set up WoW API annotations (required for tools)
git clone https://github.com/Ketho/vscode-wow-api ~/.local/share/wow-annotations
cd ~/.local/share/wow-annotations
git submodule update --init --recursive
```

### Windows (PowerShell)

```powershell
# 1. Clone this repo
git clone <repo-url> ~\Projects\wow-addon-opencode-config

# 2. Run the installer
cd ~\Projects\wow-addon-opencode-config
.\install.ps1

# 3. Set up WoW API annotations (required for tools)
git clone https://github.com/Ketho/vscode-wow-api $env:USERPROFILE\.local\share\wow-annotations
cd $env:USERPROFILE\.local\share\wow-annotations
git submodule update --init --recursive
```

## Annotation Setup

The custom tools require local WoW API annotation files. These provide type-accurate API signatures, widget definitions, enum values, and event payloads for all WoW versions.

```bash
# Clone the annotation repository
git clone https://github.com/Ketho/vscode-wow-api ~/.local/share/wow-annotations

# Initialize the FrameXML submodule
cd ~/.local/share/wow-annotations
git submodule update --init --recursive
```

The annotations include:
- **324 API files** - one per C_ namespace (C_Item, C_LootHistory, etc.)
- **Widget types** - Frame, Button, StatusBar, Texture, Font, Animation
- **Enums and types** - Enum.ItemQuality, structures, mixins
- **Library stubs** - Ace3, LibSharedMedia, LibDataBroker, LibDBIcon, LibStub
- **FrameXML source** - Blizzard's UI code with injected type annotations

## Updating

To update to the latest config:

```bash
cd ~/Projects/wow-addon-opencode-config
git pull
./install.sh --force
```

## Uninstalling

```bash
cd ~/Projects/wow-addon-opencode-config
./uninstall.sh
```

Or skip the confirmation prompt:

```bash
./uninstall.sh --yes
```
