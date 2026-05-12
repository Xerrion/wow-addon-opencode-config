# Rebuild WoW Addon-Development Tool Surface

- **ADR**: 0001
- **Date**: 2026-05-12
- **Status**: Proposed
- **Request**: Clean-slate rebuild of the WoW addon-dev tool surface (`tools/`) at 4 focused tools, after the previous 10-tool surface was scrapped for design drift, scope creep, and shared-helper bugs.

## Context and Problem Statement

The previous tool surface accumulated to 10 tools across three waves. The recurring failure mode was not any single tool but the cross-cutting layer: a `_shared.ts` graveyard, mode discriminators (`mode: lookup|keyword`, `category: api|widget|...`) that forked tool behaviour, and bugs that recurred across tools (absolute-path leaks in ripgrep output, broken nested fences, wiki extraction anchored on the unstable `mw-parser-output` div, symbol lookups blowing past the 50 KB runtime cap). The user has locked the rebuild to 4 tools, one narrow query shape per tool, no shared helpers in the first cut, and no mode flags.

The data sources are concrete and characterised:
- `~/.local/share/wow-annotations/Annotations/Core/` - curated LuaLS annotations: `Blizzard_APIDocumentationGenerated/` (324 `C_*` files), `Data/Event.lua` (1729 lines, `@alias FrameEvent` literal union), `Data/Enum.lua`, `Widget/` (59 files across `Base/`, `Frame/`, `Font/`, ...), `Libraries/` (52 files), `Lua/`, `Type/`, `ScriptObject/`. Inventory §2.
- `~/.local/share/wow-framexml/{live,classic,classic_anniversary,classic_era}/Annotations/` - four flavour checkouts, each with `AddOns/Blizzard_*/` directories of `*.lua.annotated.lua` and `*.xml.annotated.lua` files containing real Blizzard source + inline annotations. 3016 files in `live/`. Inventory §5.
- `warcraft.wiki.gg` - MediaWiki page tree, stable URL patterns per page type, `id="mw-content-text"` as the reliable outer container, real HTTP 404s for missing pages, silent redirects detectable only via the `wgRedirectedFrom` JS variable. Wiki research §cross-cutting + per-page-type.

The question this ADR answers: **what are the boundaries, inputs, data sources, and output contracts of the 4 rebuilt tools, such that an engineer can build each one in a single self-contained file without reaching for a shared helper?**

## Considered Options

- **A. Four tools, one query shape each, no shared layer** (chosen). Each tool is one `.ts` file. Cross-cutting concerns (flavour resolution, 40 KB cap, error format) are reimplemented per tool with copy-paste tolerated as a feature, not a bug, until a real abstraction emerges in pass 2.
- **B. Four tools sharing a small `_shared.ts` from day one** (rejected). This is what the previous wave did. The user has explicitly forbidden it. Even setting that aside: at 4 tools the duplication is too small to justify the coupling cost, and the previous failure shows that "small" shared helpers attract scope without anyone owning them.
- **C. Two tools with mode discriminators** (e.g. `wow-lookup` with `kind: api|event|widget`, `wow-source` with `kind: wiki|framexml`) (rejected). Compresses the surface count but reintroduces exactly the mode-fork bug source the user named. The fork lives inside the tool body instead of at the surface, which is worse, not better.

## Decision Outcome

We choose **Option A: four self-contained tools with one query shape each**, accepting near-term copy-paste duplication of small concerns (path resolution, fence escaping, byte capping) in exchange for eliminating the shared-helper failure mode and keeping each tool's contract legible in isolation.

The four tools, in order:

1. **`wow-api-lookup`** - symbol-mode lookup of a single named WoW API/widget/library symbol against the curated annotation tree.
2. **`wow-event-info`** - lookup of a single named event's payload and surrounding family from `Data/Event.lua`.
3. **`wow-wiki-fetch`** - fetch and Markdown-render a single named wiki page from `warcraft.wiki.gg`.
4. **`wow-blizzard-source`** - ripgrep over the per-flavour FrameXML source/annotated tree, returning matched lines with bounded context.

### Cross-cutting decisions

**Flavour handling.** Two of the four tools care about flavour: `wow-blizzard-source` (the FrameXML tree is materialised per flavour) and `wow-api-lookup` (only via the curated `Data/Classic.lua` patch file - the curated `Core/` tree is otherwise flavour-neutral). `wow-event-info` and `wow-wiki-fetch` are flavour-agnostic (events are unioned in a single file; the wiki has no flavour toggle, per wiki research §versioning).

Flavour is an explicit zod-enum argument on each tool that needs it, defaulting to `"live"`. Allowed values match the directory names in `~/.local/share/wow-framexml/`: `"live" | "classic" | "classic_anniversary" | "classic_era"`. Rationale: the inventory (§5) shows these four flavours materialised on disk; "retail" and other aliases the previous tool surface accepted were a translation layer that bought nothing. Use the directory name verbatim. No fallback chain (the previous `classic_anniversary -> classic_era` fallback was a feature the user did not ask for and is out of scope for the rebuild).

**Wiki cache policy.** **No cache.** First cut fetches every wiki request fresh. Justification: agents call `wow-wiki-fetch` rarely (it is a deep-dive tool, not a hot path); the wiki is fast (40-200 KB pages, sub-second TTFB); a disk cache introduces invalidation, staleness, and concurrency concerns disproportionate to the benefit at this call volume. If usage data later shows otherwise, add an in-memory LRU keyed by URL with no TTL - that is the cheapest reversal and is explicitly punted to pass 2.

**Bare string vs `{ output, metadata }`.** **Rule: return `{ output, metadata }` only when the tool has a structured fact the caller is likely to programmatically reuse; otherwise return a bare string.** Concretely:
- `wow-api-lookup`: bare string. The output is the rendered annotation block; there is no useful structured side-channel.
- `wow-event-info`: bare string. Same reasoning.
- `wow-wiki-fetch`: `{ output, metadata: { url, redirectedFrom?, categories } }`. `url` is the final resolved URL (after redirect), `redirectedFrom` is the requested slug when `wgRedirectedFrom` was scraped from the page JS (wiki research §redirects flags this as a real footgun: `/wiki/Frame` silently serves the XML element page), `categories` is the parsed footer category list (wiki research §categories - useful disambiguation signal for the caller).
- `wow-blizzard-source`: `{ output, metadata: { flavor, matchCount, truncated } }`. `flavor` echoes the resolved flavour (so the caller can confirm what was searched), `matchCount` is the pre-cap match count, `truncated` is the tool's own truncation flag (distinct from `metadata.truncated` which the runtime reserves - we use a different key, `selfTruncated`, to avoid collision).

**Error message format.** Plain text, single line, lowercase first word, no terminal period. Shape: `<tool-name>: <what was wrong>`. Examples: `wow-api-lookup: query must be non-empty`, `wow-blizzard-source: unknown flavor "wotlk" (expected: live, classic, classic_anniversary, classic_era)`. Thrown via `throw new Error(message)` per the runtime contract. No JSON, no error codes, no structured envelopes - the caller is an LLM agent reading prose.

**Self-cap discipline.** Every tool budgets output to **40 KB** (40000 bytes, not 40 KiB - keep the arithmetic simple) before the runtime's 50 KB cutoff. When the rendered body would exceed 40 KB, the tool truncates and appends a final line: `... output truncated at 40 KB; <how to narrow the query>`. The "how to narrow" hint is tool-specific and stated in each tool section below. This explicitly addresses the previous bug "symbol-mode lookups exceeding 50 KB" - self-capping is non-negotiable and is each tool's own responsibility.

**Bug-class prevention** (each tool is responsible; no shared helper):
- *Absolute-path leaks in ripgrep output*: tools that shell out to `rg` always pass a relative `--path-separator /` and post-process every file-path line to strip the leading directory prefix (`~/.local/share/wow-framexml/live/Annotations/` etc.) before rendering.
- *Broken nested code fences*: when wrapping fetched/extracted content that may itself contain triple-backtick fences, use a fence longer than any run of backticks in the content (e.g. count max backtick run in content, use `n+1` backticks for the outer fence). Each tool implements this inline.
- *Wiki extraction anchored on `mw-parser-output`*: forbidden. `wow-wiki-fetch` extracts from the outer `<div id="mw-content-text">` per wiki research §content-container.

---

### Tool 1: `wow-api-lookup`

**Purpose.** Given an exact symbol name (or a `NS.Method` / `Class:Method` qualified name), return the annotation block for that symbol from the curated annotation tree.

**Args (zod sketch).**
```
{
  query: z.string().min(1),     // exact symbol; e.g. "C_Item.GetItemInfo", "Frame:SetSize", "AceEvent-3.0", "GetUnitName"
}
```
One arg. Resist adding a `category` filter: if the symbol is ambiguous across categories (rare - the curated tree's namespaces rarely collide), the tool returns all matches and lets the caller pick. Resist adding a `flavor` arg: the curated tree is flavour-neutral except for `Data/Classic.lua`, which the tool always surfaces inline as a note when a classic override exists for the symbol.

**Data sources.**
- `~/.local/share/wow-annotations/Annotations/Core/Blizzard_APIDocumentationGenerated/*.lua` (324 files; documented `C_*` namespaces - inventory §2/§3a).
- `~/.local/share/wow-annotations/Annotations/Core/Widget/**/*.lua` (59 files - inventory §3c).
- `~/.local/share/wow-annotations/Annotations/Core/Libraries/**/*.lua` (52 files - inventory §3d).
- `~/.local/share/wow-annotations/Annotations/Core/Data/Wiki.lua` (9139 lines of legacy global APIs - inventory §7).
- `~/.local/share/wow-annotations/Annotations/Core/Data/Classic.lua` (9-line patch file - inventory §3g; checked as an addendum).
- `~/.local/share/wow-annotations/Annotations/Core/Data/Enum.lua` (10352 lines - inventory §2; searched for `Enum.X` shape queries). Note: large file; rg fan-out across this single file is acceptable for now; revisit if performance complaints surface.
- `~/.local/share/wow-annotations/Annotations/Core/Type/*.lua` (structures, mixins - inventory §3e).
- `~/.local/share/wow-annotations/Annotations/Core/FrameXML/**/*.lua` (small curated set, 6 dirs - inventory §2).

Explicitly NOT in this tool's scope: `Annotations/Core/Lua/*.lua` (Lua stdlib - the agent has its own knowledge of stdlib; not worth the search noise).

**Lookup strategy.**
1. Build a regex from `query`. Anchor on the LuaLS function-stub patterns that actually appear in the files:
   - For `NS.Method` (dot): `function\s+<NS>\.<Method>\s*\(` or `function\s+<NS>:<Method>\s*\(` (the curated `ObjectAPI` files use colon despite reading like namespaces).
   - For `Class:Method` (colon): `function\s+<Class>:<Method>\s*\(`.
   - For bare names: `function\s+<Name>\s*\(` OR `^---@class\s+<Name>\b` OR `^<Name>\s*=\s*\{` (library entrypoints declare themselves this way per §3d).
2. Run `rg --max-count <K> --no-heading --line-number --color never -B 8 -A 1 <regex> <data-source-roots>`. The `-B 8` captures the annotation comment block above the stub (LuaLS annotations sit immediately above the `function` line - inventory §3a is the canonical shape).
3. Render each match as: relative file path (`Core/.../Foo.lua`, stripped of the home prefix), then a code fence containing the captured annotation block + signature line.
4. If `Data/Classic.lua` contains an override for the same symbol, append a `## Classic override` section showing it.

**Output shape.**

```
# <query>

## <relative-path>:<line>
```lua
---@param ...
---@return ...
function NS.Method(...) end
```

## <relative-path-2>:<line>
... (additional matches)

## Classic override (Data/Classic.lua:<line>)        ; only if present
```lua
---@overload fun(...)
function NS.Method(...) end
```
```

Self-cap: budget 40 KB. If the symbol matches more times than the budget allows (e.g. a generic name like `OnClick`), render only the first N matches that fit and append: `... output truncated at 40 KB; query is too generic, qualify with NS.Method or Class:Method`.

**No-match body** (returned as a bare string, no throw):
```
# <query>

No symbol found in the curated annotation tree.

Tried: Blizzard_APIDocumentationGenerated/, Widget/, Libraries/, Data/Wiki.lua, Type/, FrameXML/.

If this is a Blizzard source identifier (not a documented C_ API), try wow-blizzard-source. If this is an event name, try wow-event-info. If this is a free-form concept, try wow-wiki-fetch.
```

**Invalid input (throws).** Empty query, query containing newlines, query longer than 200 chars.

**Non-goals.**
- Does NOT do keyword / free-text / fuzzy search. Exact symbol only. The previous tool's `mode: keyword` is a separate concern; if it ever comes back it is a separate tool.
- Does NOT search Lua stdlib annotations.
- Does NOT search the FrameXML source tree (that is `wow-blizzard-source`).
- Does NOT fetch the wiki even when a `---[Documentation](https://...)` link is present in the annotation. The wiki link is rendered as-is in the output; the caller decides whether to follow it via `wow-wiki-fetch`.
- Does NOT resolve mixin/template inheritance chains (deferred to pass 2 if needed).

---

### Tool 2: `wow-event-info`

**Purpose.** Given an exact event name, return its payload signature and the surrounding event family from `Data/Event.lua`.

**Args (zod sketch).**
```
{
  event: z.string().min(1),     // exact event name in UPPER_SNAKE_CASE, e.g. "PLAYER_LOGIN", "COMBAT_LOG_EVENT_UNFILTERED"
}
```
One arg. No fuzzy/prefix mode. The previous tool's `mode: sequence` (curated scenario sequences) is out of scope - a separate tool if ever needed.

**Data source.** Single file: `~/.local/share/wow-annotations/Annotations/Core/Data/Event.lua` (1729 lines, `@alias FrameEvent string` literal union - inventory §3b and §6).

**Lookup strategy.**
1. Normalise `event` to UPPER_SNAKE_CASE.
2. Read `Data/Event.lua` once (1729 lines, ~50 KB - cheap, no need to grep).
3. Find the line matching `^---|"<EVENT>"(\s*#.*)?$`.
4. If found, capture that line plus a configurable window of sibling lines for context. Use a **family window**: walk up and down from the matched line until the event-name prefix (chars before the first underscore, e.g. `COMBAT`, `PLAYER`, `LOOT`) stops matching, OR a max of 30 lines either side, whichever comes first. This surfaces related events without unbounded growth. Inventory §6 demonstrates the value: the `COMBAT_LOG_*` family is contiguous in the file.

**Output shape.** Bare string.

```
# <EVENT_NAME>

## Payload
`<arg1>, <arg2>, ...`     (or `(no payload)` if the source line has no `#` suffix)

## Source
Annotations/Core/Data/Event.lua:<line>

## Related events in the same family
```text
---|"COMBAT_LOG_EVENT"
---|"COMBAT_LOG_EVENT_INTERNAL_UNFILTERED"
---|"COMBAT_LOG_EVENT_UNFILTERED"      ; <- this event
---|"COMBAT_LOG_MESSAGE" # `message, colorR, colorG, colorB, order`
... (family window)
```

## Note
Payload arg types are not annotated in Event.lua; arg names are descriptive only. For full semantics including firing order, fetch the wiki page via wow-wiki-fetch (URL: https://warcraft.wiki.gg/wiki/<EVENT_NAME>).
```

Self-cap: budget 40 KB. The family window's hard cap of 30 lines either side guarantees this in practice; the file's longest contiguous family is well under that.

**No-match body** (bare string, no throw):
```
# <EVENT_NAME>

No event by this exact name in Annotations/Core/Data/Event.lua.

If you suspect a prefix typo, try variants - this tool does not fuzzy-match. The wiki may carry it at https://warcraft.wiki.gg/wiki/<EVENT_NAME> if it is a real event with a misnamed alias.
```

**Invalid input (throws).** Empty event, event containing characters outside `[A-Z0-9_]` after normalisation, event longer than 100 chars.

**Non-goals.**
- Does NOT do prefix / substring / fuzzy search.
- Does NOT carry curated scenario sequences ("addon load", "loot flow"). That was the previous `mode: sequence`; out of scope.
- Does NOT fetch the wiki. Surfaces the URL in the output for the caller to optionally pass to `wow-wiki-fetch`.
- Does NOT resolve `COMBAT_LOG_EVENT_UNFILTERED`'s sub-event tables (those live on the wiki, per wiki research §3).

---

### Tool 3: `wow-wiki-fetch`

**Purpose.** Given a wiki page slug or fully-qualified path, fetch the page from `warcraft.wiki.gg` and return its main content rendered as Markdown.

**Args (zod sketch).**
```
{
  page: z.string().min(1),      // slug ("PLAYER_LOGIN", "API_C_Item.GetItemInfo", "UIOBJECT_Frame"),
                                // or path ("Combat_log", "XML/Frame"),
                                // or full URL (https://warcraft.wiki.gg/wiki/...)
}
```
One arg. The tool does NOT auto-detect "is this an event or an API?" and rewrite the slug - the agent already knows what page-type pattern it wants (wiki research §URL-patterns documents the patterns; the agent applies them). If the agent passes `Frame` and the wiki silently redirects to `XML/Frame`, the metadata field `redirectedFrom` makes that visible.

**Data source.** HTTP fetch of `https://warcraft.wiki.gg/wiki/<page>` (or the literal URL if a full URL is passed). Follow redirects.

**Lookup strategy.**
1. Normalise `page` to a URL. If it starts with `http`, use as-is. Otherwise prepend `https://warcraft.wiki.gg/wiki/`.
2. Fetch with redirect-follow. Check HTTP status:
   - 404 → no-match body (see below). Per wiki research §404 the response is a real 404 with `class="noarticletext"` body; status alone is sufficient.
   - 200 → continue.
   - Other → throw with the status code in the message.
3. Parse the HTML. Extract the **outer container** `<div id="mw-content-text">` (wiki research §content-container - this is the stable boundary; `mw-parser-output` is the parser-versioned inner div and is forbidden as the anchor). Then descend into the `mw-parser-output` child to skip MediaWiki notice banners.
4. Scrape redirect info from the inline `RLCONF` JS: regex for `"wgRedirectedFrom":"<value>"`. If present, record `redirectedFrom`.
5. Scrape category footer: every `<a href="/wiki/Category:...">` near page bottom; record the unprefixed category names.
6. Convert the extracted HTML subtree to Markdown:
   - Headings (h1/h2/h3) → `#`/`##`/`###`. Use the `<span class="mw-headline" id="...">` text per wiki research §section-anchor.
   - `<pre class="mw-highlight ...">` → fenced code block. Detect the language class (`mw-highlight-lang-lua` → `lua`).
   - `<dl><dt><dd>` parameter lists → `**name** *(type)* - description` lines.
   - `<table>` → GFM table (widget Methods tables, enum value tables - wiki research §5/§6).
   - Strip footnote `<sup>` refs (numbered superscripts pointing to References section) for readability; keep the References section intact.
   - Inline links → Markdown links with relative `/wiki/...` paths preserved (caller can pass them back to `wow-wiki-fetch`).

**Output shape.** `{ output, metadata: { url, redirectedFrom?, categories } }`.

```
# <Page title from <h1 id="firstHeading"> or <title>>

> Source: <final URL>
> Categories: API_functions, Interface_customization
> (redirected from `Frame`)            ; only when redirectedFrom is set

<page lead content - everything between mw-parser-output start and first H2; per wiki research §extraction-risks #4, this carries signatures, event-name pre-blocks, and the whole body of concept pages and enum tables>

## <First H2 heading>

<rendered content>

## <Next H2>
...
```

Self-cap: budget 40 KB on the rendered Markdown. `COMBAT_LOG_EVENT_UNFILTERED` is 211 KB of raw HTML (wiki research §3) and will exceed the budget even rendered. When over budget, truncate at the last fully-rendered section boundary (H2 break) and append: `... output truncated at 40 KB; this page is large - request a narrower related page (e.g. a sub-event like SWING_DAMAGE) via wow-wiki-fetch`.

Fence-nesting rule: the lead content and code-block sections will contain triple-backticks; the outer Markdown body uses no enclosing fence (it IS Markdown), so this is moot for the body. But when rendering a fenced `<pre>`, scan the contents for max backtick-run length and use `n+1` backticks for the fence.

**No-match body** (bare string, no throw - returns a string instead of `{output, metadata}`, since there is no useful metadata for a missing page):
```
# <page>

No wiki page at https://warcraft.wiki.gg/wiki/<page> (HTTP 404).

If this is a documented C_ API, the slug is API_C_<NS>.<Method>. Global APIs are API_<Func>. Events are the raw EVENT_NAME. Widgets are UIOBJECT_<Widget>. The slug `Frame` silently redirects to the XML element page; for the widget use UIOBJECT_Frame.
```

**Invalid input (throws).** Empty `page`. URL host other than `warcraft.wiki.gg` (forbid arbitrary fetches). HTTP errors other than 200/404 throw with `wow-wiki-fetch: HTTP <code> for <url>`.

**Non-goals.**
- Does NOT cache. First cut is uncached; see cross-cutting decision.
- Does NOT crawl. One page per call. Internal links are preserved as Markdown links but not followed.
- Does NOT parse the `Patch_changes` section into structured records. It is unstructured prose (wiki research §versioning) and the agent can read it as text.
- Does NOT infer the page type from the URL pattern and re-route. The caller chose the slug.
- Does NOT distinguish stub pages programmatically beyond surfacing `Miscellaneous_stubs` in the `categories` metadata field.

---

### Tool 4: `wow-blizzard-source`

**Purpose.** Given a regex (or literal string), ripgrep over the FrameXML source/annotated tree for a specific flavour and return matched lines with bounded context.

**Args (zod sketch).**
```
{
  pattern: z.string().min(1),                                            // ripgrep regex (or literal if `literal` is true)
  flavor: z.enum(["live", "classic", "classic_anniversary", "classic_era"]).default("live"),
  scope: z.enum(["lua", "xml", "all"]).default("lua"),                   // which annotated-file extension to search
}
```
Three args. The third arg (`scope`) is justified: `live/` alone has 3016 `*.annotated.lua` files (inventory §5) and the `.lua.annotated.lua` vs `.xml.annotated.lua` split is a meaningful axis - searches for Lua code vs XML templates are different concerns and lumping them is what blows the 40 KB budget on broad patterns. Default is `lua` because that is the dominant agent need. Resist any further axes (no `addon: Blizzard_*` filter in pass 1; if needed, the regex can include a path-ish anchor - we revisit if it proves clumsy).

`pattern` is a regex by default; an explicit `literal: boolean` flag was considered and rejected (one-arg-shape-per-tool spirit; if the caller wants literal, they escape regex metacharacters - this is what every ripgrep user expects).

**Data source.** `~/.local/share/wow-framexml/<flavor>/Annotations/` (inventory §5). Includes `AddOns/Blizzard_*/` directories plus the top-level `_enums.lua.annotated.lua` and `_templates.lua.annotated.lua` files.

**Lookup strategy.**
1. Validate `flavor` against the four allowed values.
2. Build a glob filter from `scope`:
   - `lua` → `--glob '*.lua.annotated.lua'`
   - `xml` → `--glob '*.xml.annotated.lua'`
   - `all` → both.
3. Run: `rg --color never --no-heading --line-number -B 2 -A 4 --max-count 50 --max-filesize 5M <pattern> <flavor-root>` with the glob filter.
4. Post-process every output line: strip the leading `<flavor-root>/` prefix from path lines so the rendered output shows `AddOns/Blizzard_ActionBar/ActionBar.lua.annotated.lua:123` not the absolute home path. (Direct prevention of the previous "absolute-path leaks in ripgrep context lines" bug.)
5. Group consecutive matches by file. Render each file once with all its matches.

**Output shape.** `{ output, metadata: { flavor, matchCount, selfTruncated } }`.

```
# <pattern> (flavor: live, scope: lua)

## AddOns/Blizzard_ActionBar/ActionBar.lua.annotated.lua
```lua
120-  local function FooHelper()
121-    -- ...
122:    local result = TargetSymbol()
123-    return result
124-  end
```

## AddOns/Blizzard_AchievementUI/AchievementUI.lua.annotated.lua
... etc.

---
Matched 12 files, 47 lines. Searched <flavor-root>.
```

Self-cap: budget 40 KB. When over budget, truncate at the last fully-rendered file block and append: `... output truncated at 40 KB; <matchCount - rendered> more matches across N more files. Narrow with a more specific pattern, or restrict scope to lua/xml only.` Set `selfTruncated: true`.

Fence-nesting rule: source content can contain triple-backticks (Blizzard's Lua strings sometimes embed them). Each per-file fence counts the max backtick run in its rendered chunk and uses `n+1` backticks.

**No-match body** (returned as `{output, metadata: { flavor, matchCount: 0, selfTruncated: false }}`):
```
# <pattern> (flavor: live, scope: lua)

No matches in ~/.local/share/wow-framexml/<flavor>/Annotations/ (scope: <scope>).

Try a different flavor (live | classic | classic_anniversary | classic_era), broaden scope to "all", or check the pattern - ripgrep regex syntax.
```

**Invalid input (throws).** Empty pattern. Invalid regex (catch `rg`'s exit code 2 and rethrow as `wow-blizzard-source: invalid regex: <stderr>`). Unknown flavor (zod handles). Pattern longer than 500 chars.

**Non-goals.**
- Does NOT search the curated `~/.local/share/wow-annotations/Annotations/Core/` tree - that is `wow-api-lookup`'s territory.
- Does NOT search `~/.local/share/wow-libs/ElvUI/` - third-party addon source is out of scope for the rebuild.
- Does NOT resolve mixin/template inheritance. The previous `wow-mixin-resolver` was a separate tool and is not in the rebuilt surface.
- Does NOT list addon directories (`mode: list` in the previous tool). If needed, a separate tool.
- Does NOT auto-detect flavour from the query. Caller chooses.

---

### Pillar adherence (only RISK / NEW PATTERN surfaced)

- **Follow the Grain - NEW PATTERN.** This is greenfield (`tools/` is empty). The grain established by this ADR is: *one `.ts` file per tool, one zod schema, one `execute` function, no shared imports across tool files.* The next tool added (post-rebuild) must follow this shape or document why it diverges. Revisit trigger: when a real cross-tool duplication pattern emerges (e.g. three tools all need identical wiki-URL normalisation), extract into a single named helper file and update this ADR.
- **Honest Contracts - RISK.** The `{ output, metadata }` shape is split across two tools that use it (`wow-wiki-fetch`, `wow-blizzard-source`) and two that do not (`wow-api-lookup`, `wow-event-info`). The rule above ("structured fact the caller is likely to programmatically reuse") is the governing principle, but it is judgement-laden. Revisit trigger: if a fifth tool's metadata decision is ambiguous, reify the rule with concrete criteria.

### Implementation order

The four tools have no functional dependencies on each other. Each is self-contained. Build them in any order. Recommended order is `wow-event-info` first (smallest data source, simplest extraction - good for shaking out the per-tool boilerplate), then `wow-api-lookup`, then `wow-blizzard-source`, then `wow-wiki-fetch` (most complex - HTML parsing, redirect detection, Markdown conversion).

## More Information

### Explicit non-decisions / future work (the punt list)

Deliberately out of scope for this ADR and the first rebuild pass. Listed here to make them visible so they do not silently creep back in:

- **Shared helpers / `_shared.ts`.** Forbidden in pass 1. Revisit only after all 4 tools are in production and a real duplication pattern (≥3 tools, identical code) has been observed and named.
- **Golden tests / snapshot fixtures.** No test infrastructure decisions in this ADR. The engineer may add ad-hoc verification scripts; a structured test surface is a separate effort.
- **`wow-locale-check`, `wow-addon-lint`, `wow-project-scan`, `wow-savedvars`, `wow-compat-check`, `wow-mixin-resolver`.** Six tools from the previous wave that are NOT in the rebuilt surface. Each may be re-proposed individually as a separate ADR if and when a concrete need surfaces. None are blocked by this rebuild.
- **Keyword / fuzzy / free-text search across the annotation tree.** The previous `wow-api-lookup` had a `mode: keyword`. If reintroduced, it is a separate tool (`wow-api-keyword-search` or similar), not a mode of `wow-api-lookup`.
- **Curated event scenario sequences.** The previous `wow-event-info`'s `mode: sequence`. Separate tool if ever needed.
- **Wiki HTTP caching.** No cache in pass 1. In-memory LRU keyed by URL is the planned reversal if call volume demands it.
- **`Annotations/Core/Lua/*.lua` (stdlib) search.** Excluded from `wow-api-lookup` scope. Reintroduce only on a concrete request.
- **ElvUI / `~/.local/share/wow-libs/` search.** Excluded from `wow-blizzard-source`. Separate tool if needed.
- **Flavour fallback chains** (e.g. `classic_anniversary` → `classic_era`). Excluded. Each flavour is searched as-is.
- **Mixin / template inheritance resolution.** Excluded.
- **Addon-directory listing** (the previous `wow-blizzard-source`'s `mode: list`). Excluded.
- **`page-type` auto-routing in `wow-wiki-fetch`** (e.g. detecting `PLAYER_LOGIN` is an event and rewriting). Excluded; the agent applies the URL pattern itself.

### References

- `.deliverables/explore/2026-05-08-annotations-inventory.md` - data-source tree shapes, file counts, representative file heads.
- `.deliverables/research/wiki-structure.md` - wiki page-type shapes, container divs, redirect detection, 404 behaviour.
- `@opencode-ai/plugin` - `tool()` factory and runtime contract (50 KB / 2000 line auto-truncation, `metadata.truncated`/`metadata.outputPath` reserved keys, `title` overwritten).

## Amendments

- **2026-05-12**: Lifted deferred-scope status of `Annotations/Core/Data/Enum.lua`; `wow-api-lookup` now searches it for `Enum.X` shape queries. Removed from the punt list.
