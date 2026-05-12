---
description: Scaffold a new WoW addon project with full directory structure, Ace3 integration, companion Options addon, CI workflows, and build tooling. Platform facts (interface numbers, current library versions, packager directives, deprecated APIs) are researched by the wow-addon agent; software-engineer authors the files.
agent: software-engineer
---

# Scaffold New Addon: $ARGUMENTS

Create a complete WoW addon project for **$ARGUMENTS**.

`software-engineer` is the executing agent for this command. The scaffold templates below are the baseline; the substantive content (directory layout, library set, TOC structure, dotfiles, CI flow) is fixed by this command. The only things that change between runs are **platform facts** — current `## Interface:` numbers per flavor, current canonical Ace3 / LibStub / CallbackHandler versions, current packager directive set, and any APIs in the templates that have become deprecated. Those facts are researched by the `wow-addon` agent before any files are written.

## Inputs

- `$ARGUMENTS` — addon base name (used for the folder, the namespace global `${ARGUMENTS}NS`, the SavedVariable `${ARGUMENTS}_DB`, and the slash command).

The templates below default to a multi-flavor addon (retail + Vanilla/Classic Era + Cata Classic) with an Ace3 stack, a companion Options addon, and the Xerrion `wow-workflows` reusable CI. If the user specifies a different flavor target or asks to drop the Options companion / Ace3 stack, adjust accordingly — the templates are TEMPLATE choices, not load-bearing.

## Step 1 — Delegate Platform-Fact Research to `wow-addon`

Before writing any files, delegate a single research task to the `wow-addon` agent. This agent has read-only platform tools (wiki fetch, Blizzard source lookup, API/event lookups, lint) and will return facts, not code.

Ask `wow-addon` for:

1. **Current `## Interface:` numbers** for each flavor we're scaffolding:
   - retail (Mainline)
   - Vanilla / Classic Era
   - Cata Classic
   - Mists of Pandaria Classic (if currently shipping)
   - Note any flavor that has reached end-of-life so it can be dropped from the TOC matrix.
2. **Current canonical Ace3 module versions and library set.** Confirm the embed list below is still the standard set:
   `LibStub`, `CallbackHandler-1.0`, `AceAddon-3.0`, `AceDB-3.0`, `AceEvent-3.0`, `AceConsole-3.0`, `AceLocale-3.0`, `AceTimer-3.0`, `LibSharedMedia-3.0`, `LibDataBroker-1.1`, `LibDBIcon-1.0`. Flag any that have been superseded or any commonly-needed addition.
3. **Current packager directive set.** Confirm the `@retail@ … @end-retail@` / `@classic@` / `@version-cata@` style directives below match the current BigWigs packager docs. Flag any directive that's been renamed.
4. **`.pkgmeta` `externals:` URLs.** Confirm the WowAce SVN URLs below are still the canonical sources, and whether any library has migrated to a Git mirror that the packager prefers.
5. **Deprecated APIs in the Core Lua templates.** Research (mentally or via tool) the Core/Init.lua, Core/Config.lua, and Locales/enUS.lua templates below; flag any API call that is deprecated or has flavor-gated behavior.
6. **Reusable workflow versions.** Confirm `Xerrion/wow-workflows/.github/workflows/*.yml@main` is still the right reference (vs a pinned tag).

`wow-addon` returns a research note. `software-engineer` then proceeds to Step 2 with concrete numbers and confirmed names slotted into the templates. If `wow-addon` flags a deprecation or version mismatch, update the template *before* writing files; do not write files first and patch later.

## Step 2 — Create Directory Structure

Create the full project layout. (TEMPLATE: this is the standard DragonLoot/DragonToast layout. Override per-project if the delegation specifies otherwise.)

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

## Step 3 — Generate TOC Files

Use the **interface numbers returned by `wow-addon` in Step 1** for each flavor. The numbers below (`110100`, `11507`, `40402`) are illustrative defaults — replace with whatever Step 1 returned.

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

Generate `_Vanilla.toc` and `_Cata.toc` variants with the appropriate interface numbers from Step 1. If Step 1 reported a directive rename, use the renamed form throughout.

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

Generate the `_Vanilla` and `_Cata` Options TOC variants alongside.

## Step 4 — Generate Core Files

If Step 1 flagged any deprecated API in these templates, swap to the current equivalent before writing.

**`Core/Config.lua`** — Default configuration with AceDB defaults structure:
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

**`Core/Init.lua`** — Ace3 addon initialization:
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

**`Core/Utils.lua`** — Utility functions namespace:
```lua
local ADDON_NAME, ns = ...
ns.Utils = {}
```

**`Locales/enUS.lua`** — Base locale file:
```lua
local ADDON_NAME, ns = ...
local L = LibStub("AceLocale-3.0"):NewLocale(ADDON_NAME, "enUS", true)
if not L then return end
L["addon_loaded"] = "%s loaded."
```

## Step 5 — Generate Options Files

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

**`$ARGUMENTS_Options/Core.lua`** — Options panel initialization with global bridge:
```lua
local ns = _G["$ARGUMENTSNS"]
if not ns then return end
-- Options panel setup
```

**`$ARGUMENTS_Options/Tabs/General.lua`** — First options tab:
```lua
local ns = _G["$ARGUMENTSNS"]
if not ns then return end
-- General settings tab
```

## Step 6 — Generate embeds.xml

Use the library set confirmed by `wow-addon` in Step 1. If the agent flagged additions or removals, adjust the `<Include>` / `<Script>` lines accordingly.

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

## Step 7 — Generate .pkgmeta

Use the `externals:` URLs confirmed by `wow-addon` in Step 1. If a library has migrated, update the URL before writing.

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

## Step 8 — Generate .luacheckrc

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

## Step 9 — Generate CI Workflows

Use the workflow ref confirmed by `wow-addon` in Step 1 (defaults to `@main`; switch to a pinned tag if recommended).

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

## Step 10 — Generate Dotfiles

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

**`.gitmodules`** (empty placeholder — user adds submodules for local dev):
```
```

## Step 11 — Generate README.md

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

## Step 12 — Verification

`software-engineer` verifies the scaffold is structurally sound:

1. **Lua syntax check.** Run `luacheck .` against the new addon root (excluding `Libs/`, which is empty until externals are fetched). Expect zero errors; warnings about unused `ADDON_NAME` are acceptable since the templates are starter stubs.
2. **TOC sanity.** Confirm each `.toc` file has a non-empty `## Interface:` line that matches what `wow-addon` returned in Step 1, and that every file path listed in the TOC actually exists on disk.
3. **embeds.xml well-formed.** Confirm the XML parses (any XML tool, or a simple parse via the project's standard tooling).
4. **`.pkgmeta` valid YAML.** Confirm the file parses as YAML.

If any check fails, fix the generated file and re-run that single check. Do not proceed to Step 13 with failing verification.

## Step 13 — Print Summary

Print a summary:
- Total files created.
- Directory structure overview.
- Platform-fact deltas applied from Step 1 (e.g. "interface bumped to NNNNNN per wow-addon", "swapped Lib X for Y per wow-addon").
- Next steps for the user: `git init`, add submodules for local Ace3 dev, customize TOC metadata (Author, Notes, Curse/Wago/WoWI IDs), implement first feature.

## Mandatory Review

Per standard build protocol, the orchestrator runs `reviewer` on the generated scaffold after this command completes. `software-engineer` does not invoke `reviewer` directly; it returns control to the orchestrator, which performs the review handoff.
