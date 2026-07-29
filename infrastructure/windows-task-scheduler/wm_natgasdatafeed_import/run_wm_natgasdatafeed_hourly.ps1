# Runs WoodMac NatGas DataFeed metadata then scheduled hourly datasets with scheduler-level safeguards.

param(
    [string]$ConfigPath = "",
    [int]$MaxLockAgeMinutes = 180,
    [int]$LockWaitTimeoutSeconds = 900,
    [int]$LockRetryIntervalSeconds = 15,
    [int]$LockInactivityStaleMinutes = 30
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\wm_natgasdatafeed_task_lib.ps1"

$context = New-WmSchedulerContext `
    -ScriptDirectory $PSScriptRoot `
    -TaskName "HeliosCTA WM NatGas DataFeed Hourly" `
    -ConfigPath $ConfigPath

$lockResult = Enter-WmSchedulerLock `
    -Context $context `
    -MaxLockAgeMinutes $MaxLockAgeMinutes `
    -WaitTimeoutSeconds $LockWaitTimeoutSeconds `
    -RetryIntervalSeconds $LockRetryIntervalSeconds `
    -InactivityStaleMinutes $LockInactivityStaleMinutes

if (-not $lockResult.Acquired) {
    exit $lockResult.ExitCode
}

try {
    Invoke-WmScheduledSourceType -Context $context -SourceType "metadata"

    $scheduledHourlySources = @(
        "pipeline_inventory",
        "gas_production_forecast"
    )

    foreach ($scheduledHourlySource in $scheduledHourlySources) {
        Invoke-WmScheduledSourceType `
            -Context $context `
            -SourceType "hourly" `
            -SourceName $scheduledHourlySource
    }

    Write-WmSchedulerLog -Context $context -Message "Hourly wrapper completed successfully. scheduled_hourly_sources=$($scheduledHourlySources -join ',') manual_hourly_sources=index_of_customers"
    exit 0
}
catch {
    Write-WmSchedulerLog -Context $context -Level "ERROR" -Message $_.Exception.Message
    exit 1
}
finally {
    Exit-WmSchedulerLock -Context $context
}
