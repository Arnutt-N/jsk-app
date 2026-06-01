# Migrate console.error to logger.error in all app/**/*.tsx files
# (excluding critical boundaries: ErrorBoundary, websocket, AuthContext, error.tsx)

$ErrorActionPreference = "Stop"
$root = "d:\genAI\jsk-app\frontend"
$excludePatterns = @(
    "components\ui\ErrorBoundary.tsx",
    "lib\websocket\client.ts",
    "contexts\AuthContext.tsx",
    "app\admin\error.tsx",
    "app\liff\error.tsx"
)

# Get all .tsx files in app/ AND components/
$files = @()
$files += Get-ChildItem -Path "$root\app" -Recurse -Filter "*.tsx" -File
$files += Get-ChildItem -Path "$root\components" -Recurse -Filter "*.tsx" -File
$filesToMigrate = @()
foreach ($file in $files) {
    $relativePath = $file.FullName.Substring($root.Length + 1)
    $excluded = $false
    foreach ($pattern in $excludePatterns) {
        if ($relativePath -like "*$pattern*") {
            $excluded = $true
            break
        }
    }
    if (-not $excluded) {
        $content = [System.IO.File]::ReadAllText($file.FullName)
        if ($content -match "console\.error") {
            $filesToMigrate += $file
        }
    }
}

Write-Host "Found $($filesToMigrate.Count) files to migrate"

$totalReplacements = 0
$filesModified = 0

foreach ($file in $filesToMigrate) {
    $content = [System.IO.File]::ReadAllText($file.FullName)
    $original = $content

    # Check if logger import already exists
    $hasLoggerImport = $content -match "from .@/lib/logger."

    # Replace console.error(...) with logger.error(...)
    $content = [regex]::Replace($content, 'console\.error\(', 'logger.error(')

    # Add logger import if not present
    if (-not $hasLoggerImport) {
        # Find the last import line
        $lines = $content -split "`n"
        $lastImportIndex = -1
        for ($i = 0; $i -lt $lines.Count; $i++) {
            if ($lines[$i] -match "^import\s") {
                $lastImportIndex = $i
            }
        }
        if ($lastImportIndex -ge 0) {
            $newImport = "import { logger } from '@/lib/logger';"
            $newLines = New-Object System.Collections.Generic.List[string]
            for ($i = 0; $i -lt $lines.Count; $i++) {
                $newLines.Add($lines[$i])
                if ($i -eq $lastImportIndex) {
                    $newLines.Add($newImport)
                }
            }
            $content = [string]::Join("`n", $newLines.ToArray())
        }
    }

    if ($content -ne $original) {
        [System.IO.File]::WriteAllText($file.FullName, $content)
        $count = ([regex]::Matches($original, 'console\.error\(')).Count
        $totalReplacements += $count
        $filesModified++
        Write-Host "  Updated: $($file.Name) ($count replacements)"
    }
}

Write-Host ""
Write-Host "=== Migration Summary ==="
Write-Host "Files modified: $filesModified"
Write-Host "Total console.error -> logger.error replacements: $totalReplacements"
