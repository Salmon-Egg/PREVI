param(
    [Parameter(Mandatory=$true)][ValidateSet('Collect','Daily','Reminders')][string]$Mode,
    [string]$ProjectRoot = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent),
    [string]$PythonPath = ''
)
$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
if (-not $PythonPath) { $PythonPath = Join-Path $ProjectRoot '.venv\Scripts\python.exe' }
if (-not (Test-Path -LiteralPath $PythonPath)) { throw 'PythonPath must point to the GPU PC virtual environment python.exe.' }
$jobMutex = New-Object System.Threading.Mutex($false, 'Global\SKU-AI-Assistant-Jobs')
$hasLock = $false
$jobExit = 1
try {
    try { $hasLock = $jobMutex.WaitOne(0) }
    catch [System.Threading.AbandonedMutexException] { $hasLock = $true }
    if (-not $hasLock) { exit 0 }
    Set-Location -LiteralPath $ProjectRoot
    $logDirectory = Join-Path $ProjectRoot 'logs'
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    $jobLog = Join-Path $logDirectory ($Mode.ToLower() + '-' + (Get-Date -Format 'yyyy-MM-dd') + '.log')
    $env:PYTHONUTF8 = '1'
    $jobArgs = switch ($Mode) {
        'Collect' { @('-m','server.jobs.collect_notices','--save','--pages','3','--max-posts','150') }
        'Daily' { @('-m','server.jobs.daily_check','--extract') }
        'Reminders' { @('-m','server.jobs.daily_check','--reminders-only') }
    }
    & $PythonPath @jobArgs *>> $jobLog
    $jobExit = $LASTEXITCODE
}
finally {
    if ($hasLock) { $jobMutex.ReleaseMutex() }
    $jobMutex.Dispose()
}
exit $jobExit
