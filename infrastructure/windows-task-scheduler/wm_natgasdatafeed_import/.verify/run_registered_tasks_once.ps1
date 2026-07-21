param (
    [string[]] $TaskNames = @(
        "wm_natgasdatafeed_import metadata",
        "wm_natgasdatafeed_import hourly",
        "wm_natgasdatafeed_import delta 20"
    ),
    [string] $TaskPath = "\helioscta-azure-backend\NatGas\",
    [int] $TimeoutSeconds = 900
)

foreach ($taskName in $TaskNames) {
    Write-Host "Starting $TaskPath$taskName"
    Start-ScheduledTask -TaskPath $TaskPath -TaskName $taskName

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        Start-Sleep -Seconds 5
        $task = Get-ScheduledTask -TaskPath $TaskPath -TaskName $taskName
        $info = Get-ScheduledTaskInfo -TaskPath $TaskPath -TaskName $taskName
        Write-Host ("  State={0}; LastTaskResult={1}; LastRunTime={2}" -f $task.State, $info.LastTaskResult, $info.LastRunTime)
    } while ($task.State -eq "Running" -and (Get-Date) -lt $deadline)

    if ($task.State -eq "Running") {
        Write-Host "  Timed out waiting for $taskName after $TimeoutSeconds seconds."
    }
}
