---
name: wow-addon-toolkit
description: Tool-selection map and annotation-format reference for WoW addon research. Load when researching WoW APIs, events, frame widgets, or Blizzard implementation patterns.
---

# WoW Addon Research Toolkit

A short reference for picking the right research tool and reading the annotations they return. Each tool's parameters and full behavior live in the tool itself; this skill only covers when to prefer one over another.

## Tool selection precedence

- **Documented `C_*` API, widget methods, enums, library signatures** → `wow-api-lookup`. Searches local LuaLS annotations; fastest source of ground truth for signatures, parameter types, and return shapes.
- **Event names, payloads, related events** → `wow-event-info`. Parses the events catalog, supports exact / prefix / substring queries, and can fetch the wiki page for a single event.
- **Behavioral details not encoded in annotations** (caveats, edge cases, patch history, async/cache semantics) → `wow-wiki-fetch`. Prefer this when a signature alone does not explain how the API behaves.
- **Blizzard's own implementation** (mixins, FrameXML templates, real usage of obscure APIs) → `wow-blizzard-source`. Useful for studying patterns; the annotated source is read-only reference, not copy-paste material.

`wow-api-lookup` answers "what is the shape?". `wow-wiki-fetch` answers "how does it behave?". `wow-event-info` answers "what fires this and what does it carry?".

## LuaLS annotation format

Annotations use the LuaLS comment syntax. Common forms:

```lua
---@param paramName ParamType Description
---@return ReturnType? Description   -- ? = nullable
---@class ClassName : OptionalParent
---@field fieldName FieldType Description
---@overload fun(short: string): boolean
```

Multiple `---@return` lines indicate multiple return values, in order. `?` after a type marks it nullable. Generics appear as `---@generic T` and are referenced by name later in the block.

## Multi-flavor reminder

WoW publishes multiple flavors in parallel: Retail (live), Classic (currently Mists of Pandaria Classic), Vanilla (Classic Era), Anniversary, plus PTR and beta variants of any of these. Annotations are scoped per flavor — an API that exists in Retail may be missing, renamed, or have a different return-value count in a Classic flavor. Treat a hit in one flavor's annotations as evidence about that flavor only.

## Runtime version-guard idiom

Addons gate code by flavor at runtime through `WOW_PROJECT_ID` and the `WOW_PROJECT_*` constants:

- `WOW_PROJECT_MAINLINE` — Retail
- `WOW_PROJECT_CLASSIC` — Classic Era (Vanilla)
- `WOW_PROJECT_CATACLYSM_CLASSIC`, `WOW_PROJECT_MISTS_CLASSIC`, `WOW_PROJECT_ANNIVERSARY_CLASSIC` — successive Classic re-releases

A common form is a top-of-file early return:

```lua
if WOW_PROJECT_ID ~= WOW_PROJECT_MAINLINE then return end
```

Build-time exclusion is a separate mechanism: `.toc` files use packager directives such as `#@retail@` / `#@end-retail@` so a flavor's package never ships the file at all.

## wago.tools

[wago.tools](https://wago.tools/) is the canonical browser for WoW's internal database tables (DB2) — spell IDs, item IDs, quest IDs, build/interface numbers per flavor. Useful when an addon references numeric IDs and you need to resolve them to names, or vice versa.
