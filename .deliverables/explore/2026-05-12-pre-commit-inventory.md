# Pre-Commit Working Tree Inventory

- **Date**: 2026-05-12
- **Scope**: Characterise every uncommitted change in the working tree vs baseline `b68220c` so the user can decide commit boundaries.
- **Delegation**: Caller has more dirt in `git status` than expected; needs a per-file diff-aware summary grouped A–F, flagging stale tool/skill references and unauthorised changes.

## Group A — Tool files reported as MODIFIED

All four existed at `b68220c`. None are new files; every one is a substantial rewrite consistent with the ADR-0001 tool-surface rebuild. Treat the tool commit as `refactor` (or `feat!` if the public arg shape constitutes a breaking change — see notes).

### `tools/wow-event-info.ts` — total rewrite, narrower contract
- Baseline 320 lines → current 264 lines. `git diff --stat`: heavy churn (essentially every line rewritten).
- Imports changed: now `import { tool } from "@opencode-ai/plugin/tool"` plus `import { z } from "zod"` (was `@opencode-ai/plugin` with `tool.schema`).
- Arg surface narrowed: old `{ query, wiki?: boolean }` → new `{ event }` only. Removed `wiki` flag; removed prefix/substring search modes — the new tool refuses fuzzy matching (`tools/wow-event-info.ts` execute body, "No fuzzy/prefix mode; no wiki fetch" in description).
- Behaviour: returns a same-prefix family window with a `; <- this event` marker and a wiki URL hint; no longer fetches the wiki page itself.
- **Breaking change**: callers passing `query:` or `wiki:` will fail input validation. This is a `feat!` or `refactor!` from the caller's perspective.

### `tools/wow-api-lookup.ts` — major expansion
- Baseline 219 lines → current 523 lines (+304, ~2.4×).
- Largest of the four diffs; rewritten search/ranking logic.
- I did not enumerate the new arg shape line-by-line; if the user needs the exact new signature, a focused follow-up on `tools/wow-api-lookup.ts:1-80` will surface it.

### `tools/wow-blizzard-source.ts` — rewrite, slight contraction
- Baseline 364 lines → current 298 lines (−66).
- Per ADR-0001 expectations, this should have dropped the `mode:` / `category:` / `version:` args. Not line-by-line verified — confirm before committing if that matters.

### `tools/wow-wiki-fetch.ts` — total rewrite, expansion
- Baseline 503 lines → current 588 lines (+85).
- Imports flipped to `@opencode-ai/plugin/tool` + `zod`, same as wow-event-info.
- Arg surface collapsed to `{ page }` (slug, path, or full URL). Removed: `type:` enum (`auto`/`function`/`c_api`/`event`/`widget`) and all auto-detection helpers (`FUNCTION_PREFIXES`, `detectQueryType`, `buildUrlForFunction/CApi/Event/Widget`).
- New return shape: `{ output, metadata: { url, redirectedFrom?, categories } }` (was string only).
- New behaviours: 40 KB self-cap with H2-boundary truncation, two-pronged redirect detection (HTTP + `wgRedirectedFrom`), `noarticletext` → structured no-match body, fence-width safety via `fenceFor`. Tool header comment at `tools/wow-wiki-fetch.ts:5-30` documents these as anti-regression invariants.
- **Breaking change**: callers passing `query:` / `type:` will fail; return-type consumers must unwrap `.output`.

## Group B — Doc/skill changes outside the authorised refresh

These were modified but the user only authorised refreshes to `agents/wow-addon.md` and `skills/wow-addon-toolkit/SKILL.md`. Everything below is extra.

### `README.md` (`README.md:10`, `README.md:19`, `README.md:144`) — 3 small substitutions
- `wow-addon-dev` → `wow-addon-toolkit` (README.md:10).
- `(1,727 events)` → `(all FrameXML events)` (README.md:19).
- `**324 API files**` → `**API files**` (README.md:144).
- **Still references the deleted `wow-addon-lint` tool** at `README.md:21` — not edited, will be stale after commit.

### `commands/wow-review.md` — 1-line skill rename
- Line 18: `wow-addon-dev` skill ref → `wow-addon-toolkit`.
- **Still references `wow-addon-lint`** at `commands/wow-review.md:26` and `:78` ("Run `wow-addon-lint` on the target", "Lint Results — from wow-addon-lint"). Stale.

### `commands/wow-scaffold.md` — substantial rework (+113 lines net of diff)
- Front-matter `agent:` flipped from `wow-addon` to `software-engineer` (commands/wow-scaffold.md:3). Description rewritten to split "platform-fact research" (wow-addon) from "file authoring" (software-engineer).
- Steps renumbered and rewritten as a 2-agent flow with a new "Step 1 — Delegate Platform-Fact Research to `wow-addon`" section.
- Dropped the "Load All Skills" step that listed `wow-addon-dev` (now neither loads it nor renames it).
- **Still references `wow-addon-lint`** at `commands/wow-scaffold.md:34` ("Run `wow-addon-lint` mentally"). Stale.
- No references to `wow-locale-check`, `wow-project-scan`, `wow-savedvars`, `wow-compat-check`, or `wow-mixin-resolver` in any current file.

### `skills/wow-event-handling/SKILL.md` — heavy rewrite (164 line changes)
- Front-matter description rewritten (line 1 area).
- Body shrank significantly (`-77 / +25` window around 175-166, `-23 / +20` around 254-193). Looks like prose tightening + example pruning, not a tool-ref refactor.
- No stale tool-name references found in current content.

### `skills/wow-frame-api/SKILL.md` — heavy rewrite (108 line changes)
- Front-matter description rephrased from "Load when working on addon UI code" to "Reference for understanding addon UI code" (line 3).
- Tone shift throughout: prescriptive "ALWAYS / **WRONG / RIGHT**" rewritten as descriptive "is common / typically".
- Removed the `**ALWAYS** use wow-api-lookup` opening directive (line 7); now phrased as a soft hint.
- No stale tool refs.

### `skills/wow-lua-patterns/SKILL.md` — heavy rewrite (88 line changes)
- Front-matter description rephrased (line 1).
- Same descriptive-vs-prescriptive tone shift as wow-frame-api.
- The diff window around line 111 deletes a "File-level guard / API-level guard" version-gating subsection (`-26 +11`). Worth confirming this is intentional.
- No stale tool refs.

## Group C — Install / uninstall / maintain scripts

### `install.sh` (+11 / −4) — tool installer made recursive
- Replaces flat `tools/*.ts` glob with a `find tools -type f -name "*.ts"` recursive walk, skipping `__tests__/` and `*.test.ts` (install.sh:144-159).
- Creates target subdirectories on demand. No skill-name or tool-name updates here; references no deleted tools.

### `install.ps1` (+13 / −5) — same change, PowerShell flavour
- Mirrors install.sh: `Get-ChildItem ... -Recurse` with `__tests__` / `*.test.ts` filter, preserves subdir structure (install.ps1:169-185).

### `uninstall.sh` (+27 / −6) — tool removal made repo-mirroring + skill rename
- Now enumerates `tools/` in the repo and removes matching files in the destination; prunes empty subdirs via `rmdir` (uninstall.sh:108-133).
- Skill rename: `wow-addon-dev` → `wow-addon-toolkit` (uninstall.sh:93). **Does NOT remove the old `wow-addon-dev` directory at the destination**, so an existing install that had `wow-addon-dev` will leave it orphaned after uninstall.
- Drops the prior hardcoded list of 5 tool filenames (which included `wow-addon-lint.ts`); the recursive walk implicitly drops `wow-addon-lint` too.
- Confirmation prompt: `"12 WoW addon config items"` → `"WoW addon config items"` (uninstall.sh:51).

### `uninstall.ps1` (+27 / −6) — same change, PowerShell flavour
- Mirrors uninstall.sh: enumerates source, removes matching, prunes empty subdirs (uninstall.ps1:94-118).
- Same `wow-addon-dev` → `wow-addon-toolkit` rename at uninstall.ps1:79 with the same orphan-leftover caveat.

### `maintain-annotations.ps1` — mode-only, confirmed
- Diff is `old mode 100644 / new mode 100755`. Zero content lines changed. Just made executable.

## Group D — Deleted file

### `skills/wow-addon-dev/SKILL.md` — superseded by `wow-addon-toolkit`
- At `b68220c` this was the catch-all "WoW addon development" skill: it referenced all 5 historic tools (including `wow-addon-lint`) and the historic annotation directory layout (`324 files`).
- The README, both uninstall scripts, and `commands/wow-review.md` have all flipped their reference to `wow-addon-toolkit`. Replacement skill lives at `skills/wow-addon-toolkit/` (untracked — see Group E).
- Deletion is consistent with the rename; nothing references `wow-addon-dev` in the current tree except the headers/footers of the old file itself.

## Group E — Untracked files / dirs

### `opencode.json` (1 file, 9 lines)
Full content:
```json
{
  "$schema": "https://opencode.ai/config.json",
  "agent": {
    "software-engineer": {
      "tools": {
        "*": true
      }
    }
  }
}
```
Repo-local opencode config granting `software-engineer` access to every tool. Not previously committed; user should decide whether this belongs in-repo or in `.gitignore`.

### `skills/wow-addon-design/` — 1 file, 232 lines
- Only file: `skills/wow-addon-design/SKILL.md` (232 lines, ~10.3 KB).
- Front-matter: `name: wow-addon-design`, scope is "Architectural guidance for designing WoW addon modules, listeners, save data, and multi-flavor support".
- First-paragraph self-positioning: "answers 'how should the addon be shaped?' - not 'what does this API do?'. For tool selection ... see `wow-addon-toolkit`. For language idioms see `wow-lua-patterns`."
- First section heading: "1. Module Decomposition" (Core/, Modules/, Options/, Locales/, Libs/ guidance).
- This is a NEW skill alongside the rename — not the renamed `wow-addon-dev`. The toolkit replacement lives in the also-untracked `skills/wow-addon-toolkit/` (mentioned in status but outside the explicit scope of this scout).

### Other untracked (noted, not scouted per delegation)
- `.deliverables/` — caller's own scout/ADR output tree.
- `node_modules/` — should be gitignored if not already.
- `skills/wow-addon-toolkit/` — the rename target; caller already expects this.

## Group F — Paranoia check

`git log b68220c..HEAD --oneline` returned **empty**. No commits have landed past `b68220c`. All differences in `git status` are working-tree only.

---

## Cross-cutting flags for the user

- **Stale `wow-addon-lint` references** survive in 3 tracked files even after the rename pass: `README.md:21`, `commands/wow-review.md:26`, `commands/wow-review.md:78`, `commands/wow-scaffold.md:34`.
- **Tool arg-shape breakage**: `wow-event-info` and `wow-wiki-fetch` both lost old args (`query`, `wiki`, `type`). Any skill/command that still calls them with the old shape will break. Spot-checked the modified skills — none of them include literal tool-call invocations in the diff, but a full grep over `skills/**` and `commands/**` for `wow-event-info` / `wow-wiki-fetch` argument shapes is worth doing before commit.
- **Uninstall script does not clean up the old `wow-addon-dev` skill directory** at the install destination, only the new `wow-addon-toolkit` one. Users upgrading will have orphaned files unless the uninstall script gets an explicit removal entry for the legacy name.
- **`opencode.json` and `node_modules/` are untracked**; decide tracking policy before committing.
