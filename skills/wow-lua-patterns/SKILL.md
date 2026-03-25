---
name: wow-lua-patterns
description: WoW-specific Lua patterns and idioms. Load when writing addon Lua code. Covers the namespace pattern, global caching, SavedVariables, metatables for OOP, mixins, version guards, string patterns, table management, coroutines, secure hooks, and slash commands.
---

# WoW Lua Patterns and Idioms

## 1. Namespace Pattern

Every addon file receives the addon name and a shared private table:

```lua
local ADDON_NAME, ns = ...
```

Attach modules as sub-tables to share state across files without globals:

```lua
-- Config.lua
local _, ns = ...
ns.Config = { defaults = { scale = 1.0, alpha = 0.8 } }

-- Utils.lua
local _, ns = ...
ns.Utils = {}
function ns.Utils.Round(value, decimals)
    local mult = 10 ^ (decimals or 0)
    return math.floor(value * mult + 0.5) / mult
end
```

For LoadOnDemand companion addons, expose a single global bridge: `MyAddonNS = ns`. **NEVER** use raw globals for addon state.

## 2. Global Caching

Lua local lookups are faster than global table lookups. Cache at file scope:

```lua
local CreateFrame, GetTime = CreateFrame, GetTime
local GetSpellInfo = C_Spell.GetSpellInfo
local UnitHealth, UnitName = UnitHealth, UnitName
local pairs, ipairs, type = pairs, ipairs, type
local tinsert, tremove = table.insert, table.remove
local format, match = string.format, string.match
```

- Cache at file scope, not inside functions - one lookup at load time
- Always cache APIs used in `OnUpdate` or other hot paths

## 3. SavedVariables

Declare in `.toc` - the global is created before `ADDON_LOADED` fires:

```
## SavedVariables: MyAddonDB
## SavedVariablesPerCharacter: MyAddonCharDB
```

Initialize with defaults and handle schema migration:

```lua
local defaults = { scale = 1.0, showTooltips = true, version = 1 }

function ns:InitDB()
    if not MyAddonDB then MyAddonDB = {} end
    for key, value in pairs(defaults) do
        if MyAddonDB[key] == nil then MyAddonDB[key] = value end
    end
    if MyAddonDB.version < 1 then
        MyAddonDB.oldKey = nil
        MyAddonDB.version = 1
    end
    ns.db = MyAddonDB
end
```

AceDB-3.0 handles defaults and profiles automatically:

```lua
self.db = LibStub("AceDB-3.0"):New("MyAddonDB", {
    profile = { scale = 1.0, showTooltips = true },
})
```

## 4. Metatables and OOP

Prototype pattern for class-like objects:

```lua
local MyClass = {}
MyClass.__index = MyClass

function MyClass:New(name, value)
    return setmetatable({ name = name, value = value }, self)
end

function MyClass:GetLabel()
    return format("%s: %d", self.name, self.value)
end
```

Blizzard-style mixins for mixing behavior into frames:

```lua
local MyMixin = {}
function MyMixin:OnLoad() self.items = {} end
function MyMixin:AddItem(item) tinsert(self.items, item) end

local frame = CreateFrame("Frame")
Mixin(frame, MyMixin)
frame:OnLoad()
```

Prefer composition over deep inheritance chains.

## 5. Version Guards

Guard entire files or individual calls by game version:

```lua
-- File-level guard
if WOW_PROJECT_ID ~= WOW_PROJECT_MAINLINE then return end

-- API-level guard
local ok, result = pcall(C_MythicPlus.GetCurrentAffixes)
if ok and result then --[[ Retail only ]] end
```

Constants: `WOW_PROJECT_MAINLINE` (Retail), `WOW_PROJECT_CLASSIC` (Era), `WOW_PROJECT_CATACLYSM_CLASSIC`, `WOW_PROJECT_ANNIVERSARY_CLASSIC`. Use packager directives (`#@retail@` / `#@end-retail@`) in `.toc` files for build-time exclusion.

## 6. String Patterns (Not Regex)

Lua uses patterns, not regex. Key classes: `%d` digit, `%a` letter, `%w` alphanumeric, `%s` whitespace, `%p` punctuation. Uppercase inverts: `%D` non-digit, etc.

```lua
local count = tonumber(match("You received 5 gold.", "(%d+)"))
local key, val = match(msg, "^config%s+(%S+)%s+(.+)$")

for word in string.gmatch(text, "%S+") do end

-- Escape user input for pattern-safe use
local function PatternEscape(str)
    return str:gsub("([%(%)%.%%%+%-%*%?%[%]%^%$])", "%%%1")
end
```

Use `string.format` for display strings - localization-friendly and type-safe:

```lua
local label = format("%s: %d/%d (%.1f%%)", name, current, total, pct)
```

## 7. Table Management

```lua
wipe(myTable)                    -- clear without new allocation
local copy = CopyTable(original) -- deep copy (Blizzard utility)
local count = #myArray           -- array length (beware nil holes!)
```

Table pooling for frequently created/destroyed objects:

```lua
local pool = {}
local function AcquireTable()
    return tremove(pool) or {}
end
local function ReleaseTable(t)
    wipe(t); tinsert(pool, t)
end
```

## 8. Vararg Handling

```lua
function ns.Utils.PrintAll(...)
    local n = select("#", ...)  -- correct count even with nil args
    for i = 1, n do
        print(i, tostring(select(i, ...)))
    end
end
```

Store varargs with preserved count using `{ n = select("#", ...), ... }`:

```lua
local packed = { n = select("#", ...), ... }
-- packed.n == 3 for ("a", nil, "c"), packed[2] == nil preserved
```

## 9. Secure Hooks

Post-hooks run AFTER the original - you cannot modify arguments or prevent execution:

```lua
hooksecurefunc("TargetFrame_Update", function(self)
    if self.healthBar then self.healthBar:SetStatusBarColor(1, 0, 0) end
end)

hooksecurefunc(GameTooltip, "SetUnitBuff", function(self, ...)
    -- post-hook on object method
end)
```

For script handlers, use `HookScript` to chain without replacing:

```lua
frame:HookScript("OnEvent", function(self, event)
    -- runs AFTER the original OnEvent handler
end)
```

**NEVER** replace secure functions directly - this causes taint and breaks protected actions in combat.

## 10. Slash Commands

```lua
SLASH_MYADDON1 = "/myaddon"
SLASH_MYADDON2 = "/ma"
SlashCmdList["MYADDON"] = function(msg)
    if not msg or msg == "" then ns:ToggleMainWindow(); return end
    local cmd, rest = msg:match("^(%S+)%s*(.*)$")
    if not cmd then return end
    cmd = cmd:lower()
    if cmd == "config" then ns:OpenConfig()
    elseif cmd == "reset" then ns:ResetDefaults()
    else print(format("|cff00ccff%s|r: Unknown command '%s'", ADDON_NAME, cmd))
    end
end
```

`SLASH_*` globals and `SavedVariables` are the **only** acceptable global variables in addon code. AceConsole-3.0 provides `self:RegisterChatCommand()` as an alternative.

## 11. Error Handling

Use `error()` with level 2 to blame the caller for public API misuse:

```lua
function ns.Config.Set(key, value)
    if type(key) ~= "string" then
        error(format("Config.Set: expected string key, got %s", type(key)), 2)
    end
    ns.db[key] = value
end
```

Wrap fallible operations and use `or` for defensive defaults:

```lua
-- Non-throwing APIs: check return value for nil
local info = C_Item.GetItemInfo(itemID)
if not info then return nil end

-- Throwing APIs: wrap in pcall
local ok, result = pcall(SomeFunctionThatMayError, arg)
if not ok then
    ns:Debug("Error: %s", result)
    return nil
end

local name = UnitName("target") or "Unknown"
```

Never silently swallow errors - handle them explicitly or propagate upward.

## 12. Coroutines and Deferred Work

Defer execution out of event handlers or loading:

```lua
C_Timer.After(0, function() ns:InitializeUI() end)
```

Spread heavy work across frames with a coroutine:

```lua
local function ProcessLargeDataset(data)
    local co = coroutine.create(function()
        for i = 1, #data do
            ns:ProcessEntry(data[i])
            if i % 50 == 0 then coroutine.yield() end
        end
    end)
    local ticker
    ticker = C_Timer.NewTicker(0, function()
        if coroutine.status(co) == "dead" then ticker:Cancel(); return end
        local ok, err = coroutine.resume(co)
        if not ok then ticker:Cancel(); error("Coroutine failed: " .. tostring(err)) end
    end)
end
```

Use `C_Timer.NewTicker` for periodic updates that don't need frame-level precision:

```lua
local ticker = C_Timer.NewTicker(1.0, function() ns:UpdateStatusDisplay() end)
-- Later: ticker:Cancel()
```
