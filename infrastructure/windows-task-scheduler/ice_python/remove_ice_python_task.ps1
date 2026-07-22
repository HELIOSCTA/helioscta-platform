# Removes the local-only ICE Python Windows Task Scheduler coordinator.

param(
    [string]$TaskName = "HeliosCTA ICE Python Coordinator",
    [string]$TaskPath = "\HeliosCTA\ICE Python\"
)

$ErrorActionPreference = "Stop"

$task = Get-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -ErrorAction SilentlyContinue
if ($null -eq $task) {
    Write-Host "Task not found: $TaskPath$TaskName"
    exit 0
}

Unregister-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -Confirm:$false
Write-Host "Removed Task Scheduler coordinator: $TaskPath$TaskName"
