---
description: Scaffold a new WoW addon project with full directory structure, Ace3 integration, companion Options addon, CI workflows, and build tooling following DragonLoot/DragonToast patterns
agent: wow-addon
---

# Scaffold New Addon: $ARGUMENTS

Create a complete WoW addon project for **$ARGUMENTS**.

## Instructions

### Step 1: Load All Skills

Load all 4 skills for comprehensive pattern coverage:
- `wow-addon-dev` (tool reference)
- `wow-lua-patterns` (namespace, SavedVars, OOP)
- `wow-frame-api` (UI patterns for Display/ files)
- `wow-event-handling` (listener patterns)

### Step 2: Create Directory Structure

Create the full project layout:

```
$ARGUMENTS/
  $ARGUMENTS/
    Core/
      Config.lua
      Init.lua
      Utils.lua
    Display/
      .gitkeep
    Listeners/
      .gitkeep
    Locales/
      enUS.lua
    Libs/
      LibStub/
        .gitkeep
    $ARGUMENTS.toc
    $ARGUMENTS_Vanilla.toc
    $ARGUMENTS_Cata.toc
    embeds.xml
  $ARGUMENTS_Options/
    Core.lua
    Tabs/
      General.lua
    Widgets/
      .gitkeep
    LayoutConstants.lua
    $ARGUMENTS_Options.toc
    $ARGUMENTS_Options_Vanilla.toc
    $ARGUMENTS_Options_Cata.toc
  .editorconfig
  .gitignore
  .gitmodules
  .luacheckrc
  .pkgmeta
  .github/
    workflows/
      lint.yml
      release.yml
      packager.yml
      toc-update.yml
  README.md
```

### Step 3: Generate TOC Files

**Main addon TOC** (`$ARGUMENTS/$ARGUMENTS.toc`):
```toc
## Interface: 110100
## Title: $ARGUMENTS
## Notes: Description of $ARGUMENTS
## Author: YourName
## Version: @project-version@
## SavedVariables: $ARGUMENTS_DB
## OptionalDeps: Ace3, LibSharedMedia-3.0, LibDataBroker-1.1, LibDBIcon-1.0
## X-Curse-Project-ID:
## X-WoWI-ID:
## X-Wago-ID:

# Libraries
embeds.xml
#@retail@
Libs/LibAnimate/LibAnimate.lua
#@end-retail@

# Locales
Locales/enUS.lua

# Core
Core/Config.lua
Core/Init.lua
Core/Utils.lua

# Display
#@retail@
#@end-retail@

# Listeners
#@retail@
#@end-retail@
```

Generate `_Vanilla.toc` and `_Cata.toc` variants with appropriate interface numbers (11507 for Vanilla, 40402 for Cata).

**Options addon TOC** (`$ARGUMENTS_Options/$ARGUMENTS_Options.toc`):
```toc
## Interface: 110100
## Title: $ARGUMENTS Options
## Notes: Configuration panel for $ARGUMENTS
## Author: YourName
## Version: @project-version@
## Dependencies: $ARGUMENTS
## LoadOnDemand: 1

LayoutConstants.lua
Core.lua
Tabs/General.lua
```

### Step 4: Generate Core Files

**`Core/Config.lua`** - Default configuration with AceDB defaults structure:
```lua
local ADDON_NAME, ns = ...
ns.Config = {}
ns.Config.Defaults = {
    profile = {
        enabled = true,
        -- Add default settings here
    },
}
```

**`Core/Init.lua`** - Ace3 addon initialization:
```lua
local ADDON_NAME, ns = ...
local Addon = LibStub("AceAddon-3.0"):NewAddon(ADDON_NAME, "AceConsole-3.0", "AceEvent-3.0")
ns.Addon = Addon
-- Global bridge for Options LoadOnDemand addon
_G[ADDON_NAME .. "NS"] = ns

function Addon:OnInitialize()
    self.db = LibStub("AceDB-3.0"):New(ADDON_NAME .. "_DB", ns.Config.Defaults, true)
    -- Register slash command
    self:RegisterChatCommand(ADDON_NAME:lower(), "SlashCommand")
end

function Addon:OnEnable()
    -- Register events, start listeners
end

function Addon:OnDisable()
    -- Cleanup
end

function Addon:SlashCommand(input)
    if not input or input:trim() == "" then
        -- Open options
        return
    end
end
```

**`Core/Utils.lua`** - Utility functions namespace:
```lua
local ADDON_NAME, ns = ...
ns.Utils = {}
```

**`Locales/enUS.lua`** - Base locale file:
```lua
local ADDON_NAME, ns = ...
local L = LibStub("AceLocale-3.0"):NewLocale(ADDON_NAME, "enUS", true)
if not L then return end
L["addon_loaded"] = "%s loaded."
```

### Step 5: Generate Options Files

**`$ARGUMENTS_Options/LayoutConstants.lua`**:
```lua
local ADDON_NAME, ns = ...
ns.Layout = {
    PANEL_WIDTH = 600,
    PANEL_HEIGHT = 500,
    PADDING = 16,
    ELEMENT_SPACING = 8,
    LABEL_HEIGHT = 20,
}
```

**`$ARGUMENTS_Options/Core.lua`** - Options panel initialization with global bridge:
```lua
local ns = _G["$ARGUMENTSNS"]
if not ns then return end
-- Options panel setup
```

**`$ARGUMENTS_Options/Tabs/General.lua`** - First options tab:
```lua
local ns = _G["$ARGUMENTSNS"]
if not ns then return end
-- General settings tab
```

### Step 6: Generate embeds.xml

```xml
<Ui xmlns="http://www.blizzard.com/wow/ui/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.blizzard.com/wow/ui/ https://raw.githubusercontent.com/ArcaneEngineer/wow-ui-schemata/refs/heads/main/UI.xsd">
    <Script file="Libs/LibStub/LibStub.lua"/>
    <Include file="Libs/CallbackHandler-1.0/CallbackHandler-1.0.xml"/>
    <Include file="Libs/AceAddon-3.0/AceAddon-3.0.xml"/>
    <Include file="Libs/AceDB-3.0/AceDB-3.0.xml"/>
    <Include file="Libs/AceEvent-3.0/AceEvent-3.0.xml"/>
    <Include file="Libs/AceConsole-3.0/AceConsole-3.0.xml"/>
    <Include file="Libs/AceLocale-3.0/AceLocale-3.0.xml"/>
    <Include file="Libs/AceTimer-3.0/AceTimer-3.0.xml"/>
    <Include file="Libs/LibSharedMedia-3.0/lib.xml"/>
    <Script file="Libs/LibDataBroker-1.1/LibDataBroker-1.1.lua"/>
    <Include file="Libs/LibDBIcon-1.0/LibDBIcon-1.0/lib.xml"/>
</Ui>
```

### Step 7: Generate .pkgmeta

```yaml
package-as: $ARGUMENTS

externals:
  $ARGUMENTS/Libs/LibStub:
    url: https://repos.wowace.com/wow/libstub/trunk
    tag: latest
  $ARGUMENTS/Libs/CallbackHandler-1.0:
    url: https://repos.wowace.com/wow/callbackhandler/trunk/CallbackHandler-1.0
    tag: latest
  $ARGUMENTS/Libs/AceAddon-3.0:
    url: https://repos.wowace.com/wow/ace3/trunk/AceAddon-3.0
  $ARGUMENTS/Libs/AceDB-3.0:
    url: https://repos.wowace.com/wow/ace3/trunk/AceDB-3.0
  $ARGUMENTS/Libs/AceEvent-3.0:
    url: https://repos.wowace.com/wow/ace3/trunk/AceEvent-3.0
  $ARGUMENTS/Libs/AceConsole-3.0:
    url: https://repos.wowace.com/wow/ace3/trunk/AceConsole-3.0
  $ARGUMENTS/Libs/AceLocale-3.0:
    url: https://repos.wowace.com/wow/ace3/trunk/AceLocale-3.0
  $ARGUMENTS/Libs/AceTimer-3.0:
    url: https://repos.wowace.com/wow/ace3/trunk/AceTimer-3.0
  $ARGUMENTS/Libs/LibSharedMedia-3.0:
    url: https://repos.wowace.com/wow/libsharedmedia-3-0/trunk/LibSharedMedia-3.0
    tag: latest
  $ARGUMENTS/Libs/LibDataBroker-1.1:
    url: https://repos.wowace.com/wow/libdatabroker-1-1
    tag: latest
  $ARGUMENTS/Libs/LibDBIcon-1.0:
    url: https://repos.wowace.com/wow/libdbicon-1-0
    tag: latest

ignore:
  - .github
  - .editorconfig
  - .gitignore
  - .gitmodules
  - .luacheckrc
  - README.md
  - tests
  - spec
```

### Step 8: Generate .luacheckrc

```lua
std = "lua51"
max_line_length = 120
codes = true

exclude_files = {
    "Libs/",
    ".release/",
}

ignore = {
    "211", -- Unused local variable
    "212", -- Unused argument
    "213", -- Unused loop variable
}

globals = {
    -- SavedVariables (update with actual variable names)
    "$ARGUMENTS_DB",
}

read_globals = {
    -- Lua
    "string", "table", "math", "pairs", "ipairs", "type", "select",
    "tostring", "tonumber", "unpack", "wipe", "tinsert", "tremove",
    "strsplit", "strtrim", "format",

    -- WoW API
    "CreateFrame", "UIParent", "GameTooltip", "GameTooltip_Hide",
    "GetTime", "UnitName", "UnitClass", "UnitExists",
    "InCombatLockdown", "IsInGroup", "IsInRaid",
    "C_Timer", "C_Item", "C_Spell",
    "hooksecurefunc", "securecallfunction",
    "SlashCmdList", "SLASH_$ARGUMENTS1",
    "WOW_PROJECT_ID", "WOW_PROJECT_MAINLINE",
    "WOW_PROJECT_CLASSIC", "WOW_PROJECT_CATACLYSM_CLASSIC",

    -- Libraries
    "LibStub",

    -- Globals bridge
    "$ARGUMENTSNS",
}
```

### Step 9: Generate CI Workflows

**`.github/workflows/lint.yml`**:
```yaml
name: Lint
on:
  pull_request_target:
    branches: [master]
jobs:
  lint:
    uses: Xerrion/wow-workflows/.github/workflows/lint.yml@main
```

**`.github/workflows/release.yml`**:
```yaml
name: Release
on:
  push:
    branches: [master]
jobs:
  release:
    uses: Xerrion/wow-workflows/.github/workflows/release.yml@main
```

**`.github/workflows/packager.yml`**:
```yaml
name: Package
on:
  push:
    tags: ['v*']
jobs:
  package:
    uses: Xerrion/wow-workflows/.github/workflows/packager.yml@main
```

**`.github/workflows/toc-update.yml`**:
```yaml
name: TOC Update
on:
  schedule:
    - cron: '0 12 * * 2'
  workflow_dispatch:
jobs:
  toc-update:
    uses: Xerrion/wow-workflows/.github/workflows/toc-update.yml@main
```

### Step 10: Generate Dotfiles

**`.editorconfig`**:
```ini
root = true

[*]
indent_style = space
indent_size = 4
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false

[*.yml]
indent_size = 2
```

**`.gitignore`**:
```
.release/
.DS_Store
```

**`.gitmodules`** (empty placeholder - user adds submodules for local dev):
```
```

### Step 11: Generate README.md

```markdown
# $ARGUMENTS

A World of Warcraft addon.

## Features

- Feature 1
- Feature 2

## Installation

### CurseForge / Wago / WoWInterface

Install via your preferred addon manager.

### Manual

1. Download the latest release
2. Extract `$ARGUMENTS` and `$ARGUMENTS_Options` folders into your `Interface/AddOns/` directory

## Configuration

Type `/addonname` in-game to open the options panel, or configure through the addon compartment menu.

## Development

### Prerequisites

- [luacheck](https://github.com/mpeterv/luacheck) for linting
- Git submodules for local library development

### Setup

```bash
git clone <repo-url>
cd $ARGUMENTS
git submodule update --init --recursive
```

### Lint

```bash
luacheck .
```

## License

MIT
```

### Step 12: Print Summary

After creating all files, print a summary of:
- Total files created
- Directory structure overview
- Next steps (git init, add submodules, customize TOC metadata)
