param(
    [string]$ProjectRoot = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent),
    [string]$PythonPath = '',
    [switch]$Register
)
$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
if (-not $PythonPath) { $PythonPath = Join-Path $ProjectRoot '.venv\Scripts\python.exe' }
if (-not (Test-Path -LiteralPath $PythonPath)) { throw 'Provide -PythonPath with the GPU PC virtual environment python.exe.' }
$PythonPath = (Resolve-Path -LiteralPath $PythonPath).Path
$jobScript = Join-Path $ProjectRoot 'server\jobs\Run-AssistantJob.ps1'
if (-not (Test-Path -LiteralPath $jobScript)) { throw 'Run-AssistantJob.ps1 not found.' }
if ((Get-TimeZone).Id -ne 'Korea Standard Time') { throw 'Set the GPU PC time zone to Korea Standard Time before registering.' }
$plans = @(
    @{Name='SKU-AI-CollectNotices';Mode='Collect';Schedule='09:00, 13:00, 18:00'},
    @{Name='SKU-AI-DailyCheck';Mode='Daily';Schedule='08:50'},
    @{Name='SKU-AI-Reminders';Mode='Reminders';Schedule='Every 5 minutes'}
)
if (-not $Register) {
    $plans | ForEach-Object { [PSCustomObject]$_ } | Format-Table Name,Schedule
    Write-Output 'Preview only. Run on the GPU PC with -Register to create tasks.'
    return
}
if ($ProjectRoot.Contains('"') -or $PythonPath.Contains('"')) { throw 'Unsupported quote in path.' }
$shellPath = Join-Path $PSHOME 'powershell.exe'
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
foreach ($plan in $plans) {
    $arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" -Mode {1} -ProjectRoot "{2}" -PythonPath "{3}"' -f $jobScript,$plan.Mode,$ProjectRoot,$PythonPath
    $action = New-ScheduledTaskAction -Execute $shellPath -Argument $arguments -WorkingDirectory $ProjectRoot
    $triggers = switch ($plan.Mode) {
        'Collect' { @('09:00','13:00','18:00') | ForEach-Object { New-ScheduledTaskTrigger -Daily -At $_ } }
        'Daily' { New-ScheduledTaskTrigger -Daily -At '08:50' }
        'Reminders' { New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) }
    }
    $task = New-ScheduledTask -Action $action -Trigger $triggers -Principal $principal -Settings $settings
    Register-ScheduledTask -TaskName $plan.Name -InputObject $task -Force | Select-Object TaskName,State
}
