# ---------------------------------------------------------------------------
# maintain-annotations.ps1 - Clone/update multi-flavor WoW annotation repos
#
# Manages two annotation sources:
#   1. Ketho's vscode-wow-api   -> ~/.local/share/wow-annotations/
#   2. NumyAddon FrameXML       -> ~/.local/share/wow-framexml/ (bare + worktrees)
#
# Usage:
#   .\maintain-annotations.ps1                        # Update all flavors
#   .\maintain-annotations.ps1 -Flavor live            # Update one flavor
#   .\maintain-annotations.ps1 -Flavor live,classic_era # Update specific flavors
#   .\maintain-annotations.ps1 -Help                   # Show help
#
# PowerShell 5.1+ compatible.
# ---------------------------------------------------------------------------

#Requires -Version 5.1

[CmdletBinding()]
param(
    [string[]]$Flavor,
    [switch]$Help
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# -- Constants --------------------------------------------------------------

$KethoRepo = "https://github.com/Ketho/vscode-wow-api"
$FrameXMLRepo = "https://github.com/NumyAddon/FramexmlAnnotations.git"
$AnnotationsDir = Join-Path $env:USERPROFILE (Join-Path ".local" (Join-Path "share" "wow-annotations"))
$FrameXMLDir = Join-Path $env:USERPROFILE (Join-Path ".local" (Join-Path "share" "wow-framexml"))
$BareDir = Join-Path $FrameXMLDir ".bare"

$FlavorBranches = @{
    "live"                  = "live-mix-into-source"
    "classic"               = "classic-mix-into-source"
    "classic_era"           = "classic_era-mix-into-source"
    "classic_anniversary"   = "classic_anniversary-mix-into-source"
}
$AllFlavors = @("live", "classic", "classic_era", "classic_anniversary")

# -- Help -------------------------------------------------------------------

if ($Help) {
    Write-Host ""
    Write-Host "maintain-annotations.ps1" -ForegroundColor Cyan
    Write-Host "  Clone or update WoW API annotation repositories."
    Write-Host ""
    Write-Host "Parameters:" -ForegroundColor Yellow
    Write-Host "  -Flavor <name[]>  Specific flavors to update (default: all)"
    Write-Host "                    Valid: live, classic, classic_era, classic_anniversary"
    Write-Host "  -Help             Show this help message"
    Write-Host ""
    Write-Host "Directories:" -ForegroundColor Yellow
    Write-Host "  Ketho annotations: $AnnotationsDir"
    Write-Host "  FrameXML flavors:  $FrameXMLDir"
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Yellow
    Write-Host "  .\maintain-annotations.ps1"
    Write-Host "  .\maintain-annotations.ps1 -Flavor live"
    Write-Host "  .\maintain-annotations.ps1 -Flavor live,classic_era"
    Write-Host ""
    exit 0
}

# -- Guard: git must be available -------------------------------------------

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "X" -ForegroundColor Red -NoNewline
    Write-Host " git is not installed or not in PATH. Install git first."
    exit 1
}

# -- Parse -Flavor into validated list --------------------------------------

$RequestedFlavors = if ($Flavor -and $Flavor.Count -gt 0) {
    foreach ($f in $Flavor) {
        if (-not $FlavorBranches.ContainsKey($f)) {
            Write-Host "X" -ForegroundColor Red -NoNewline
            Write-Host " Unknown flavor: '$f'"
            Write-Host "  Valid flavors: $($AllFlavors -join ', ')"
            exit 1
        }
    }
    $Flavor
} else {
    $AllFlavors
}

# -- Git wrapper ------------------------------------------------------------

function Invoke-GitCommand {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string[]]$Arguments,
        [Parameter(Mandatory)][string]$WorkingDir,
        [Parameter(Mandatory)][string]$Description
    )

    if (-not (Test-Path $WorkingDir -PathType Container)) {
        throw "Working directory not found: $WorkingDir"
    }

    Write-Host "  git $($Arguments -join ' ')" -ForegroundColor DarkGray
    Push-Location $WorkingDir
    try {
        & git @Arguments 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Git failed during '$Description' (exit code $LASTEXITCODE)"
        }
    } finally {
        Pop-Location
    }
}

# -- Ketho repo (shared Core annotations) -----------------------------------

function Update-KethoRepo {
    [CmdletBinding()]
    param()

    Write-Host ""
    Write-Host "Ketho annotations" -ForegroundColor Cyan
    Write-Host "  Directory: $AnnotationsDir"

    $isFirstRun = -not (Test-Path (Join-Path $AnnotationsDir ".git"))

    if ($isFirstRun) {
        Write-Host "  Cloning..." -ForegroundColor Yellow
        $parentDir = Split-Path $AnnotationsDir -Parent
        if (-not (Test-Path $parentDir -PathType Container)) {
            New-Item -Path $parentDir -ItemType Directory -Force | Out-Null
        }
        Invoke-GitCommand -Arguments @("clone", $KethoRepo, $AnnotationsDir) `
            -WorkingDir $parentDir `
            -Description "clone Ketho repo"
    } else {
        Write-Host "  Updating..." -ForegroundColor Yellow
        Invoke-GitCommand -Arguments @("pull", "--ff-only") `
            -WorkingDir $AnnotationsDir `
            -Description "pull Ketho repo"
    }

    # Init and update submodules (FrameXML submodule lives here)
    Write-Host "  Updating submodules..." -ForegroundColor Yellow
    Invoke-GitCommand -Arguments @("submodule", "update", "--init", "--recursive") `
        -WorkingDir $AnnotationsDir `
        -Description "update Ketho submodules"

    Write-Host "+" -ForegroundColor Green -NoNewline
    Write-Host " Ketho annotations up to date"
}

# -- FrameXML bare repo -----------------------------------------------------

function Update-BareRepo {
    [CmdletBinding()]
    param()

    $isFirstRun = -not (Test-Path $BareDir -PathType Container)

    if ($isFirstRun) {
        Write-Host "  Cloning bare repo..." -ForegroundColor Yellow
        if (-not (Test-Path $FrameXMLDir -PathType Container)) {
            New-Item -Path $FrameXMLDir -ItemType Directory -Force | Out-Null
        }
        Invoke-GitCommand -Arguments @("clone", "--bare", $FrameXMLRepo, $BareDir) `
            -WorkingDir $FrameXMLDir `
            -Description "clone bare FrameXML repo"
    } else {
        Write-Host "  Fetching bare repo..." -ForegroundColor Yellow
        Invoke-GitCommand -Arguments @("fetch", "--all", "--prune") `
            -WorkingDir $BareDir `
            -Description "fetch bare FrameXML repo"
    }
}

# -- Single flavor worktree -------------------------------------------------

function Update-Worktree {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$FlavorName,
        [Parameter(Mandatory)][string]$BranchName
    )

    $worktreeDir = Join-Path $FrameXMLDir $FlavorName
    $isFirstRun = -not (Test-Path $worktreeDir -PathType Container)

    if ($isFirstRun) {
        Write-Host "  Creating worktree for '$FlavorName'..." -ForegroundColor Yellow
        Invoke-GitCommand -Arguments @("worktree", "add", $worktreeDir, $BranchName) `
            -WorkingDir $BareDir `
            -Description "create worktree $FlavorName"
    } else {
        Write-Host "  Updating worktree for '$FlavorName'..." -ForegroundColor Yellow
        $currentBranch = & git -C $worktreeDir branch --show-current
        if ($currentBranch -ne $BranchName) {
            throw "Worktree $FlavorName is on '$currentBranch', expected '$BranchName'"
        }
        Invoke-GitCommand -Arguments @("pull", "--ff-only", "origin", $BranchName) `
            -WorkingDir $worktreeDir `
            -Description "pull $FlavorName"
    }

    Write-Host "+" -ForegroundColor Green -NoNewline
    Write-Host " $FlavorName up to date"
}

# -- Main -------------------------------------------------------------------

Write-Host ""
Write-Host "=== WoW Annotation Maintenance ===" -ForegroundColor Magenta
Write-Host "Flavors: $($RequestedFlavors -join ', ')"

# Always update Ketho repo first (provides shared Core/ annotations)
Update-KethoRepo

# Update bare repo once, then each flavor worktree
Write-Host ""
Write-Host "FrameXML annotations" -ForegroundColor Cyan
Write-Host "  Bare repo: $BareDir"
Update-BareRepo

foreach ($flavorName in $RequestedFlavors) {
    $branchName = $FlavorBranches[$flavorName]
    if (-not $branchName) {
        throw "No branch mapping for flavor: $flavorName"
    }

    Write-Host ""
    Write-Host "FrameXML: $flavorName" -ForegroundColor Cyan
    Write-Host "  Branch: $branchName"
    Write-Host "  Directory: $(Join-Path $FrameXMLDir $flavorName)"

    Update-Worktree -FlavorName $flavorName -BranchName $branchName
}

# -- Summary ----------------------------------------------------------------

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Green
Write-Host "  Ketho annotations: $AnnotationsDir"
foreach ($flavorName in $RequestedFlavors) {
    Write-Host "  FrameXML ${flavorName}: $(Join-Path $FrameXMLDir $flavorName)"
}
Write-Host ""
