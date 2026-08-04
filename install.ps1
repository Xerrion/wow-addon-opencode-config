# ---------------------------------------------------------------------------
# install.ps1 - Install WoW addon agents, skills, commands, and tools into OpenCode
#
# Usage: .\install.ps1 [-Force] [-Annotations]
#   -Force        Replace existing files/directories instead of skipping
#   -Annotations  Run maintain-annotations.ps1 after install
# ---------------------------------------------------------------------------

[CmdletBinding()]
param(
    [switch]$Force,
    [switch]$Annotations
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# -- Resolve paths ----------------------------------------------------------

$ScriptDir = $PSScriptRoot
$ConfigDir = Join-Path $env:USERPROFILE ".config\opencode"

# Platform-native annotation storage - must match maintain-annotations.ps1.
# Windows: %LOCALAPPDATA%; macOS/Linux (pwsh): ~/.local/share. PowerShell 5.1
# only runs on Windows; $IsWindows exists from 6+ (the -lt 6 check must come
# first so 5.1 never evaluates the undefined variable).
$IsWindowsHost = ($PSVersionTable.PSVersion.Major -lt 6) -or $IsWindows
$DataHome = if ($IsWindowsHost) {
    if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $env:USERPROFILE "AppData\Local" }
} else {
    Join-Path $HOME ".local/share"
}
$AnnotationsDir = Join-Path $DataHome "wow-annotations"
$FrameXMLDir = Join-Path $DataHome "wow-framexml"

# -- State ------------------------------------------------------------------

$Installed = 0
$Skipped = 0

# -- Guard: OpenCode must be installed --------------------------------------

if (-not (Test-Path $ConfigDir -PathType Container)) {
    Write-Host "X" -ForegroundColor Red -NoNewline
    Write-Host " OpenCode config directory not found. Install OpenCode first."
    exit 1
}

# Canonicalize so every message shows the fully expanded absolute path,
# never an env-var or ~ shorthand.
$ConfigDir = (Resolve-Path -LiteralPath $ConfigDir).ProviderPath

# -- Directory name detection -----------------------------------------------
# OpenCode supports both singular (command/) and plural (commands/) directory
# names. We detect which variant exists, falling back to sensible defaults.

function Resolve-ConfigSubdir {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Plural,
        [Parameter(Mandatory)][string]$Singular,
        [Parameter(Mandatory)][string]$Default
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
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Source,
        [Parameter(Mandatory)][string]$Target,
        [Parameter(Mandatory)][string]$Label,
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

# -- Source directory guard --------------------------------------------------

function Assert-SourceDir {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Label
    )
    if (-not (Test-Path $Path)) {
        Write-Host "ERROR: Source directory not found: $Path" -ForegroundColor Red
        Write-Host "Ensure you are running from a complete clone of the repository." -ForegroundColor Yellow
        exit 1
    }
}

# -- Agents (individual .md files) ------------------------------------------

Write-Host "Agents:"
$agentsSourceDir = Join-Path $ScriptDir "agents"
Assert-SourceDir -Path $agentsSourceDir -Label "agents"
$agentFiles = Get-ChildItem -Path $agentsSourceDir -Filter "*.md" -File
foreach ($file in $agentFiles) {
    $targetPath = Join-Path $AgentsDir $file.Name
    Install-ConfigItem -Source $file.FullName -Target $targetPath -Label $file.Name
}

# -- Skills (entire directories, not individual files) ----------------------

Write-Host ""
Write-Host "Skills:"
$skillsSourceDir = Join-Path $ScriptDir "skills"
Assert-SourceDir -Path $skillsSourceDir -Label "skills"
$skillDirs = Get-ChildItem -Path $skillsSourceDir -Directory
foreach ($dir in $skillDirs) {
    $targetPath = Join-Path $SkillsDir $dir.Name
    Install-ConfigItem -Source $dir.FullName -Target $targetPath -Label $dir.Name -IsDirectory
}

# -- Commands (individual .md files) ----------------------------------------

Write-Host ""
Write-Host "Commands:"
$commandsSourceDir = Join-Path $ScriptDir "commands"
Assert-SourceDir -Path $commandsSourceDir -Label "commands"
$commandFiles = Get-ChildItem -Path $commandsSourceDir -Filter "*.md" -File
foreach ($file in $commandFiles) {
    $targetPath = Join-Path $CommandsDir $file.Name
    Install-ConfigItem -Source $file.FullName -Target $targetPath -Label $file.Name
}

# -- Tools (.ts files, recursively, preserving subdirectory structure) ------
# Skips __tests__/ directories and *.test.ts files - those are dev-only.

Write-Host ""
Write-Host "Tools:"
$toolsSourceDir = Join-Path $ScriptDir "tools"
Assert-SourceDir -Path $toolsSourceDir -Label "tools"
$toolFiles = Get-ChildItem -Path $toolsSourceDir -Filter "*.ts" -File -Recurse |
    Where-Object { $_.FullName -notmatch '[\\/]__tests__[\\/]' -and $_.Name -notlike '*.test.ts' } |
    Sort-Object FullName
foreach ($file in $toolFiles) {
    $rel = $file.FullName.Substring($toolsSourceDir.Length).TrimStart('\', '/')
    $targetPath = Join-Path $ToolsDir $rel
    $targetDir = Split-Path $targetPath -Parent
    if (-not (Test-Path $targetDir)) {
        New-Item -Path $targetDir -ItemType Directory -Force | Out-Null
    }
    Install-ConfigItem -Source $file.FullName -Target $targetPath -Label $rel
}

# -- Tool dependencies ------------------------------------------------------
# Tools under tools/ import 'zod' and '@opencode-ai/plugin/tool'. Declare them
# in ~/.config/opencode/package.json so OpenCode can resolve them at runtime.

Write-Host ""
Write-Host "Tool dependencies:"

$PkgJson = Join-Path $ConfigDir "package.json"
$ToolDeps = [ordered]@{
    "zod"                 = "latest"
    "@opencode-ai/plugin" = "latest"
}

if (-not (Test-Path $PkgJson -PathType Leaf)) {
    $newPkg = [ordered]@{
        name         = "opencode-config"
        private      = $true
        dependencies = $ToolDeps
    }
    try {
        ($newPkg | ConvertTo-Json -Depth 4) | Set-Content -Path $PkgJson -Encoding UTF8
        Write-Host "+" -ForegroundColor Green -NoNewline
        Write-Host " Created $PkgJson with zod and @opencode-ai/plugin"
    }
    catch {
        Write-Host "X" -ForegroundColor Red -NoNewline
        Write-Host " Failed to create ${PkgJson}: $($_.Exception.Message)"
    }
}
else {
    try {
        $pkg = Get-Content -Path $PkgJson -Raw -Encoding UTF8 | ConvertFrom-Json
        if (-not $pkg.PSObject.Properties.Match('dependencies').Count -or $null -eq $pkg.dependencies) {
            $pkg | Add-Member -NotePropertyName dependencies -NotePropertyValue ([pscustomobject]@{}) -Force
        }
        foreach ($name in $ToolDeps.Keys) {
            $version = $ToolDeps[$name]
            if (-not $pkg.dependencies.PSObject.Properties.Match($name).Count) {
                $pkg.dependencies | Add-Member -NotePropertyName $name -NotePropertyValue $version -Force
            }
            Write-Host "+" -ForegroundColor Green -NoNewline
            Write-Host " Ensured $name present in $PkgJson"
        }
        ($pkg | ConvertTo-Json -Depth 10) | Set-Content -Path $PkgJson -Encoding UTF8
    }
    catch {
        Write-Host "!" -ForegroundColor Yellow -NoNewline
        Write-Host " Failed to update $PkgJson (file may be invalid JSON or unreadable; inspect $PkgJson)"
    }
}

if (Get-Command bun -ErrorAction SilentlyContinue) {
    Push-Location $ConfigDir
    try {
        & bun install --silent
        if ($LASTEXITCODE -eq 0) {
            Write-Host "+" -ForegroundColor Green -NoNewline
            Write-Host " Ran bun install in $ConfigDir"
        }
        else {
            Write-Host "-" -ForegroundColor Yellow -NoNewline
            Write-Host " bun install failed - run 'bun install' manually in $ConfigDir"
        }
    }
    catch {
        Write-Host "-" -ForegroundColor Yellow -NoNewline
        Write-Host " bun install failed - run 'bun install' manually in $ConfigDir"
    }
    finally {
        Pop-Location
    }
}
else {
    Write-Host "-" -ForegroundColor Yellow -NoNewline
    Write-Host " bun not found - run 'bun install' manually in $ConfigDir"
}

# -- Summary ----------------------------------------------------------------

Write-Host ""
Write-Host "Done! $Installed items installed, $Skipped skipped."

# -- Annotations (optional) -------------------------------------------------

$isAnnotationsOk = $false
if ($Annotations) {
    Write-Host ""
    Write-Host "Setting up annotations..."
    try {
        $psExe = if ($PSVersionTable.PSEdition -eq "Core") { "pwsh" } else { "powershell" }
        & $psExe -NoProfile -File (Join-Path $ScriptDir "maintain-annotations.ps1")
        if ($LASTEXITCODE -eq 0) {
            $isAnnotationsOk = $true
        }
        else {
            throw "maintain-annotations.ps1 exited with code $LASTEXITCODE"
        }
    }
    catch {
        Write-Host "X" -ForegroundColor Red -NoNewline
        Write-Host " Annotation setup failed (config install succeeded - run maintain-annotations.ps1 manually)"
        Write-Warning $_.Exception.Message
    }
}

# -- Annotation access for agents ---------------------------------------------
# Agents read the annotation trees from arbitrary project directories, so
# OpenCode needs external_directory read permission on BOTH annotation roots.
# The config dir itself needs no entry - OpenCode always reads its own config.

if ($isAnnotationsOk) {
    Write-Host ""
    Write-Host "Annotation access for agents:"
    Write-Host 'Both entries below are required under "permission" in your opencode.json'
    Write-Host "(one per annotation directory - copy the block as-is):"
    Write-Host ""
    # Forward slashes keep the paths valid JSON without backslash escaping.
    $annotationsGlob = $AnnotationsDir.Replace('\', '/') + '/**'
    $framexmlGlob = $FrameXMLDir.Replace('\', '/') + '/**'
    Write-Host '  "external_directory": {' -ForegroundColor Cyan
    Write-Host ('    "' + $annotationsGlob + '": "allow",') -ForegroundColor Cyan
    Write-Host ('    "' + $framexmlGlob + '": "allow"') -ForegroundColor Cyan
    Write-Host '  }' -ForegroundColor Cyan
}

# -- Next steps -------------------------------------------------------------

Write-Host ""
Write-Host "Next steps:"
if ($isAnnotationsOk) {
    Write-Host "  1. See README.md for multi-flavor annotation details"
}
else {
    Write-Host "  1. Set up annotations:"
    Write-Host "     .\maintain-annotations.ps1"
    Write-Host "  2. See README.md for full setup instructions"
}

Write-Host ""
Write-Host "Installed to: $ConfigDir"
