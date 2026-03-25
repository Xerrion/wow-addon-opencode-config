# ---------------------------------------------------------------------------
# install.ps1 - Install WoW addon agents, skills, commands, and tools into OpenCode
#
# Usage: .\install.ps1 [-Force]
#   -Force  Replace existing files/directories instead of skipping
# ---------------------------------------------------------------------------

[CmdletBinding()]
param(
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# -- Resolve paths ----------------------------------------------------------

$ScriptDir = $PSScriptRoot
$ConfigDir = Join-Path $env:USERPROFILE ".config\opencode"

# -- State ------------------------------------------------------------------

$Installed = 0
$Skipped = 0

# -- Guard: OpenCode must be installed --------------------------------------

if (-not (Test-Path $ConfigDir -PathType Container)) {
    Write-Host "X" -ForegroundColor Red -NoNewline
    Write-Host " OpenCode config directory not found. Install OpenCode first."
    exit 1
}

# -- Directory name detection -----------------------------------------------
# OpenCode supports both singular (command/) and plural (commands/) directory
# names. We detect which variant exists, falling back to sensible defaults.

function Resolve-ConfigSubdir {
    param(
        [string]$Plural,
        [string]$Singular,
        [string]$Default
    )

    $pluralPath = Join-Path $ConfigDir $Plural
    $singularPath = Join-Path $ConfigDir $Singular

    if (Test-Path $pluralPath -PathType Container) {
        return $pluralPath
    }
    if (Test-Path $singularPath -PathType Container) {
        return $singularPath
    }

    $defaultPath = Join-Path $ConfigDir $Default
    New-Item -Path $defaultPath -ItemType Directory -Force | Out-Null
    return $defaultPath
}

$AgentsDir = Resolve-ConfigSubdir "agents" "agent" "agents"
$SkillsDir = Resolve-ConfigSubdir "skills" "skill" "skills"
$CommandsDir = Resolve-ConfigSubdir "commands" "command" "commands"
$ToolsDir = Resolve-ConfigSubdir "tools" "tool" "tools"

# -- Copy helper ------------------------------------------------------------

function Install-ConfigItem {
    param(
        [string]$Source,
        [string]$Target,
        [string]$Label,
        [switch]$IsDirectory
    )

    # Source must exist - fail fast on bad repo state
    if (-not (Test-Path $Source)) {
        Write-Host "X" -ForegroundColor Red -NoNewline
        Write-Host " Source not found: $Source"
        return
    }

    # Target already exists - skip or replace depending on -Force
    if (Test-Path $Target) {
        if ($Force) {
            Remove-Item $Target -Force -Recurse
            if ($IsDirectory) {
                Copy-Item -Path $Source -Destination $Target -Recurse -Force
            }
            else {
                Copy-Item -Path $Source -Destination $Target -Force
            }
            Write-Host "  Replaced $Label" -ForegroundColor Yellow
            $script:Installed++
            return
        }
        else {
            Write-Host "->" -ForegroundColor Yellow -NoNewline
            Write-Host " Skipped $Label (already exists, use -Force to replace)"
            $script:Skipped++
            return
        }
    }

    # Happy path: target is free, copy the item
    if ($IsDirectory) {
        Copy-Item -Path $Source -Destination $Target -Recurse
    }
    else {
        Copy-Item -Path $Source -Destination $Target
    }
    Write-Host "+" -ForegroundColor Green -NoNewline
    Write-Host " Installed $Label"
    $script:Installed++
}

# -- Agents (individual .md files) ------------------------------------------

Write-Host "Agents:"
$agentFiles = Get-ChildItem -Path (Join-Path $ScriptDir "agents") -Filter "*.md" -File
foreach ($file in $agentFiles) {
    $targetPath = Join-Path $AgentsDir $file.Name
    Install-ConfigItem -Source $file.FullName -Target $targetPath -Label $file.Name
}

# -- Skills (entire directories, not individual files) ----------------------

Write-Host ""
Write-Host "Skills:"
$skillDirs = Get-ChildItem -Path (Join-Path $ScriptDir "skills") -Directory
foreach ($dir in $skillDirs) {
    $targetPath = Join-Path $SkillsDir $dir.Name
    Install-ConfigItem -Source $dir.FullName -Target $targetPath -Label $dir.Name -IsDirectory
}

# -- Commands (individual .md files) ----------------------------------------

Write-Host ""
Write-Host "Commands:"
$commandFiles = Get-ChildItem -Path (Join-Path $ScriptDir "commands") -Filter "*.md" -File
foreach ($file in $commandFiles) {
    $targetPath = Join-Path $CommandsDir $file.Name
    Install-ConfigItem -Source $file.FullName -Target $targetPath -Label $file.Name
}

# -- Tools (individual .ts files) -------------------------------------------

Write-Host ""
Write-Host "Tools:"
$toolFiles = Get-ChildItem -Path (Join-Path $ScriptDir "tools") -Filter "*.ts" -File
foreach ($file in $toolFiles) {
    $targetPath = Join-Path $ToolsDir $file.Name
    Install-ConfigItem -Source $file.FullName -Target $targetPath -Label $file.Name
}

# -- Summary ----------------------------------------------------------------

Write-Host ""
Write-Host "Done! $Installed items installed, $Skipped skipped."
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Ensure wow-annotations are installed:"
Write-Host "     git clone https://github.com/Ketho/vscode-wow-api ~/.local/share/wow-annotations"
Write-Host "     cd ~/.local/share/wow-annotations && git submodule update --init --recursive"
Write-Host "  2. See README.md for full setup instructions"
