# ---------------------------------------------------------------------------
# uninstall.ps1 - Remove WoW addon config items from OpenCode config dir
#
# Removes the known files and directories installed by install.ps1.
# Use -Yes to skip the confirmation prompt.
# PowerShell 5.1+ compatible.
# ---------------------------------------------------------------------------

#Requires -Version 5.1

[CmdletBinding()]
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

# -- Removal helper ---------------------------------------------------------

function Remove-ConfigItem {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Subdir,
        [Parameter(Mandatory)][string]$Name,
        [switch]$Recurse
    )
    $itemPath = Join-Path (Join-Path $ConfigDir $Subdir) $Name
    if (Test-Path $itemPath) {
        if ($Recurse) {
            Remove-Item $itemPath -Recurse -Force
        } else {
            Remove-Item $itemPath -Force
        }
        Write-Host "  Removed: $Subdir/$Name" -ForegroundColor Green
        $script:Removed++
    } else {
        Write-Host "  Already absent: $Subdir/$Name"
    }
}

# -- Agents -----------------------------------------------------------------

Write-Host "Agents:"
foreach ($name in @("wow-addon.md")) {
    Remove-ConfigItem -Subdir "agents" -Name $name
    Remove-ConfigItem -Subdir "agent" -Name $name
}

# -- Skills -----------------------------------------------------------------

Write-Host ""
Write-Host "Skills:"
foreach ($name in @("wow-addon-dev", "wow-lua-patterns", "wow-frame-api", "wow-event-handling")) {
    Remove-ConfigItem -Subdir "skills" -Name $name -Recurse
    Remove-ConfigItem -Subdir "skill" -Name $name -Recurse
}

# -- Commands ---------------------------------------------------------------

Write-Host ""
Write-Host "Commands:"
foreach ($name in @("wow-review", "wow-scaffold")) {
    Remove-ConfigItem -Subdir "commands" -Name "$name.md"
    Remove-ConfigItem -Subdir "command" -Name "$name.md"
}

# -- Tools ------------------------------------------------------------------

Write-Host ""
Write-Host "Tools:"
foreach ($name in @("wow-api-lookup.ts", "wow-wiki-fetch.ts", "wow-event-info.ts", "wow-blizzard-source.ts", "wow-addon-lint.ts")) {
    Remove-ConfigItem -Subdir "tools" -Name $name
    Remove-ConfigItem -Subdir "tool" -Name $name
}

# -- Summary ----------------------------------------------------------------

Write-Host ""
Write-Host "Done! $Removed items removed."
