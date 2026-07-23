[CmdletBinding()]
param(
    [string]$CondaRoot = (Join-Path $env:USERPROFILE 'miniconda3'),
    [string]$CondaEnvironment = 'helioscta-azure-backend'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectRoot '.env'
$profilesFile = Join-Path $projectRoot 'profiles.yml'
$profilesExampleFile = Join-Path $projectRoot 'profiles.yml.example'
$profilesDir = $projectRoot
$condaEnvironmentPath = Join-Path $CondaRoot "envs\\$CondaEnvironment"
$dbtExecutable = Join-Path $condaEnvironmentPath 'Scripts\\dbt.exe'

if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
    throw "Missing dbt environment file: $envFile"
}

if (-not (Test-Path -LiteralPath $dbtExecutable -PathType Leaf)) {
    throw "dbt was not found in Conda environment '$CondaEnvironment': $dbtExecutable"
}

if (-not (Test-Path -LiteralPath $profilesFile -PathType Leaf)) {
    if (-not (Test-Path -LiteralPath $profilesExampleFile -PathType Leaf)) {
        throw "Missing dbt profiles file: $profilesFile or $profilesExampleFile"
    }

    $profilesDir = Join-Path ([System.IO.Path]::GetTempPath()) 'helioscta-dbt-profile'
    New-Item -ItemType Directory -Force -Path $profilesDir | Out-Null
    Copy-Item -Force -LiteralPath $profilesExampleFile -Destination (Join-Path $profilesDir 'profiles.yml')
}

$env:CONDA_PREFIX = $condaEnvironmentPath
$env:CONDA_DEFAULT_ENV = $CondaEnvironment
$env:Path = (Join-Path $condaEnvironmentPath 'Scripts') + ';' +
    (Join-Path $condaEnvironmentPath 'Library\\bin') + ';' +
    $condaEnvironmentPath + ';' +
    $env:Path

Get-Content -LiteralPath $envFile | ForEach-Object {
    $line = $_
    if ($line.Trim().Length -eq 0 -or $line.TrimStart().StartsWith('#')) {
        return
    }

    $separator = $line.IndexOf('=')
    if ($separator -lt 1) {
        return
    }

    $name = $line.Substring(0, $separator).Trim()
    $value = $line.Substring($separator + 1).Trim()
    if (
        $value.Length -ge 2 -and
        (($value[0] -eq "'" -and $value[$value.Length - 1] -eq "'") -or
            ($value[0] -eq '"' -and $value[$value.Length - 1] -eq '"'))
    ) {
        $value = $value.Substring(1, $value.Length - 2)
    }

    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
}

Push-Location $projectRoot
try {
    dbt test --profiles-dir $profilesDir --select tag:positions_trades_product_matching
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
