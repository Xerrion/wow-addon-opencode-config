---
name: wow-frame-api
description: WoW Frame creation, widget types, anchoring, and UI patterns. Load when working on addon UI code. Covers CreateFrame, anchor system, backdrop setup, textures, font strings, animations, secure templates, custom widgets, frame pooling, and taint avoidance.
---

# WoW Frame and UI API Patterns

Reference for building addon UIs. **ALWAYS** use `wow-api-lookup` to verify signatures before calling any widget method or CreateFrame variant.

---

## 1. CreateFrame Basics

```lua
local frame = CreateFrame("Frame", nil, UIParent, "BackdropTemplate")
```

- Parameters: `frameType`, `name`, `parent`, `template`, `id`
- Prefer `nil` names (anonymous frames) unless other addons need to reference the frame
- Named frames register as globals - avoid polluting `_G` unnecessarily
- Common types: `Frame`, `Button`, `StatusBar`, `ScrollFrame`, `EditBox`, `Slider`, `CheckButton`, `GameTooltip`
- Multiple templates via comma-separated string: `"BackdropTemplate,SecureActionButtonTemplate"`

## 2. Frame Hierarchy and Strata

- Child inherits parent visibility, scale, alpha. Hiding a parent hides all children.
- Reparent with `frame:SetParent(newParent)`
- Strata (bottom to top): `BACKGROUND`, `LOW`, `MEDIUM` (default), `HIGH`, `DIALOG`, `FULLSCREEN`, `FULLSCREEN_DIALOG`, `TOOLTIP`
- `frame:SetFrameStrata("HIGH")` - assign strata
- `frame:SetFrameLevel(10)` - z-order within a strata

## 3. Anchor System

```lua
frame:SetPoint("CENTER", UIParent, "CENTER", 0, 0)
frame:SetPoint("TOPLEFT", parent, "BOTTOMLEFT", 5, -5)
```

- **ALWAYS** call `ClearAllPoints()` before repositioning an already-anchored frame
- `SetPoint(point, relativeTo, relativePoint, offsetX, offsetY)`
- Anchor to frame references, not name strings (avoids global lookup cost)
- `SetAllPoints(parent)` - shortcut to fill the parent entirely

```lua
-- Fill parent with padding
frame:SetPoint("TOPLEFT", parent, "TOPLEFT", 8, -8)
frame:SetPoint("BOTTOMRIGHT", parent, "BOTTOMRIGHT", -8, 8)

-- Stack below a sibling
frame:SetPoint("TOPLEFT", sibling, "BOTTOMLEFT", 0, -4)
frame:SetPoint("TOPRIGHT", sibling, "BOTTOMRIGHT", 0, -4)
```

## 4. Backdrop Setup

Requires `BackdropTemplate` in the CreateFrame call.

```lua
local frame = CreateFrame("Frame", nil, UIParent, "BackdropTemplate")
frame:SetBackdrop({
    bgFile = "Interface/Tooltips/UI-Tooltip-Background",
    edgeFile = "Interface/Tooltips/UI-Tooltip-Border",
    edgeSize = 16,
    insets = { left = 4, right = 4, top = 4, bottom = 4 },
})
frame:SetBackdropColor(0, 0, 0, 0.8)
frame:SetBackdropBorderColor(0.6, 0.6, 0.6, 1)
```

- `BackdropTemplate` was removed in 9.0, re-added as an explicit template - always inherit it
- `tile = true` and `tileSize = 16` for repeating background patterns

## 5. Textures and Layers

```lua
local tex = frame:CreateTexture(nil, "BACKGROUND")
tex:SetTexture("Interface/AddOns/MyAddon/Textures/bg")
tex:SetAllPoints()
tex:SetVertexColor(1, 1, 1, 0.5)
```

- Draw layers (back to front): `BACKGROUND`, `BORDER`, `ARTWORK`, `OVERLAY`, `HIGHLIGHT`
- Sub-layer offset (integer -8 to 7) for ordering within a layer
- `HIGHLIGHT` layer auto-shows on mouse enter, hides on leave
- Atlas textures: `tex:SetAtlas("Tooltip-Background")`
- Sprite regions: `tex:SetTexCoord(left, right, top, bottom)`

```lua
local bg = frame:CreateTexture(nil, "BACKGROUND", nil, -1) -- behind default
local fg = frame:CreateTexture(nil, "BACKGROUND", nil, 1)  -- in front of default
```

## 6. Font Strings

```lua
local text = frame:CreateFontString(nil, "OVERLAY", "GameFontNormal")
text:SetPoint("CENTER")
text:SetText("Hello World")
```

- Built-in templates: `GameFontNormal`, `GameFontHighlight`, `GameFontNormalLarge`, `GameFontNormalSmall`
- Custom font: `text:SetFont("Interface/AddOns/MyAddon/Fonts/Custom.ttf", 14, "OUTLINE")`
- Flags: `"OUTLINE"`, `"THICKOUTLINE"`, `"MONOCHROME"`
- Overflow: `text:SetWordWrap(true)` and `text:SetMaxLines(3)`
- Inline color: `"|cFFFF0000Red text|r normal text"`

## 7. StatusBar Patterns

```lua
local bar = CreateFrame("StatusBar", nil, parent)
bar:SetStatusBarTexture("Interface/TargetingFrame/UI-StatusBar")
bar:SetMinMaxValues(0, 100)
bar:SetValue(75)
bar:SetStatusBarColor(0, 1, 0)

local bg = bar:CreateTexture(nil, "BACKGROUND")
bg:SetAllPoints()
bg:SetTexture("Interface/TargetingFrame/UI-StatusBar")
bg:SetVertexColor(0.2, 0.2, 0.2, 0.8)
```

- Smooth value transitions via OnUpdate interpolation - never jump directly
- `bar:SetFillStyle("STANDARD")` or `"REVERSE"` or `"CENTER"` for fill direction

## 8. Animation System

```lua
local ag = frame:CreateAnimationGroup()
local fade = ag:CreateAnimation("Alpha")
fade:SetFromAlpha(0)
fade:SetToAlpha(1)
fade:SetDuration(0.3)
fade:SetSmoothing("OUT")
ag:Play()
```

- Types: `Alpha`, `Scale`, `Translation`, `Rotation`, `Path`
- Smoothing: `IN`, `OUT`, `IN_OUT`, `NONE`
- Chain with `SetStartDelay` or `SetOrder` (groups play order 1, then 2, etc.)
- Loop: `ag:SetLooping("REPEAT")` or `"BOUNCE"`
- Completion: `ag:SetScript("OnFinished", function(self) self:GetParent():Hide() end)`

```lua
local slide = ag:CreateAnimation("Translation")
slide:SetOffset(0, -50)  -- slide up 50px from below
slide:SetDuration(0.25)
slide:SetSmoothing("OUT")
```

## 9. Secure Templates

Secure frames allow combat-time clicks (casting spells, targeting, etc.).

```lua
local btn = CreateFrame("Button", "MySecureBtn", UIParent, "SecureActionButtonTemplate")
btn:SetAttribute("type", "spell")
btn:SetAttribute("spell", "Rejuvenation")
btn:RegisterForClicks("AnyUp", "AnyDown")
```

- `SecureActionButtonTemplate` - action buttons (spell, item, macro)
- `SecureHandlerBaseTemplate` - custom secure state via restricted Lua
- **NEVER** modify secure frame attributes during combat
- Guard: `if InCombatLockdown() then return end`
- Use `PLAYER_REGEN_ENABLED` to apply deferred secure changes after combat

## 10. ScrollFrame Patterns

```lua
local scroll = CreateFrame("ScrollFrame", nil, parent, "UIPanelScrollFrameTemplate")
scroll:SetSize(300, 400)

local content = CreateFrame("Frame", nil, scroll)
content:SetSize(300, 800) -- must have explicit size
scroll:SetScrollChild(content)
```

- Content frame **must** have an explicit size - the scroll frame reads it
- Update height when children change: `content:SetHeight(totalHeight)`

```lua
scroll:SetScript("OnMouseWheel", function(self, delta)
    local current = self:GetVerticalScroll()
    local maxScroll = self:GetVerticalScrollRange()
    local newScroll = math.max(0, math.min(current - (delta * 40), maxScroll))
    self:SetVerticalScroll(newScroll)
end)
```

## 11. Custom Widget Factories

Pattern for reusable UI components (options panels, config screens):

```lua
local LAYOUT = { WIDGET_HEIGHT = 26, PADDING = 8, INDENT = 16 }

local function CreateToggle(parent, config)
    local check = CreateFrame("CheckButton", nil, parent, "UICheckButtonTemplate")
    check:SetSize(LAYOUT.WIDGET_HEIGHT, LAYOUT.WIDGET_HEIGHT)
    check:SetChecked(config.get())
    check:SetScript("OnClick", function(self) config.set(self:GetChecked()) end)

    local label = check:CreateFontString(nil, "OVERLAY", "GameFontNormal")
    label:SetPoint("LEFT", check, "RIGHT", 4, 0)
    label:SetText(config.label)
    return check
end
```

- Each factory returns the root frame - caller handles positioning
- Config tables carry `label`, `get`, `set`, and optional `tooltip`
- Shared constants table for consistent spacing/sizing across widgets

## 12. Frame Pooling

```lua
local pool = CreateFramePool("Frame", parent, "BackdropTemplate")
local frame = pool:Acquire()
frame:Show()
pool:Release(frame)
pool:ReleaseAll()
```

- Use for dynamic lists, grids, rows - anything with variable item count
- `Acquire()` returns a recycled frame or creates a new one
- `Release()` hides the frame and calls its reset handler

```lua
local pool = CreateFramePool("Frame", parent, "BackdropTemplate", function(_, frame)
    frame:ClearAllPoints()
    frame:SetAlpha(1)
    frame:Hide()
end)
```

## 13. Taint Avoidance

Taint causes "action blocked" errors and silent UI failures in combat.

- **NEVER** modify Blizzard UI frames directly - use hooks
- **NEVER** set global variables that Blizzard code reads
- **ALWAYS** guard secure operations with `InCombatLockdown()` checks
- Use `hooksecurefunc()` to safely hook without tainting
- Defer to next frame: `C_Timer.After(0, function() ... end)`

```lua
-- WRONG: directly modifying Blizzard frame
PlayerFrame:SetAlpha(0.5)

-- RIGHT: hook to respond to Blizzard behavior
hooksecurefunc(PlayerFrame, "Show", function(self)
    -- react safely
end)
```

Queue changes for out-of-combat:

```lua
local pending = {}
local processor = CreateFrame("Frame")
processor:RegisterEvent("PLAYER_REGEN_ENABLED")
processor:SetScript("OnEvent", function()
    for _, fn in ipairs(pending) do fn() end
    wipe(pending)
end)

local function DeferSecure(fn)
    if InCombatLockdown() then
        table.insert(pending, fn)
    else
        fn()
    end
end
```

## 14. Tooltip Integration

```lua
frame:SetScript("OnEnter", function(self)
    GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
    GameTooltip:SetText("Title", 1, 1, 1)
    GameTooltip:AddLine("Description text.", 0.8, 0.8, 0.8, true)
    GameTooltip:Show()
end)
frame:SetScript("OnLeave", GameTooltip_Hide)
```

- Call `SetOwner()` before adding content - it clears the previous tooltip
- Anchors: `ANCHOR_RIGHT`, `ANCHOR_LEFT`, `ANCHOR_CURSOR`, `ANCHOR_NONE`, `ANCHOR_TOPLEFT`
- `GameTooltip_Hide` is a global function, not a method - pass directly as handler
- Item tooltips: `GameTooltip:SetHyperlink(itemLink)`
- Spell tooltips: `GameTooltip:SetSpellByID(spellID)`
- Double column: `AddDoubleLine(leftText, rightText, lR, lG, lB, rR, rG, rB)`
