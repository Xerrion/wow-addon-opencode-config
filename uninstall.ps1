# ---------------------------------------------------------------------------
# uninstall.ps1 - Remove WoW addon config items from OpenCode config dir
#
# Removes the known files and directories installed by install.ps1.
# Use -Yes to skip the confirmation prompt.
# PowerShell 5.1+ compatible.
# ---------------------------------------------------------------------------

#Requires -Version 5.1

param(
    [switch]$Yes
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# -- Resolve paths ----------------------------------------------------------

$ConfigDir = Join-Path $env:USERPROFILE ".config\opencode"

# -- State ------------------------------------------------------------------

$Removed = 0

# -- Guard: nothing to do if config dir missing -----------------------------

if (-not (Test-Path $ConfigDir)) {
    Write-Host "Nothing to do - OpenCode config directory does not exist."
    exit 0
}

# -- Confirmation prompt ----------------------------------------------------

if (-not $Yes) {
    $answer = Read-Host "This will remove 12 WoW addon config items from ~/.config/opencode/. Continue? [y/N]"
    if ($answer -notmatch '^[yY]') {
        Write-Host "Aborted."
        exit 0
    }
}

# -- Removal helpers --------------------------------------------------------

function Remove-ConfigFile {
    param(
        [string]$Target,
        [string]$Label
    )

    if (-not (Test-Path $Target)) {
        return
    }

    Remove-Item $Target -Force
    Write-Host -NoNewline -ForegroundColor Green "[ok] "
    Write-Host "Removed $Label"
    $script:Removed++
}

function Remove-ConfigDir {
    param(
        [string]$Target,
        [string]$Label
    )

    if (-not (Test-Path $Target)) {
        return
    }

    Remove-Item $Target -Recurse -Force
    Write-Host -NoNewline -ForegroundColor Green "[ok] "
    Write-Host "Removed $Label"
    $script:Removed++
}

# -- Agents -----------------------------------------------------------------

Write-Host "Agents:"
foreach ($name in @("wow-addon.md")) {
    Remove-ConfigFile -Target (Join-Path $ConfigDir "agents\$name") -Label $name
    Remove-ConfigFile -Target (Join-Path $ConfigDir "agent\$name") -Label $name
}

# -- Skills -----------------------------------------------------------------

Write-Host ""
Write-Host "Skills:"
foreach ($name in @("wow-addon-dev", "wow-lua-patterns", "wow-frame-api", "wow-event-handling")) {
    Remove-ConfigDir -Target (Join-Path $ConfigDir "skills\$name") -Label $name
    Remove-ConfigDir -Target (Join-Path $ConfigDir "skill\$name") -Label $name
}

# -- Commands ---------------------------------------------------------------

Write-Host ""
Write-Host "Commands:"
foreach ($name in @("wow-review", "wow-scaffold")) {
    Remove-ConfigFile -Target (Join-Path $ConfigDir "commands\$name.md") -Label "$name.md"
    Remove-ConfigFile -Target (Join-Path $ConfigDir "command\$name.md") -Label "$name.md"
}

# -- Tools ------------------------------------------------------------------

Write-Host ""
Write-Host "Tools:"
foreach ($name in @("wow-api-lookup.ts", "wow-wiki-fetch.ts", "wow-event-info.ts", "wow-blizzard-source.ts", "wow-addon-lint.ts")) {
    Remove-ConfigFile -Target (Join-Path $ConfigDir "tools\$name") -Label $name
    Remove-ConfigFile -Target (Join-Path $ConfigDir "tool\$name") -Label $name
}

# -- Summary ----------------------------------------------------------------

Write-Host ""
Write-Host "Done! $Removed items removed."
