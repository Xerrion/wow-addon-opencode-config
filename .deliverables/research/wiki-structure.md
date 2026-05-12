# `warcraft.wiki.gg` page-shape inventory

Read-only characterisation. All pages fetched 2026-05-08 via `curl -sSL` (followed redirects). MediaWiki version `wgg-dom-version-1_43` (visible on every `<html>` tag).

## Cross-cutting findings

### Content container

The OUTER reliable container is `<div id="mw-content-text">`. It is present on every page (including 404s) and wraps everything below the page title, including the article body, categories, and footer. `<div class="mw-parser-output">` is the inner div nested directly inside `mw-content-text` and is present once per article. Both are reliable, but `mw-content-text` is the stable boundary; `mw-parser-output` is a parser implementation detail and Wikimedia documents it as subject to change.

For extraction:
- Use `id="mw-content-text"` to clip article content from chrome.
- Use `class="mw-parser-output"` only as the immediate child to skip MediaWiki notice banners (none observed in this sample, but they live between the two).

### Section anchor convention

Every H2 and H3 follows this exact pattern:

```html
<h2><span class="mw-headline" id="Arguments">Arguments</span></h2>
```

`id` values are derived from the heading text by replacing spaces with underscores (`Patch changes` -> `id="Patch_changes"`, `See also` -> `id="See_also"`). This is the most reliable anchor on any page - **section extraction should target `span.mw-headline[id]` rather than the H2 element itself**, because the heading text lives inside the span and the H2 carries no id of its own.

### URL patterns

Confirmed from this sample plus the page-class attributes (`page-API_C_Item_GetItemInfo`, `page-PLAYER_LOGIN`, etc.):

| Page type             | Pattern                                | Example                                |
| --------------------- | -------------------------------------- | -------------------------------------- |
| C_ namespace API      | `/wiki/API_C_<Namespace>.<Method>`     | `/wiki/API_C_Item.GetItemInfo`         |
| Global API            | `/wiki/API_<FuncName>`                 | `/wiki/API_UnitName`                   |
| Event                 | `/wiki/<EVENT_NAME>` (raw, no prefix)  | `/wiki/PLAYER_LOGIN`                   |
| Widget type           | `/wiki/UIOBJECT_<Widget>`              | `/wiki/UIOBJECT_Frame`                 |
| Widget method         | `/wiki/API_<Widget>:<Method>`          | (e.g. `API_Frame:SetSize`)             |
| Enum                  | `/wiki/Enum.<Name>`                    | `/wiki/Enum.ItemQuality`               |
| XML element           | `/wiki/XML/<Element>`                  | `/wiki/XML/Frame`                      |
| Concept / topic       | `/wiki/<TitleCase_With_Underscores>`   | `/wiki/Combat_log`                     |
| Category listing      | `/wiki/Category:<Name>`                | `/wiki/Category:API_events`            |

URLs are case-sensitive after the namespace prefix. Spaces become underscores.

### Redirects

Detected via the `wgRedirectedFrom` key in the inline `RLCONF` JS object near the top of every page:

```text
wgRedirectedFrom":"Frame"   (in /wiki/XML/Frame after fetching /wiki/Frame)
```

`curl -L` follows redirects transparently and returns `200`; the destination URL is what `%{url_effective}` reports (e.g. `/wiki/Frame` final-URL is still `/wiki/Frame`, but the page title is `XML/Frame`). **There is no visible "Redirected from X" banner in the article body of this sample** - extraction tools that want to detect redirects must scrape `wgRedirectedFrom` from the inline JS or check `<title>` against the requested slug. This is a real footgun: `/wiki/Frame` silently serves the XML element page, not the widget; the widget lives at `/wiki/UIOBJECT_Frame`.

### Versioning across game flavors

No retail-vs-classic toggle was observed in any of the eight content pages. Version information is conveyed two ways:

1. **Inline patch icons / links** in body prose, e.g. `<a ... title="Burning Crusade" ...>`. These are unstructured and appear ad hoc inside paragraphs.
2. **`Patch changes` section** at the bottom of most pages, formatted as a `<dl>`/`<ul>` of dated entries:

   ```text
   Patch 1.12.0 (2006-08-22): Added realm return value.
   Patch 9.0.2 (2020-11-17): ...
   ```

   The text follows the rough shape `Patch X.Y.Z (YYYY-MM-DD): <change>`. Anchor: `id="Patch_changes"`. Present on 7/8 sampled pages; **absent on `PLAYER_LOGIN`** (very small event, no patch history). Stub pages also omit it.

There is no machine-readable retail/classic split in HTML attributes. Pages are written as one document covering all flavors, with version notes inline.

### Categories (page footer)

Every page ends with a category footer rendered as `<a href="/wiki/Category:Name">`. Useful tags observed:

- `Category:API_functions` (global APIs and C_ APIs both)
- `Category:API_events` (events)
- `Category:API_systems/<Subsystem>` (e.g. `/Item`, `/SystemInfo`)
- `Category:Interface_customization` (widgets)
- `Category:XML_elements` (XML pages)
- `Category:Game_terms`, `Category:User_interfaces` (concept pages)
- `Category:Miscellaneous_stubs` (stubs - useful as a quality flag)
- `Category:Potentially_out-of-date_content` (quality flag)
- `Category:Things_to_do`, `Category:Sources` (housekeeping; on every page; not useful for filtering)

Categories are reliable for distinguishing API vs event vs widget vs XML vs concept when the URL prefix is ambiguous.

### Infobox

**No `class="infobox"` element was found on any sampled page.** The wiki does not use infoboxes for API/event/widget pages. The closest equivalent on API pages is the lead `<pre class="mw-highlight mw-highlight-lang-lua mw-content-ltr">` block containing the function signature - this is not an infobox but it is the canonical "signature" anchor (always the first `<pre>` element after the page title, before the first H2).

### 404 / missing-page behaviour

A missing page returns a real **HTTP 404** (not a soft 200) with a body of ~32 KB. The 404 body still contains:

- `<title>API DefinitelyDoesNotExist xyz123 - Warcraft Wiki - ...</title>` (echoes the requested name)
- `<div id="mw-content-text">` with `class="noarticletext mw-content-ltr"` containing the prose `Warcraft Wiki does not have a page with this exact name.`
- `<h2>Navigation menu</h2>` (only - no article H2s)
- No `mw-parser-output`

**Detection rule**: HTTP status 404 alone is sufficient; `class="noarticletext"` is the secondary signal if status is unavailable. `Secure_execution_and_tainting` and `Tainting` both 404 - tainting documentation does not live at either of those slugs on this wiki.

### Stub detection

A page is a stub when it carries `Category:<Type>_stubs` (e.g. `Miscellaneous_stubs`) and/or contains a stub template - none of which were tripped in the sample, but the category is the reliable signal. `Combat_log` carries `Miscellaneous_stubs`.

---

## Per-page-type characterisations

### 1. Documented `C_` namespace API — `API_C_Item.GetItemInfo`

- **URL**: `https://warcraft.wiki.gg/wiki/API_C_Item.GetItemInfo`
- **HTTP**: 200, 61,262 bytes
- **Container**: `<div id="mw-content-text">` -> `<div class="mw-parser-output">`
- **H2 sections in order**:
  1. `Arguments`
  2. `Returns`
  3. `Example`
  4. `Patch changes`
  5. `See also`
- **Lead content** (above first H2): a single `<pre class="mw-highlight mw-highlight-lang-lua">` containing the signature, e.g.

  ```text
  itemName, itemLink, itemQuality, ... = C_Item.GetItemInfo(itemInfo)
  ```

- **`Arguments` section content**: `<dl><dt>argName</dt><dd>TypeAnchor : type - description</dd></dl>` with optional `<ul>` of bullet caveats. Argument types link to type pages (e.g. `/wiki/API_types/ItemInfo`).
- **`Returns` section content**: numbered list, each entry `<n>. retName` followed by `type : EnumOrTypeRef - description`. Types are similarly linked.
- **`Example`**: `<pre class="mw-highlight">` Lua code block with `mw-highlight-copy` button class.
- **`Patch changes`**: `<dl><dd>` with `Patch X.Y.Z (date): change` lines.
- **`See also`**: bullet list of `<a href="/wiki/...">` links to related APIs.
- **Infobox**: none.
- **Caveats**: page is tagged `Category:Potentially_out-of-date_content` - quality flag worth surfacing.

### 2. Global (non-namespaced) API — `API_UnitName`

- **URL**: `https://warcraft.wiki.gg/wiki/API_UnitName`
- **HTTP**: 200, 59,783 bytes
- **Container**: identical to (1).
- **H2 sections**:
  1. `Arguments`
  2. `Returns`
  3. `Details`
  4. `Example`
  5. `GetUnitName`
  6. `Patch changes`
  7. `See also`
- **Lead content**: signature `<pre>` showing aliased calls:

  ```text
  name, realm = UnitName(unit)
              = UnitFullName(unit)
              = UnitNameUnmodified(unit)
  ```

- **`Details`**: prose paragraphs explaining edge cases.
- **`GetUnitName`** (extra section, page-specific): documents a related FrameXML helper. Demonstrates that **API pages can carry arbitrary additional H2s beyond the canonical four** when contributors document related symbols on the same page. Extraction must not assume a fixed schema.
- **Patch changes shape**: `<dl><dd> Patch 1.12.0 (2006-08-22): Added realm return value.[1]</dd></dl>` - footnote refs are inline `<sup>`.
- **Caveats**: same `Potentially_out-of-date_content` tag; the extra `GetUnitName` H2 makes pure-position section extraction unsafe (a tool keying off "third H2 = Returns" will misfire).

### 3. Event with payload — `COMBAT_LOG_EVENT_UNFILTERED`

- **URL**: `https://warcraft.wiki.gg/wiki/COMBAT_LOG_EVENT_UNFILTERED`
- **HTTP**: 200, 211,399 bytes (largest in sample - this is a hub page)
- **Container**: identical.
- **H2 sections**:
  1. `Base Parameters`
  2. `Events`
  3. `Parameter Values`
  4. `Example`
  5. `Details`
  6. `Advanced Combat Log`
  7. `Event Descriptions`
  8. `Patch changes`
  9. `References`
- **No section is named `Payload` or `Arguments`.** This event documents a subsystem; its "payload" is split across `Base Parameters` (the leading args common to all sub-events) and `Events` (which lists prefixes/suffixes via H3 children `Prefixes`, `Suffixes`, etc.).
- **`Base Parameters`** content: the standard `<dl>/<dt>/<dd>` parameter list shape used on API pages.
- **`Events`** content: prose lead-in plus H3 sub-sections (`Prefixes`, `Suffixes`) and tables enumerating every event variant.
- **`Event Descriptions`** content: long set of subsections, one per concrete event (e.g. `SWING_DAMAGE`).
- **Caveats**: this page is structurally an outlier among events because the event itself is a dispatch hub. Most events follow the simple `Payload` shape (next page).

### 4. Simple event — `PLAYER_LOGIN`

- **URL**: `https://warcraft.wiki.gg/wiki/PLAYER_LOGIN`
- **HTTP**: 200, 44,800 bytes
- **Container**: identical.
- **H2 sections**:
  1. `Payload`
  2. `Details`
  3. `See also`
- **Lead content** (above H2s): a single `<pre>` with just the event name, e.g. `PLAYER_LOGIN`.
- **`Payload`** content: literal text `None` (this event has no args). Events with args use the standard `<dl>/<dt>/<dd>` parameter list, identical shape to API `Arguments` sections.
- **`Details`**: prose about firing order, useful semantics.
- **No `Patch changes` section**. Many simple events lack it.
- **Categories**: `API_events`, `API_systems/SystemInfo`. The category is the reliable "this is an event" signal.
- **Caveats**: `Payload` is the canonical event-args heading on simple event pages, but COMBAT_LOG_EVENT_UNFILTERED proves it is not universal. Tools should accept either `Payload` or `Arguments` (and `Base Parameters`) as the args anchor.

### 5. Widget type — `UIOBJECT_Frame`

- **URL**: `https://warcraft.wiki.gg/wiki/UIOBJECT_Frame`
- **HTTP**: 200, 114,423 bytes
- **Container**: identical.
- **H2 sections**:
  1. `Methods`
  2. `Script Types`
  3. `Example`
  4. `Patch changes`
  5. `See also`
- **Lead content**: prose paragraph + inheritance chain (e.g. `Frame -> ParentedObject -> UIObject`) rendered as text with internal links.
- **`Methods`** content: a `<table class="darktable zebra">` with rows linking to per-method pages (`/wiki/API_Frame:SetSize`, etc.). Tables are the canonical method-list shape on widget pages.
- **`Script Types`** content: similar table listing handler script types (`OnLoad`, `OnEvent`, etc.).
- **Categories**: `Interface_customization`. The widget identity comes from the URL prefix (`UIOBJECT_`), not from a category.
- **Caveats**: The slug `Frame` (no prefix) is a redirect to `XML/Frame` (XML element), NOT this page. Any tool resolving `Frame` to a widget must use `UIOBJECT_Frame` explicitly.

### 6. Enum — `Enum.ItemQuality`

- **URL**: `https://warcraft.wiki.gg/wiki/Enum.ItemQuality`
- **HTTP**: 200, 40,231 bytes
- **Container**: identical.
- **H2 sections**:
  1. `Details`
  2. `Patch changes`
- **Lead content**: a `<table>` enumerating values (`Value | Field | Description`). The table is the meat of the page, sitting before the first H2.
- **`Details`** content: prose about how the enum is consumed (e.g. `Quality is the third value returned by GetItemInfo()`).
- **Caveats**: enum pages are minimal - no `Arguments`, `Returns`, or `Payload`. The value table is unanchored prose-style content above the first H2; extraction must grab it as the "lead content" rather than via section anchor.

### 7. Concept / topic page — `Combat_log`

- **URL**: `https://warcraft.wiki.gg/wiki/Combat_log`
- **HTTP**: 200, 80,364 bytes
- **Container**: identical.
- **H2 sections**:
  1. `Patch changes`
  2. `References`
  3. `External links`
- **Lead content**: extended prose (multi-paragraph) plus tables describing combat log behaviour. Most of the article body lives **above the first H2** - this is normal for concept pages, where the lead is the article.
- **`References`** content: numbered footnote list from `<sup>` refs.
- **`External links`** content: bullet list.
- **Categories**: `Game_terms`, `Miscellaneous_stubs`, `User_interfaces`. The `Miscellaneous_stubs` tag flags this page as low-confidence.
- **Caveats**: concept pages have no fixed structure. Section count, names, and ordering are arbitrary. The only universal anchor remains `Patch_changes` when present. Treat the lead (everything before first H2) as the primary content.

### Bonus: `XML/Frame` (silent redirect from `Frame`)

- **URL**: `https://warcraft.wiki.gg/wiki/Frame` -> serves `XML/Frame` content (HTTP 200; `wgRedirectedFrom":"Frame"`).
- **HTTP**: 200, 55,621 bytes
- **H2 sections**: `Attributes`, `Child elements`, `Patch changes`, `See also`, `References`
- **Categories**: `XML_elements` (only).
- **Caveat**: this is the disambiguation hazard. URL `/wiki/Frame` returns the XML-element page. There is no visible disambiguation banner; only the `<title>XML/Frame</title>` and `wgRedirectedFrom` reveal it.

### Bonus: missing pages — `Tainting`, `Secure_execution_and_tainting`, deliberate `API_DefinitelyDoesNotExist_xyz123`

- All three return **HTTP 404** with a ~32 KB body containing `class="noarticletext"`. No tainting/security topic is reachable at either common slug; if such content exists on the wiki it lives at a slug not yet identified in this sample.

---

## Answers to cross-cutting questions

- **Do API pages consistently have `Signature` / `Arguments` / `Returns` sections?** No `Signature` heading exists - the signature is the lead `<pre class="mw-highlight mw-highlight-lang-lua">` block before the first H2. `Arguments` and `Returns` are consistent across both global (`API_UnitName`) and C_ (`API_C_Item.GetItemInfo`) API pages. Pages may add extra H2s (`Details`, `Example`, related-symbol headings).

- **Do event pages consistently have `Payload` / `Arguments` sections?** Simple events use `Payload` (confirmed on `PLAYER_LOGIN`). Hub events like `COMBAT_LOG_EVENT_UNFILTERED` use `Base Parameters` instead and split structure across multiple H2s. Tools must accept `Payload`, `Arguments`, or `Base Parameters` as candidate args-anchors and fall back to "first parameter-table-shaped section after the lead".

- **Stable URL pattern?** Yes - tabulated above. `API_C_<NS>.<Method>`, `API_<Func>`, `<EVENT_NAME>`, `UIOBJECT_<Widget>`, `Enum.<Name>` are all confirmed. Concept pages use TitleCase slugs and do not follow a prefix scheme.

- **Versioning across flavors?** No HTML-level toggle. Version info is unstructured: inline links/icons in prose, plus the `Patch changes` H2 with dated entries. No machine-readable retail/classic split.

- **Category tagging useful for filtering?** Yes. `Category:API_functions`, `Category:API_events`, `Category:Interface_customization`, `Category:XML_elements` reliably disambiguate page types. `Category:Miscellaneous_stubs` and `Category:Potentially_out-of-date_content` are useful quality flags.

- **Failure mode for missing pages?** Real HTTP 404 with `class="noarticletext"` in the body. No soft 200, no search-page redirect.

---

## Extraction risks (summary)

1. **Silent redirects with no body banner** (e.g. `Frame` -> `XML/Frame`) require scraping `wgRedirectedFrom` from inline JS or comparing `<title>` to the requested slug.
2. **Extra H2s in API pages** (e.g. `GetUnitName` inside `API_UnitName`) break positional section extraction. Use anchor-id lookup, not ordinal position.
3. **Hub events** (`COMBAT_LOG_EVENT_UNFILTERED`) skip the `Payload` heading entirely. Multi-anchor fallback needed.
4. **Lead content above first H2** carries the API signature, the event name pre-block, and the entire body of concept pages and enum tables. Extraction must explicitly capture pre-H2 content rather than starting at the first H2.
5. **No infoboxes** anywhere - do not look for one.
6. **Patch changes section is unstructured `<dl>`/`<ul>` text** in the form `Patch X.Y.Z (date): change`. Parsing requires regex over text nodes; structure does not help.
7. **Concept pages have no fixed section schema** - only the lead and `Patch_changes` (when present) are predictable.
8. **`mw-parser-output`** is a parser-version-specific div per Wikimedia upstream. Prefer `mw-content-text` as the outer boundary.
9. **Argument-type links** are inline `<a>` to type pages (`/wiki/API_types/ItemInfo`, `/wiki/Enum.ItemQuality`); they are valuable signals but require following links to materialise.
10. **404s carry a 32 KB body** with site chrome. HTTP status is the primary signal; `class="noarticletext"` is the secondary signal.
