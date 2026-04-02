param(
  [string]$Platform = ""
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$validator = Join-Path $repoRoot ".agents\scripts\validate_handoff_state.py"

if (-not (Test-Path $validator)) {
  Write-Error "Validator not found: $validator"
  exit 1
}

$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCmd) {
  Write-Error "Python executable not found in PATH."
  exit 1
}

Push-Location $repoRoot
try {
  if ([string]::IsNullOrWhiteSpace($Platform)) {
    & python $validator
  } else {
    & python $validator --platform $Platform
  }
  exit $LASTEXITCODE
}
finally {
  Pop-Location
}
