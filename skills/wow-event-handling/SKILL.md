---
name: wow-event-handling
description: WoW event registration, dispatching, and lifecycle patterns. Load when working with events, listeners, or combat-sensitive code. Covers raw events, AceEvent, OnEvent dispatch, ADDON_LOADED bootstrapping, combat lockdown guards, event throttling, listener factories, and common event sequences.
---

# WoW Event Handling Patterns

ALWAYS use the `wow-api-lookup` tool to verify event payloads before writing handlers. Do not guess at arguments.

## 1. Raw Event Registration

Every event handler needs a frame. No frame, no events.

```lua
local frame = CreateFrame("Frame")
frame:RegisterEvent("PLAYER_LOGIN")
frame:RegisterEvent("LOOT_OPENED")
frame:SetScript("OnEvent", function(self, event, ...)
    if event == "PLAYER_LOGIN" then
        self:OnPlayerLogin()
    elseif event == "LOOT_OPENED" then
        self:OnLootOpened(...)
    end
end)
```

- `RegisterEvent(name)` - start listening
- `UnregisterEvent(name)` - stop listening for one event
- `UnregisterAllEvents()` - stop all events on that frame
- `IsEventRegistered(name)` - check before double-registering

## 2. Dispatch Patterns

### Method dispatch (preferred for many events)

```lua
frame:SetScript("OnEvent", function(self, event, ...)
    local handler = self[event]
    if handler then handler(self, ...) end
end)

function frame:PLAYER_LOGIN()
    -- handle login
end

function frame:LOOT_OPENED(autoLoot)
    -- handle loot
end
```

- Method name matches event name exactly
- Clean - no if/elseif chain
- Adding a handler = defining a method + registering the event

### Table dispatch (alternative)

```lua
local handlers = {}
handlers.PLAYER_LOGIN = function() --[[ ... ]] end
handlers.LOOT_OPENED = function(autoLoot) --[[ ... ]] end

frame:SetScript("OnEvent", function(self, event, ...)
    local fn = handlers[event]
    if fn then fn(...) end
end)
```

## 3. AceEvent-3.0

```lua
local MyAddon = LibStub("AceAddon-3.0"):NewAddon("MyAddon", "AceEvent-3.0")

function MyAddon:OnEnable()
    self:RegisterEvent("PLAYER_LOGIN")
    self:RegisterEvent("LOOT_OPENED", "HandleLoot")
    self:RegisterMessage("MyAddon_CustomEvent")
end

function MyAddon:PLAYER_LOGIN()
    -- default: method name = event name
end

function MyAddon:HandleLoot(event, autoLoot)
    -- custom method name via second argument
end

function MyAddon:OnDisable()
    self:UnregisterAllEvents()
    self:UnregisterAllMessages()
end
```

- No frame needed - AceEvent handles it internally
- Second arg to `RegisterEvent` routes to a custom method name
- `RegisterMessage` / `SendMessage` for inter-addon communication
- `UnregisterEvent` / `UnregisterAllEvents` for cleanup

## 4. ADDON_LOADED Bootstrap

```lua
local frame = CreateFrame("Frame")
frame:RegisterEvent("ADDON_LOADED")
frame:SetScript("OnEvent", function(self, event, addonName)
    if addonName ~= ADDON_NAME then return end
    self:UnregisterEvent("ADDON_LOADED")
    -- Safe to access SavedVariables here
    -- Initialize your addon
end)
```

- Fires once per addon when its files finish loading
- **First argument is the addon name** - ALWAYS guard with an early return
- SavedVariables are available at this point
- Unregister immediately after handling your own load
- For Ace3 addons, use `OnInitialize()` instead (fires at ADDON_LOADED time)

## 5. Login Event Sequence

Order matters. Know it cold:

1. `ADDON_LOADED` - per addon, SavedVariables available
2. `PLAYER_LOGIN` - character data available, UI visible
3. `PLAYER_ENTERING_WORLD` (isInitialLogin=true) - world fully loaded
4. `LOADING_SCREEN_DISABLED` - loading screen gone

Key differences:

- `PLAYER_LOGIN` fires ONCE per session
- `PLAYER_ENTERING_WORLD` fires on every loading screen (instance changes, portals, etc.)
- Use `PLAYER_LOGIN` for one-time setup
- Use `PLAYER_ENTERING_WORLD` for state that needs refresh on zone changes

## 6. Combat Lockdown

Protected actions fail silently in combat. Guard them or lose them.

```lua
function MyAddon:DoSecureAction()
    if InCombatLockdown() then
        self:RegisterEvent("PLAYER_REGEN_ENABLED")
        self.pendingAction = true
        return
    end
    self:UpdateSecureFrames()
end

function MyAddon:PLAYER_REGEN_ENABLED()
    self:UnregisterEvent("PLAYER_REGEN_ENABLED")
    if self.pendingAction then
        self.pendingAction = false
        self:UpdateSecureFrames()
    end
end
```

- `InCombatLockdown()` returns true during combat
- `PLAYER_REGEN_DISABLED` = entering combat
- `PLAYER_REGEN_ENABLED` = leaving combat
- Secure frame modifications (Show, Hide, SetPoint, SetParent on protected frames) FAIL SILENTLY in combat
- ALWAYS guard secure operations with an `InCombatLockdown()` check

## 7. Event Throttling and Batching

Some events fire in rapid bursts. Batch them.

```lua
local pending = false
function MyAddon:BAG_UPDATE()
    if pending then return end
    pending = true
    C_Timer.After(0.1, function()
        pending = false
        MyAddon:ProcessBagUpdate()
    end)
end
```

AceBucket-3.0 provides built-in batching:

```lua
-- Collects all BAG_UPDATE firings within 0.2s, then calls handler once
self:RegisterBucketEvent("BAG_UPDATE", 0.2, "ProcessBagUpdate")
```

## 8. Listener Factory Pattern

Shared logic with version-specific variants - useful for cross-version addons.

Shared factory (`Listeners/Loot_Shared.lua`):

```lua
local _, ns = ...

ns.LootListener = {}

function ns.LootListener.Create(config)
    local listener = {}

    function listener:Start()
        ns.Addon:RegisterEvent(config.openEvent, function(_, ...)
            self:OnOpen(...)
        end)
        ns.Addon:RegisterEvent(config.closeEvent, function()
            self:OnClose()
        end)
    end

    function listener:OnOpen(...)
        -- shared logic using config values
    end

    function listener:OnClose()
        -- shared cleanup
    end

    return listener
end
```

Version-specific (`Listeners/Loot_Retail.lua`):

```lua
local _, ns = ...
if WOW_PROJECT_ID ~= WOW_PROJECT_MAINLINE then return end

local listener = ns.LootListener.Create({
    openEvent = "LOOT_READY",
    closeEvent = "LOOT_CLOSED",
})
listener:Start()
```

- Factory creates listeners with injected configuration
- Version-specific files pass different configs for Retail vs Classic
- Runtime guard at the top of version-specific files prevents loading on wrong client

## 9. Unit Events

```lua
frame:RegisterUnitEvent("UNIT_HEALTH", "player", "target")
```

- More efficient than `RegisterEvent` - fires only for specified units
- Supports up to 2 unit tokens
- Works with `UNIT_HEALTH`, `UNIT_POWER_UPDATE`, `UNIT_AURA`, etc.
- The unit argument is still passed as the first payload parameter

## 10. EventRegistry (Modern Retail)

```lua
EventRegistry:RegisterFrameEventAndCallback("UNIT_AURA", function(_, unit, info)
    if unit ~= "player" then return end
    -- handle player aura changes
end)
```

- `EventRegistry` is the modern Retail event system
- `RegisterFrameEventAndCallback` / `UnregisterFrameEventAndCallback`
- Classic still uses the traditional frame-based approach
- For cross-version addons, stick with traditional `RegisterEvent`

## 11. Common Event Gotchas

- `UNIT_AURA` fires VERY frequently - filter the unit early and return fast
- `COMBAT_LOG_EVENT_UNFILTERED` has no args - use `CombatLogGetCurrentEventInfo()` to get payload
- `GET_ITEM_INFO_RECEIVED` fires when the item cache populates - use for async item lookups
- `PLAYER_LOGOUT` is unreliable for saving data - save on important state changes instead
- Some events fire before the frame is fully rendered - use `C_Timer.After(0, fn)` to defer to next frame
- `VARIABLES_LOADED` is deprecated - use `ADDON_LOADED` instead

## 12. Cleanup and Unregistering

ALWAYS unregister events when a module is disabled or destroyed.

Ace3 cleanup:

```lua
function MyAddon:OnDisable()
    self:UnregisterAllEvents()
    self:UnregisterAllMessages()
    self:CancelAllTimers()
end
```

Raw frame cleanup:

```lua
function MyFrame:Destroy()
    self:UnregisterAllEvents()
    self:SetScript("OnEvent", nil)
    self:SetScript("OnUpdate", nil)
    self:Hide()
end
```

- Cancel timers (AceTimer, C_Timer tickers)
- Remove OnUpdate scripts when no longer needed (hiding a frame stops OnUpdate, but explicit cleanup is good practice for disabled modules)
- Set script handlers to nil for clean teardown
