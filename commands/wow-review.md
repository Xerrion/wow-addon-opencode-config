---
description: Code review pipeline for WoW addon Lua files - runs static analysis, verifies API signatures, checks event patterns, and identifies anti-patterns
agent: wow-addon
---

# Review WoW Addon Code: $ARGUMENTS

Run a comprehensive code review on the specified file or directory.

## Arguments

- `$ARGUMENTS` - File path, directory path, or inline code to review

## Instructions

### Step 1: Load Skills

Load the `wow-addon-dev` skill (always required for tool reference).

If the code involves UI/frames, also load `wow-frame-api`.
If the code involves events/listeners, also load `wow-event-handling`.
If the code involves Lua patterns (OOP, hooks, SavedVars), also load `wow-lua-patterns`.

### Step 2: Run Static Analysis

Run `wow-addon-lint` on the target with all categories enabled:
- `globals` - global variable pollution
- `taint` - combat taint risks
- `nil-safety` - missing nil checks
- `hardcoded-ids` - magic numbers without constants
- `events` - event hygiene issues
- `performance` - tight-loop problems
- `deprecated` - removed/deprecated API usage

### Step 3: Verify API Signatures (in parallel with Step 4)

Scan the code for WoW API calls. For each unique API call found:
1. Use `wow-api-lookup` to verify the function signature
2. Check parameter count and types match usage
3. Check return value handling (especially nullable returns marked with `?`)
4. Flag any API that doesn't exist in the annotations

Focus on:
- `C_*` namespace calls
- Global WoW API functions (Get*, Set*, Create*, Is*, Has*)
- Widget method calls

### Step 4: Check Event Patterns (in parallel with Step 3)

Scan for event-related code:
1. Find all `RegisterEvent`, `RegisterUnitEvent`, or AceEvent registration calls
2. Use `wow-event-info` to verify each event name exists
3. Check that event handler signatures match the event payload
4. Check for missing `UnregisterEvent` calls (resource leaks)
5. Check for proper ADDON_LOADED guard (checking addon name)
6. Flag `InCombatLockdown()` guards on secure frame operations

### Step 5: Check Code Patterns

Review against WoW Lua best practices:
- Namespace pattern: does the file use `local ADDON_NAME, ns = ...`?
- Global caching: are frequently-used WoW APIs cached as locals?
- File header: does it start with a dashes block comment?
- Functions under 50 lines
- Early returns to reduce nesting
- Proper error handling (not silently swallowing errors)

### Step 6: Produce Review Report

Format the review as a structured report with severity levels:

**Severity levels:**
- **Error** - Bugs, crashes, or taint issues that must be fixed
- **Warning** - Anti-patterns, performance issues, or risky code
- **Info** - Style suggestions, minor improvements

Group findings by category:
1. **Lint Results** - from wow-addon-lint
2. **API Misuse** - wrong signatures, missing params, wrong return handling
3. **Event Issues** - bad event names, missing unregister, wrong payloads
4. **Pattern Violations** - coding convention issues
5. **Summary** - overall assessment with actionable next steps
