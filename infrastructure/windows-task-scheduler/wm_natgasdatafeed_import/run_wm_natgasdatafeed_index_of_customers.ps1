# Runs WoodMac NatGas DataFeed Index of Customers manually with scheduler-level safeguards.

param(
    [string]$ConfigPath = "",
    [int]$MaxLockAgeMinutes = 360,
    [int]$LockWaitTimeoutSeconds = 0,
    [int]$LockRetryIntervalSeconds = 30,
    [int]$LockInactivityStaleMinutes = 60
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\wm_natgasdatafeed_task_lib.ps1"

$context = New-WmSchedulerContext `
    -ScriptDirectory $PSScriptRoot `
    -TaskName "HeliosCTA WM NatGas DataFeed Index of Customers Manual" `
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
    Invoke-WmScheduledSourceType `
        -Context $context `
        -SourceType "hourly" `
        -SourceName "index_of_customers"

    Write-WmSchedulerLog -Context $context -Message "Index of Customers manual wrapper completed successfully."
    exit 0
}
catch {
    Write-WmSchedulerLog -Context $context -Level "ERROR" -Message $_.Exception.Message
    exit 1
}
finally {
    Exit-WmSchedulerLock -Context $context
}
