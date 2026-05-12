# WoW Annotations Tree Inventory

- **Date**: 2026-05-08
- **Scope**: Map the LuaLS-style WoW API annotation trees under `~/.local/share/wow-annotations/`, plus the sibling trees `wow-framexml/` and `wow-libs/` they integrate with.
- **Delegation**: Caller wants a structural inventory of what is present so a tool designer can decide what queries are answerable. Read-only; no design.

## 0. Important up-front correction

The path `~/.local/share/wow-annotations/` is **a clone of the `Ketho/vscode-wow-api` repo**, not a flat annotation tree. The actual LuaLS annotations live under its `Annotations/` subdirectory. Two **sibling** directories also exist and are relevant:

- `~/.local/share/wow-annotations/` - Ketho vscode-wow-api repo (curated annotations + generator). 196 MB. Git HEAD `539c3b22` (2026-04-09).
- `~/.local/share/wow-framexml/` - NumyAddon `FramexmlAnnotations` checkouts, four flavor branches as sibling directories. 205 MB. Not a git repo at the root (the flavor dirs are checkouts, not workdirs).
- `~/.local/share/wow-libs/` - third-party addon source (currently only ElvUI). 15 MB. Git HEAD `1649307` (2026-04-19).

README at `wow-annotations/README.md:4-6` advertises three flavor versions: mainline 12.0.1, mists 5.5.3, vanilla 1.15.8.

## 1. Top-level layout of `wow-annotations/`

`ls /Users/lasn/.local/share/wow-annotations/`:

| Entry | Kind | One-line purpose (from contents) |
| --- | --- | --- |
| `Annotations/` | dir | The actual LuaLS annotation tree shipped to consumers. Contains `Core/` and `FrameXML/`. **This is the payload.** |
| `wowdoc/` | dir | Lua-based generator/scraper that builds the annotations. Pulls from wago.tools, warcraft.wiki.gg, Gethe/wow-ui-source. |
| `luasrc/` | dir | Auxiliary Lua scripts: `parseWiki.lua`, `annotate/`, `WikiParser/`, `ToTypeScript/`, `custom_doc/`, `demo/`. Generator helpers. |
| `src/` | dir | TypeScript source for the VS Code extension itself (`extension.ts`, `luals.ts`, `providers/`, `data/`, `state.ts`). |
| `setup/` | dir | Bootstrap scripts: `lua.sh`, `npm.sh`, README, rockspec. |
| `img/` | dir | Screenshots/GIFs referenced by `README.md`. |
| `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.mjs`, `.vscode/`, `.vscode-test.mjs`, `.vscodeignore` | files | VS Code extension build config. |
| `CHANGELOG.md`, `README.md`, `LICENSE` | files | Project metadata. README at lines 4-6 declares supported game flavors. |

## 2. The `Annotations/` payload tree

Two top-level directories: `Annotations/Core/` and `Annotations/FrameXML/`.

### Annotations/Core/ (8 subdirs)

| Subdir | File count | Contents |
| --- | --- | --- |
| `Blizzard_APIDocumentationGenerated/` | 324 | One file per API namespace, e.g. `AccountInfoDocumentation.lua`, `AuctionHouseDocumentation.lua`, `ActionBarFrameDocumentation.lua`. Generated from official Blizzard `Blizzard_APIDocumentationGenerated` source. Documents `C_*` namespace functions. |
| `Data/` | 5 | Aggregated alias/enum tables: `Event.lua` (1729 lines), `Enum.lua` (10352 lines), `CVar.lua` (1613 lines), `Wiki.lua` (9139 lines), `Classic.lua` (9 lines, classic-only overrides). |
| `FrameXML/` | 6 subdirs | Curated FrameXML helpers split by namespace: `Blizzard_Deprecated/` (15 dated files), `Blizzard_FrameXML/` (6 utility files), `Blizzard_Menu/` (8), `Blizzard_NamePlates/` (1), `Blizzard_ObjectAPI/` (5: ContinuableContainer, Item, ItemLocation, PlayerLocation, Spell), `Blizzard_SharedXML/` (14). Note this is **curated**, not the bulk auto-generated source. |
| `Libraries/` | 14 | Library annotations: `Ace3/` (14 subfiles incl. `AceEvent-3.0.lua`, `AceConfig-3.0/`, `AceDB-3.0.lua`, `AceGUI-3.0/`, `AceAddon-3.0.lua`, etc.), `LibStub/`, `CallbackHandler-1.0/`, `LibSharedMedia-3.0/`, `LibDeflate/`, `LibDataBroker-1.1/`, `LibDBIcon-1.0/`, `HereBeDragons-2.0/`, `LibSink-2.0/`, `LibQTip-1.0/`, `LibTextDump-1.0/`, `LibDualSpec-1.0/`, `LibDialog-1.0/`, `ChatThrottleLib/`. |
| `Lua/` | 7 | Lua 5.1 stdlib stubs adjusted for WoW: `string.lua` (242 lines), `table.lua`, `math.lua`, `os.lua`, `bit.lua`, `basic.lua`, `compat.lua`. Header notes WoW's added/removed stdlib functions. |
| `ScriptObject/` | 9 | Misc script object types: `CurveObject.lua`, `ColorCurveObject.lua`, `DurationObject.lua`, `HousingCatalogSearcher.lua`, `UnitHealPredictionCalculator.lua`, etc. |
| `Type/` | 9 | Type aliases and structures not documented by Blizzard: `Mixin.lua` (12-line alias map), `Structure.lua` (64 lines, `AuraData`, `UiMapPoint`, ...), `Namespace.lua`, `BlizzardType.lua`, `EmoteToken.lua`, `UnitToken.lua`, `StringEnum.lua`, `GlobalColors.lua`, `FunctionContainer.lua`. |
| `Widget/` | 7 subdirs / 59 files total | Widget hierarchy: `Animation/` (11), `Base/` (11: `Region.lua`, `ScriptRegion.lua`, `Object.lua`, `AnimatableObject.lua`, ...), `Frame/` (Frame.lua + Button/, Model/, POIFrame/ subdirs), `Font/`, `Texture/`, `Intrinsic/` (`DropdownButton.lua`, `EventFrame.lua`), `UIType/`. |

Total `.lua` files in `Annotations/Core/FrameXML/`: 49. In `Annotations/Core/Widget/`: 59. In `Annotations/Core/Libraries/`: 52.

### Annotations/FrameXML/ (NumyAddon-style)

`Annotations/FrameXML/Annotations/` contains **3 entries**:
- `_enums.lua.annotated.lua` - aggregated `EnumUtil.MakeEnum` enums extracted from FrameXML source.
- `_templates.lua.annotated.lua` - intrinsic frame templates.
- `AddOns/` - **307 subdirectories**, one per Blizzard `Blizzard_*` AddOn (`Blizzard_AccessibilityTemplates/`, `Blizzard_ActionBar/`, `Blizzard_AchievementUI/`, ..., `Blizzard_AdventureMap/`, ...).

`Annotations/FrameXML/README.md` describes this as auto-generated from `Gethe/wow-ui-source` and lists 10 game-flavor branches (live, ptr, ptr2, beta, classic, classic_ptr, classic_beta, classic_anniversary, classic_era, classic_era_ptr) - though only one flavor is materialised inside this repo. The other flavors are in the sibling `wow-framexml/` tree (see §4).

## 3. Representative file shapes

### 3a. `Annotations/Core/Blizzard_APIDocumentationGenerated/AccountInfoDocumentation.lua` (17 lines, very small)

```
1: ---@meta _
2: C_AccountInfo = {}
3:
4: ---[Documentation](https://warcraft.wiki.gg/wiki/API_C_AccountInfo.GetIDFromBattleNetAccountGUID)
5: ---@param battleNetAccountGUID WOWGUID
6: ---@return number battleNetAccountID
7: function C_AccountInfo.GetIDFromBattleNetAccountGUID(battleNetAccountGUID) end
```

**Characterisation.** One file per `C_*` namespace. Pattern: declare table, then one `---@param` / `---@return` block + `function NS.Method() end` stub per API, with a wiki link in a `---[Documentation](...)` comment. No bodies. Pure interface.

### 3b. `Annotations/Core/Data/Event.lua` (1729 lines)

```
1: ---@meta _
2: ---@alias FrameEvent string
3: ---|"ACCOUNT_CHARACTER_CURRENCY_DATA_RECEIVED"
4: ---|"ACCOUNT_CVARS_LOADED"
...
17: ---|"ACTIONBAR_SLOT_CHANGED" # `slot`
21: ---|"ACTION_RANGE_CHECK_UPDATE" # `slot, isInRange, checksRange`
407: ---|"COMBAT_LOG_EVENT_UNFILTERED"
919: ---|"LOOT_OPENED" # `autoLoot, isFromItem`
1146: ---|"PLAYER_LOGIN"
```

**Characterisation.** Single `@alias FrameEvent string` literal-union. Each event is one line. Payload args are encoded after `#` as a backtick-quoted comma list (or absent if no payload). No type annotations on the payload args - they're string descriptions, not LuaLS types. `COMBAT_LOG_EVENT_UNFILTERED` has no payload listed (it's traditionally accessed via `CombatLogGetCurrentEventInfo()`).

### 3c. `Annotations/Core/Widget/Frame/Frame.lua` (555 lines)

```
1: ---@meta _
2: ---[Documentation](https://warcraft.wiki.gg/wiki/UIOBJECT_Frame)
3: ---@class Frame : Region, ScriptObject
4: local Frame = {}
5: ---@class frame : Frame
6: ---@class FRAME : Frame
7:
8: ---@param scriptType ScriptFrame
9: ---@param bindingType? LE_SCRIPT_BINDING_TYPE
10: ---@return function handler
12: function Frame:GetScript(scriptType, bindingType) end
```

**Characterisation.** Widget files declare an `@class` with parents (Frame's lineage: `Region` → `ScriptRegion`/`ScriptRegionResizing`/`AnimatableObject` → `Object`), then list methods via `Frame:Method()` stubs. Lowercase aliases (`frame`, `FRAME`) provided for case-insensitive intrinsic templates. Wiki links per method. Used by LuaLS to resolve `myFrame:SetScript(...)` chains.

### 3d. `Annotations/Core/Libraries/Ace3/AceEvent-3.0.lua` (55 lines)

```
1: ---@meta _
7: ---@class AceEvent-3.0
8: local AceEvent = {}
10: ---@param event FrameEvent The event to register for
11: ---@param callback? function|string The callback function to call when the event is triggered (funcref or method, defaults to a method with the event name)
13: --- ---
14: ---[Documentation](https://www.wowace.com/projects/ace3/pages/api/ace-event-3-0#title-1)
15: function AceEvent:RegisterEvent(event, callback, arg) end
```

**Characterisation.** Libraries follow the same `@class` + method-stub pattern as widgets, but with library docs URLs (wowace.com) instead of wiki. Notably the `event` param re-uses `FrameEvent` from `Annotations/Core/Data/Event.lua`, so cross-file event-name completion works inside `RegisterEvent`. Param descriptions are inline strings, not just types.

### 3e. `Annotations/Core/Type/Structure.lua` (64 lines, head shown)

```
4: ---@class AuraData
5: ---@field applications number
6: ---@field auraInstanceID number
7: ---@field canApplyAura boolean
...
26: ---@field spellId number
27: ---@field timeMod number
29: ---@class UiMapPoint
30: ---@field uiMapID number
```

**Characterisation.** Plain `@class Foo` + `@field` lists for return-shape structures Blizzard does not formally document. No methods, no constructors. Header comment line 2: `-- these structures are not documented by Blizzard`. Hand-curated.

### 3f. `Annotations/Core/Lua/string.lua` (242 lines)

```
1: ---@meta string_wow
2: --- added: string.join, string.rtgsub, string.split, strsplittable, string.trim
3: --- added: strcmputf8i, strlenutf8, strconcat, tostringall
4: --- removed: string.dump, string.pack, string.packsize, string.unpack
13: ---@class stringlib
14: string = {}
17: ---Returns the internal numeric codes of the characters `s[i], s[i+1], ..., s[j]`.
21: ---@param s  string|number
22: ---@param i? integer
23: ---@param j? integer
24: ---@return integer ...
25: ---@nodiscard
```

**Characterisation.** Standard LuaLS stdlib annotations forked to mark WoW's added/removed functions (header notes). `@meta string_wow` distinguishes from default LuaLS string lib.

### 3g. `Annotations/Core/Data/Classic.lua` (9 lines, full file)

```
1: ---@meta
2: --- cata, vanilla
3: ---@param spell number|string
4: ---@return number start
5: ---@return number duration
6: ---@return number enabled
7: ---@return number modRate
8: ---@overload fun(index: number, bookType: string)
9: function GetSpellCooldown(spell) end
```

**Characterisation.** Tiny override file documenting flavor-specific signatures (here, classic's `GetSpellCooldown` extra params). Not a separate flavor tree - just patches mixed in.

## 4. Multiple flavors

Inside `wow-annotations/` itself there is **no** separate retail/classic/era tree. Flavor handling is single-tree with overrides:

- `Annotations/Core/Data/Classic.lua` - 9 lines of classic/cata-specific signatures (see §3g).
- `wowdoc/products.lua:6-15` declares aliases `TactProduct` covering `wow`, `wow_beta`, `wowt`, `wowxptr`, `wow_classic`, `wow_classic_ptr`, `wow_classic_beta`, `wow_classic_era`, `wow_classic_era_ptr`, `wow_anniversary`, `wow_classic_titan`.
- `wow-annotations/README.md:4-6` advertises three game-version targets but they are produced by re-running the generator, not co-located.

The **flavor-specific FrameXML annotations live in the sibling tree**, see §5.

## 5. FrameXML source / annotated source

### Sibling tree `~/.local/share/wow-framexml/` (205 MB, four flavors materialised)

| Flavor dir | Size | Layout |
| --- | --- | --- |
| `live/` | 43 MB | `Annotations/AddOns/` (312 Blizzard_* subdirs) + `Annotations/_enums.lua.annotated.lua` + `Annotations/_templates.lua.annotated.lua` + `README.md`. |
| `classic/` | 29 MB | Same shape (Annotations/, README.md). |
| `classic_anniversary/` | 27 MB | Same shape. |
| `classic_era/` | 24 MB | Same shape. |

Total `*.annotated.lua` files in `live/`: **3016**. README.md text matches the README in `wow-annotations/Annotations/FrameXML/`, both reference NumyAddon `FramexmlAnnotations`.

Naming convention: original Blizzard files `Foo.lua` and `Foo.xml` are emitted as `Foo.lua.annotated.lua` and `Foo.xml.annotated.lua`. The `.annotated.lua` body **is the original Blizzard source code** (not just stubs) with LuaLS annotation comments added inline. Example head of `wow-framexml/live/Annotations/AddOns/Blizzard_DamageMeter/DamageMeter.lua.annotated.lua`:

```
1: local DAMAGE_METER_ENABLED_CVAR = "damageMeterEnabled";
2: CVarCallbackRegistry:SetCVarCachable(DAMAGE_METER_ENABLED_CVAR);
4: local MAX_DAMAGE_METER_SESSION_WINDOWS = 3;
5: local PRIMARY_SESSION_WINDOW_INDEX = 1;
8: local DefaultDamageMeterPerCharacterSettings = {
9: 	windowDataList = {};
10: };
```

This is **real Blizzard source for read/grep**, not just an interface.

`wow-framexml/live/Annotations/_enums.lua.annotated.lua` head:

```
1: --- @meta _
3: --- [Source](https://github.com/Gethe/wow-ui-source/blob/live/Interface/AddOns/Blizzard_FrameXMLBase/Mainline/IconDataProvider.lua#L45)
4: --- @enum IconDataProviderIconType
5: local IconDataProviderIconType = {
6:     ["Spell"] = 1,
7:     ["Item"] = 2,
8: }
```

One example AddOn dir per flavor (live): `wow-framexml/live/Annotations/AddOns/Blizzard_DamageMeter/`. Top-level AddOn directory list in `live/` first 10: Blizzard_AccessibilityTemplates, Blizzard_AccountSaveUI, Blizzard_AccountStore, Blizzard_AchievementUI, Blizzard_ActionBar, Blizzard_ActionBarController, Blizzard_ActionStatus, Blizzard_AddOnList, Blizzard_AddOnPerformance, Blizzard_AdventureMap.

### Sibling tree `~/.local/share/wow-libs/ElvUI/` (15 MB)

Contains real third-party addon source (ElvUI), not annotations. Subdirs: `ElvUI/`, `ElvUI_Libraries/`, `ElvUI_Options/`, plus `CHANGELOG.md`, `LICENSE.md`, `Makefile`, `README.md`, `ThirdPartyNotices.md`. TOC files for five flavors found: `ElvUI_Mainline.toc`, `ElvUI_Mists.toc`, `ElvUI_Wrath.toc`, `ElvUI_TBC.toc`, `ElvUI_Vanilla.toc`. Git HEAD `1649307` (2026-04-19, "Skins: better icons for pvp ~Tsxy"). This appears to be a reference addon checkout, not part of the annotation system per se.

## 6. Event payloads (specific request)

File: `Annotations/Core/Data/Event.lua`, 1729 lines, single `@alias FrameEvent string` union. Verbatim entries for the requested events:

```
407: ---|"COMBAT_LOG_EVENT_UNFILTERED"
919: ---|"LOOT_OPENED" # `autoLoot, isFromItem`
1146: ---|"PLAYER_LOGIN"
```

Surrounding `COMBAT_LOG_EVENT*` family:

```
405: ---|"COMBAT_LOG_EVENT"
406: ---|"COMBAT_LOG_EVENT_INTERNAL_UNFILTERED"
407: ---|"COMBAT_LOG_EVENT_UNFILTERED"
408: ---|"COMBAT_LOG_MESSAGE" # `message, colorR, colorG, colorB, order`
409: ---|"COMBAT_LOG_MESSAGE_LIMIT_CHANGED" # `messageLimit`
410: ---|"COMBAT_LOG_REFILTER_ENTRIES"
```

**Format note.** Payload args are encoded as a backtick-quoted comma-separated arg name list following `#`. Types are NOT annotated. Events with no payload have no `#` suffix. Some events have payloads of varying length (1-5 args observed in samples).

## 7. Anomalies / generated-vs-curated indicators / notes

- **Generated vs curated split is explicit.**
  - Generated: `Annotations/Core/Blizzard_APIDocumentationGenerated/` (324 files, mirrors Blizzard's own doc generator), `Annotations/FrameXML/` and the entire `wow-framexml/` sibling tree (NumyAddon's auto-pull).
  - Curated: `Annotations/Core/Type/Structure.lua` ("these structures are not documented by Blizzard"), `Annotations/Core/Data/Classic.lua` (manual flavor patches), `Annotations/Core/Lua/*.lua` (manual WoW Lua 5.1 stdlib deltas), `Annotations/Core/FrameXML/Blizzard_*/` (small curated set: 6 dirs vs 307 in the auto-generated FrameXML/AddOns), `Annotations/Core/Widget/` (hand-built widget hierarchy), `Annotations/Core/Libraries/` (per-library curation).
- **Same data appears in two shapes.** Enums exist as both `Annotations/Core/Data/Enum.lua` (10352 lines, single aggregated file) AND `wow-framexml/live/Annotations/_enums.lua.annotated.lua` (extracted from FrameXML source). Likely overlap but not identical (the latter is `EnumUtil.MakeEnum`-based, the former is the `Enum.*` C-side table). Worth verification before treating as redundant.
- **`@meta _` vs `@meta`.** Most files use `---@meta _` (private/anonymous module). `Annotations/Core/Data/Classic.lua:1` uses bare `---@meta`. `Annotations/Core/Lua/string.lua:1` uses `---@meta string_wow`. LuaLS treats these differently (`@meta _` = anonymous, `@meta name` = named module). Could affect how a tool dedups across flavors.
- **`Wiki.lua` is 9139 lines** of global functions (no namespace) parsed from warcraft.wiki.gg. This is the bag of legacy pre-`C_` globals (`AbandonSkill`, `AcceptDuel`, `AcceptQuest`, ...). Sample at `Annotations/Core/Data/Wiki.lua:1-25`.
- **Deprecated APIs preserved per patch.** `Annotations/Core/FrameXML/Blizzard_Deprecated/` has 15 files like `Deprecated_11_0_5.lua`, `Deprecated_11_2_0.lua` - one per game patch. Useful for "when was X removed?" queries.
- **Versions stamped in README** (`wow-annotations/README.md:4-6`): mainline 12.0.1, mists 5.5.3, vanilla 1.15.8. No version stamp inside the annotation files themselves that I observed.
- **wowdoc/ is the build system, not data.** `wowdoc/init.lua`, `wowdoc/products.lua`, `wowdoc/wago.lua`, `wowdoc/wiki/`, `wowdoc/git/`, `wowdoc/types/get_types.lua`. If a query needs to know provenance ("was this from wago, wiki, or Gethe?") that mapping lives here.
- **`wow-framexml/` is not a git repo at the root** - the four flavor dirs each look like checkouts of separate branches. README files inside each flavor link back to the NumyAddon GitHub branches.
- **No build manifest / index file** found that enumerates "all events", "all enums", "all C_ namespaces" in a single machine-readable form. Each of those is recoverable from a single file (`Event.lua`, `Enum.lua`, the `Blizzard_APIDocumentationGenerated/` dir) but not pre-extracted.
- **`Annotations/Core/FrameXML/Blizzard_FrameXML/` only has 6 files** (AuraUtil, BNet, ItemUtil, ReportFrame, TransmogUtil, UIParent) - very narrow curated subset, not exhaustive. The exhaustive FrameXML lives in `wow-framexml/`.

## Sibling-tree summary table

| Tree | Role | Style | Flavors materialised | Size |
| --- | --- | --- | --- | --- |
| `wow-annotations/Annotations/Core/` | Hand-curated + Blizzard-doc-generated annotations (interface stubs, no bodies) | LuaLS `@meta`, `@class`, `@field`, `@param`, `@return`, `@alias` literal-unions | One unified tree with `Classic.lua` patch | ~ small (interface only) |
| `wow-annotations/Annotations/FrameXML/` | Auto-generated annotations from FrameXML source | `.annotated.lua` files (interface only here, despite name) | One flavor (live, implicit) | medium |
| `wow-framexml/{live,classic,classic_anniversary,classic_era}/Annotations/` | Auto-generated annotations co-located with **full Blizzard source bodies** | `Foo.lua.annotated.lua` and `Foo.xml.annotated.lua` (real source + inline annotations) | Four | 24-43 MB each |
| `wow-libs/ElvUI/` | Reference third-party addon source | Real Lua/XML, no `@meta` | All five flavors via TOC variants | 15 MB |
