---
name: wow-addon-dev
description: World of Warcraft addon development with LuaLS API annotations. Load when writing, reviewing, or debugging WoW addon Lua code. Provides accurate API signatures via wow-api-lookup, behavioral docs via wow-wiki-fetch, event payload info via wow-event-info, Blizzard source browsing via wow-blizzard-source, and static analysis via wow-addon-lint.
---

# World of Warcraft Addon Development

## API Annotations

Local LuaLS annotations are available at `~/.local/share/wow-annotations/Annotations/` covering:

| Directory | Content |
|-----------|---------|
| `Core/Blizzard_APIDocumentationGenerated/` | 324 files - one per C_ namespace/API (e.g. C_LootHistory, C_Item) |
| `Core/Widget/` | Frame widgets: StatusBar, Button, Frame, Texture, Font, Animation |
| `Core/Type/` | Blizzard types, Enums, Events, Structures, Mixins |
| `Core/Data/` | Classic-specific data, CVars, Enums, Events |
| `Core/Libraries/` | Ace3, LibSharedMedia-3.0, LibDataBroker-1.1, LibDBIcon-1.0, LibStub |
| `Core/Lua/` | Lua 5.1 standard library |
| `Core/ScriptObject/` | Script object definitions |
| `FrameXML/Annotations/` | FrameXML annotations |

## When to Look Up APIs

**ALWAYS** use the `wow-api-lookup` tool before writing or reviewing code that calls:

- Any `C_*` namespace function (C_LootHistory, C_Item, C_Container, etc.)
- Widget methods (StatusBar:SetMinMaxValues, Frame:SetBackdrop, etc.)
- Global WoW API functions (GetLootSlotInfo, GetItemInfo, CreateFrame, etc.)
- Enums (Enum.ItemQuality, Enum.PowerType, etc.)
- Ace3 library methods when unsure of signatures

**DO NOT** guess at API signatures, parameter counts, return values, or enum values. The annotations are the source of truth.

## Tool Decision Matrix

| Situation                                     | Tool                     |
|-----------------------------------------------|--------------------------|
| Need API function signature/params/returns    | `wow-api-lookup`         |
| Need behavioral details, caveats, examples    | `wow-wiki-fetch`         |
| Writing an event handler, need payload info   | `wow-event-info`         |
| Want to see how Blizzard implements something | `wow-blizzard-source`    |
| Reviewing code quality before commit          | `wow-addon-lint`         |
| Need current interface version numbers        | wago.tools (manual)      |

---

## How to Use wow-api-lookup

Searches local LuaLS annotation files for API function signatures, widget types, enums, and library definitions.

### Parameters

- `query` (required) - API name, function, namespace, widget, or keyword
- `category` (optional) - Narrow search: `api`, `widget`, `type`, `data`, `library`, `lua`, `framexml`, `all`

### Examples

| Goal | Query | Category |
|------|-------|----------|
| Check C_LootHistory functions | `C_LootHistory` | `api` |
| Get GetLootSlotInfo signature | `GetLootSlotInfo` | `api` |
| StatusBar widget methods | `StatusBar` | `widget` |
| Item quality enum values | `Enum.ItemQuality` | `type` |
| CreateFrame signature | `CreateFrame` | |
| Ace3 AceDB API | `AceDB` | `library` |
| String library functions | `string.find` | `lua` |

### Workflow

1. Before writing any WoW API call, look it up first
2. Check parameter types and order - they differ between Retail and Classic
3. Check return value count and types - many APIs return multiple values
4. When reviewing existing code, verify API usage matches annotations
5. Pay attention to `---@return` annotations with `?` (nullable returns)

---

## How to Use wow-wiki-fetch

Fetches detailed behavioral documentation from warcraft.wiki.gg. Use this when you need more than just a signature - gotchas, edge cases, caveats, real-world examples, and patch history.

### Parameters

- `query` (required) - API function name, event name, or widget type
- `type` (optional) - Override auto-detection: `auto`, `function`, `c_api`, `event`, `widget`

### What It Returns

- Full description and usage details
- Parameter explanations with behavioral notes
- Return value semantics
- Caveats and known issues
- Patch history showing when behavior changed

### Examples

| Goal | Query | Type |
|------|-------|------|
| Understand GetLootSlotInfo behavior | `GetLootSlotInfo` | `function` |
| Check C_Item.GetItemInfo caveats | `C_Item.GetItemInfo` | `c_api` |
| LOOT_OPENED event details | `LOOT_OPENED` | `event` |
| Frame widget documentation | `Frame` | `widget` |
| Let the tool auto-detect | `GetSpellInfo` | |

### When to Use

- `wow-api-lookup` tells you the signature; `wow-wiki-fetch` tells you the **behavior**
- Use when you suspect edge cases or version-specific quirks
- Use when patch history matters (deprecated params, changed return values)
- **ALWAYS** check the wiki for APIs that return cached/async data (item info, spell info)

---

## How to Use wow-event-info

Looks up WoW event names, payload parameters, and related events. Parses all 1,727 events from the annotation files. Supports exact match, prefix match, and substring match.

### Parameters

- `query` (required) - Event name (exact or partial)
- `wiki` (optional, boolean, default `false`) - Also fetch the warcraft.wiki.gg page for full payload documentation

### What It Returns

- Event name and payload field descriptions
- Related events sharing the same prefix
- With `wiki: true`, full wiki documentation for the event

### Examples

| Goal | Query | Wiki |
|------|-------|------|
| Exact event payload | `LOOT_OPENED` | |
| Find all loot events | `LOOT` | |
| Find achievement events | `ACHIEVEMENT` | |
| Full docs for an event | `LOOT_OPENED` | `true` |

### When to Use

- **ALWAYS** look up events before writing `frame:RegisterEvent()` or `OnEvent` handlers
- Use prefix queries to discover related events you might need to handle
- Set `wiki: true` when payload field names alone are not descriptive enough

---

## How to Use wow-blizzard-source

Searches Blizzard's actual FrameXML source code with LuaLS annotations injected. Source files live at `~/.local/share/wow-annotations/Annotations/FrameXML/Annotations/`.

### Parameters

- `query` (required) - Search term (function name, mixin name, pattern, etc.)
- `scope` (optional) - Addon directory name (e.g. `Blizzard_ActionBar`, `Blizzard_UIFrames`) or file type filter (`lua`, `xml`)
- `mode` (optional) - `search` (default) to find matches, `list` to show all available addon directories

### What It Returns

- Matching source code lines with file context
- In `list` mode, all available Blizzard addon directory names

### Examples

| Goal | Query | Scope | Mode |
|------|-------|-------|------|
| Find a mixin implementation | `FramerateFrameMixin` | `Blizzard_UIFrames` | |
| See how ActionBar handles events | `OnEvent` | `Blizzard_ActionBar` | |
| Search all Lua files | `SecureActionButtonTemplate` | `lua` | |
| List all Blizzard addon dirs | (any) | | `list` |

### When to Use

- Study Blizzard's mixin patterns before writing your own
- Understand how Blizzard manages frames, templates, and event handling
- Find real-world usage examples of obscure APIs
- **DO NOT** copy Blizzard code verbatim - use it to understand patterns, then write your own implementation

### File Types

- `.lua.annotated.lua` - Real Lua source with injected type annotations
- `.xml.annotated.lua` - Type stubs generated from XML template definitions

---

## How to Use wow-addon-lint

Static analysis for common WoW Lua anti-patterns and pitfalls. Run this on completed code before finalizing.

### Parameters

- `target` (required) - Absolute file path or inline Lua code string
- `categories` (optional, array) - Filter to specific check categories

### Lint Categories

| Category | What It Catches |
|----------|-----------------|
| `globals` | Global variable pollution - missing `local` keywords |
| `taint` | Combat taint risks - secure frame modifications in combat |
| `nil-safety` | Missing nil checks on API returns that can be nil |
| `hardcoded-ids` | Magic spell/item ID numbers without named constants |
| `events` | Event hygiene - unregistered events, missing unregister calls |
| `performance` | Tight-loop issues - allocations in OnUpdate, string concat in loops |
| `deprecated` | Removed or deprecated API usage |

### Examples

Lint a file for all issues:
- `target`: `/path/to/MyAddon/Core.lua`

Lint inline code for taint and performance only:
- `target`: `local f = CreateFrame("Frame"); f:SetScript("OnUpdate", function() ... end)`
- `categories`: `["taint", "performance"]`

### When to Use

- **ALWAYS** run after writing or modifying WoW addon Lua code
- Run with specific categories when investigating a known issue type
- Pay special attention to `taint` warnings - these cause silent failures in combat

---

## wago.tools Reference

[wago.tools](https://wago.tools) provides access to WoW's internal database tables and build information.

### DB2 Browser

Browse WoW's internal database tables in the browser:

- **Browse**: `https://wago.tools/db2/{TableName}` - e.g. `https://wago.tools/db2/SpellName`
- **CSV Export**: `https://wago.tools/db2/{TableName}/csv?branch={branch}`

### Branches

| Branch | Flavor |
|--------|--------|
| `wow` | Retail |
| `wow_classic` | Classic |
| `wow_anniversary` | Anniversary |

### Build Tracking

`https://wago.tools/builds` - Current version info for all WoW flavors.

### Useful For

- Looking up spell IDs, item IDs, and other numeric constants
- Downloading table data for code generation or validation
- Checking current interface version numbers for `.toc` files
- Verifying game data when `hardcoded-ids` lint warnings appear

---

## Recommended Workflow

1. **Look up signatures** - Use `wow-api-lookup` before writing any API call
2. **Understand behavior** - Use `wow-wiki-fetch` when you need caveats, edge cases, or examples beyond bare signatures
3. **Check events** - Use `wow-event-info` before writing any event handler to know exact payload parameters
4. **Study patterns** - Use `wow-blizzard-source` to see how Blizzard implements similar UI or logic
5. **Lint before finalizing** - Run `wow-addon-lint` on completed code to catch anti-patterns

---

## Version Differences

Many WoW APIs differ between Retail and Classic. Key things to check:

- **Return value count**: e.g. GetLootSlotInfo returns 10 values on Retail, 6 on Classic
- **Parameter availability**: some parameters only exist in Retail
- **API existence**: some C_ namespaces don't exist in Classic
- **Widget methods**: some widget methods were added in later expansions

When the annotations show version-specific behavior, always handle both paths with defensive nil checks or version guards.

## Annotation Format

The annotations use LuaLS format:

```lua
---@param paramName paramType Description
---@return returnType? optionalReturn
---@class ClassName
---@field fieldName fieldType
```

`?` after a type means nullable/optional. Multiple `---@return` lines indicate multiple return values.
