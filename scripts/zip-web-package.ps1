$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$buildRoot = Join-Path $projectRoot 'release\web-windows-x64'
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
$archivePath = Join-Path $projectRoot "release\世界工坊-$version-网页端-Windows-x64.zip"

if (-not (Test-Path -LiteralPath (Join-Path $buildRoot '启动世界工坊.bat'))) {
    throw '网页端打包目录不完整。'
}

if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
}

Add-Type -AssemblyName System.IO.Compression
$archiveStream = [System.IO.File]::Open(
    $archivePath,
    [System.IO.FileMode]::CreateNew,
    [System.IO.FileAccess]::ReadWrite,
    [System.IO.FileShare]::None
)
$archive = [System.IO.Compression.ZipArchive]::new(
    $archiveStream,
    [System.IO.Compression.ZipArchiveMode]::Create,
    $false
)

try {
    $rootPrefix = $buildRoot.TrimEnd('\', '/') + '\'
    Get-ChildItem -LiteralPath $buildRoot -Recurse -File | ForEach-Object {
        $entryName = $_.FullName.Substring($rootPrefix.Length).Replace('\', '/')
        $entry = $archive.CreateEntry($entryName, [System.IO.Compression.CompressionLevel]::Optimal)
        $sourceStream = [System.IO.File]::OpenRead($_.FullName)
        $entryStream = $entry.Open()
        try {
            $sourceStream.CopyTo($entryStream)
        } finally {
            $entryStream.Dispose()
            $sourceStream.Dispose()
        }
    }
} finally {
    $archive.Dispose()
}

$archive = Get-Item -LiteralPath $archivePath
Write-Host "Created $($archive.FullName) ($([math]::Round($archive.Length / 1MB, 2)) MiB)."
