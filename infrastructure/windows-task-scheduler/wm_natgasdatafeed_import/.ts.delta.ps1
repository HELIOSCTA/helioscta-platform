$pwshPath = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"

$scriptDir = $PSScriptRoot
$scriptPath = Join-Path $scriptDir "gasdatafeed_import.ps1"

$action = New-ScheduledTaskAction `
    -Execute $pwshPath `
    -Argument "-ExecutionPolicy Bypass -File `"$scriptPath`" -sourceType delta -writeLog true -Verbose" `
    -WorkingDirectory $scriptDir

# Split into separate tasks to stay under the 48-trigger Task Scheduler limit
$offsets = @(
    @{ Name = "delta 20"; Minute = "20" },
    @{ Name = "delta 30"; Minute = "30" },
    @{ Name = "delta 40"; Minute = "40" }
)

foreach ($offset in $offsets) {
    $triggers = @()
    for ($hour = 0; $hour -le 23; $hour++) {
        $triggers += New-ScheduledTaskTrigger -Daily -At ("{0:D2}:$($offset.Minute)" -f $hour)
    }

    Register-ScheduledTask `
        -TaskName "wm_natgasdatafeed_import $($offset.Name)" `
        -Action $action `
        -Trigger $triggers `
        -RunLevel Highest `
        -TaskPath "\helioscta-azure-backend\NatGas\" `
        -Force
}
