$pwshPath = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"

$scriptDir = $PSScriptRoot
$scriptPath = Join-Path $scriptDir "gasdatafeed_import.ps1"

$action = New-ScheduledTaskAction `
    -Execute $pwshPath `
    -Argument "-ExecutionPolicy Bypass -File `"$scriptPath`" -sourceType hourly -writeLog true -Verbose" `
    -WorkingDirectory $scriptDir

$triggers = @()
for ($hour = 0; $hour -le 23; $hour++) {
    $time1 = "{0:D2}:50" -f $hour
    $triggers += New-ScheduledTaskTrigger -Daily -At $time1
}

Register-ScheduledTask `
    -TaskName "wm_natgasdatafeed_import hourly" `
    -Action $action `
    -Trigger $triggers `
    -RunLevel Highest `
    -TaskPath "\helioscta-azure-backend\NatGas\" `
    -Force
