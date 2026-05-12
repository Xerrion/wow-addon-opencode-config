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
    $answer = Read-Host "This will remove WoW addon config items from ~/.config/opencode/. Continue? [y/N]"
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
foreach ($name in @("wow-addon-toolkit", "wow-lua-patterns", "wow-frame-api", "wow-event-handling")) {
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
# Mirror-mode: enumerate the .ts files this repo would install, and remove
# their counterparts at the destination. Then prune now-empty subdirs (e.g.
# data/, savedvars/) but leave the tools/ root and any unknown files alone.

Write-Host ""
Write-Host "Tools:"
$toolsSourceDir = Join-Path $PSScriptRoot "tools"
if (Test-Path $toolsSourceDir) {
    $toolFiles = Get-ChildItem -Path $toolsSourceDir -Filter "*.ts" -File -Recurse |
        Where-Object { $_.FullName -notmatch '[\\/]__tests__[\\/]' -and $_.Name -notlike '*.test.ts' } |
        Sort-Object FullName
    foreach ($file in $toolFiles) {
        $rel = $file.FullName.Substring($toolsSourceDir.Length).TrimStart('\', '/')
        Remove-ConfigItem -Subdir "tools" -Name $rel
        Remove-ConfigItem -Subdir "tool" -Name $rel
    }

    # Prune now-empty subdirectories under tools/ (leave non-empty ones alone).
    foreach ($subdirName in @("tools", "tool")) {
        $subdir = Join-Path $ConfigDir $subdirName
        if (-not (Test-Path $subdir)) { continue }
        Get-ChildItem -Path $subdir -Directory | ForEach-Object {
            if (-not (Get-ChildItem -Path $_.FullName -Force)) {
                Remove-Item $_.FullName -Force
                Write-Host "  Removed empty: $subdirName/$($_.Name)/" -ForegroundColor Green
                $script:Removed++
            }
        }
    }
}

# -- Summary ----------------------------------------------------------------

Write-Host ""
Write-Host "Done! $Removed items removed."
