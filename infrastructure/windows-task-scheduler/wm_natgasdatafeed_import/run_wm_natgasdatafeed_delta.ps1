# Runs the WoodMac NatGas DataFeed delta mode with scheduler-level safeguards.

param(
    [string]$ConfigPath = "",
    [int]$MaxLockAgeMinutes = 120,
    [int]$LockWaitTimeoutSeconds = 0,
    [int]$LockRetryIntervalSeconds = 15,
    [int]$LockInactivityStaleMinutes = 30
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\wm_natgasdatafeed_task_lib.ps1"

$context = New-WmSchedulerContext `
    -ScriptDirectory $PSScriptRoot `
    -TaskName "HeliosCTA WM NatGas DataFeed Delta" `
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
    Invoke-WmScheduledSourceType -Context $context -SourceType "delta"
    Write-WmSchedulerLog -Context $context -Message "Delta wrapper completed successfully."
    exit 0
}
catch {
    Write-WmSchedulerLog -Context $context -Level "ERROR" -Message $_.Exception.Message
    exit 1
}
finally {
    Exit-WmSchedulerLock -Context $context
}
