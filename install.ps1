param(
    [string]$Profile = 'desktop',
    [string]$DshHome = '',
    [string]$DesktopExecutable = '',
    [switch]$Check
)
$ErrorActionPreference = 'Stop'
try {
    if (-not $DesktopExecutable) {
        $DesktopExecutable = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\DeepSeek Harness.exe'
    }
    if (-not (Test-Path -LiteralPath $DesktopExecutable -PathType Leaf)) {
        throw 'Install DeepSeek Harness Desktop first, or pass -DesktopExecutable with its full path. See README.md.'
    }
    if ($Profile -eq 'desktop' -and -not $Check) {
        $running = Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue
        if ($running) { throw 'Quit DeepSeek Harness from its tray menu before installing. Closing its window is not enough.' }
    }
    $installArgs = @((Join-Path $PSScriptRoot 'scripts\install.mjs'), '--desktop-exe', $DesktopExecutable, '--profile', $Profile)
    if ($DshHome) { $installArgs += @('--home', $DshHome) }
    if ($Check) { $installArgs += '--check' }
    $oldNodeMode = $env:ELECTRON_RUN_AS_NODE
    try {
        $env:ELECTRON_RUN_AS_NODE = '1'
        & $DesktopExecutable @installArgs | Out-Host
        $result = $LASTEXITCODE
    } finally {
        $env:ELECTRON_RUN_AS_NODE = $oldNodeMode
    }
    exit $result
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
