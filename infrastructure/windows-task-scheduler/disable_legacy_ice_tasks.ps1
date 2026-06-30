# Stops and disables legacy per-feed ICE scheduled tasks during cutover.
#
# Run this from an elevated PowerShell session. It is intentionally separate
# from the coordinator installer because many legacy tasks were created with
# privileges that a normal user shell cannot modify.

#Requires -RunAsAdministrator

param(
    [string[]]$LegacyTaskPaths = @(
        "\helioscta-azure-backend\ICE Python\",
        "\helioscta-backend\ICE Python\",
        "\PJM DA\ICE Python\"
    ),
    [string]$BackupRoot = "C:\ProgramData\HeliosCTA\state\task-backups",
    [string]$OldServiceName = "HeliosCTA-IcePython",
    [switch]$KeepOldServiceAutomatic,
    [switch]$KeepRunningIceProcesses
)

$ErrorActionPreference = "Stop"

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = Join-Path $BackupRoot "ice-cutover-$timestamp"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$tasks = foreach ($path in $LegacyTaskPaths) {
    Get-ScheduledTask -TaskPath $path -ErrorAction SilentlyContinue
}

foreach ($task in $tasks) {
    $safeName = ($task.TaskPath.Trim("\") + "_" + $task.TaskName) -replace '[\\/:*?"<>| ]+', "_"
    $backupPath = Join-Path $backupDir "$safeName.xml"
    Export-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath |
        Set-Content -Path $backupPath -Encoding UTF8

    if ($task.State -eq "Running") {
        Stop-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath
    }
    Disable-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath | Out-Null

    [PSCustomObject]@{
        TaskPath = $task.TaskPath
        TaskName = $task.TaskName
        BackupPath = $backupPath
        State = (Get-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath).State
    }
}

if (-not $KeepRunningIceProcesses) {
    Get-CimInstance Win32_Process -Filter "name='python.exe'" |
        Where-Object {
            $_.CommandLine -like "*backend.orchestration.ice_python*" -or
            $_.CommandLine -like "*src\ice_python*"
        } |
        ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
            [PSCustomObject]@{
                StoppedProcessId = $_.ProcessId
                CommandLine = $_.CommandLine
            }
        }
}

$oldService = Get-Service -Name $OldServiceName -ErrorAction SilentlyContinue
if ($null -ne $oldService -and -not $KeepOldServiceAutomatic) {
    if ($oldService.Status -ne "Stopped") {
        Stop-Service -Name $OldServiceName -Force
    }
    Set-Service -Name $OldServiceName -StartupType Disabled
    Get-Service -Name $OldServiceName | Format-List Status,Name,StartType
}

Write-Host "Legacy ICE task backups: $backupDir"
