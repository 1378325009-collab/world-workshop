$ErrorActionPreference = 'Stop'
$webRoot = Join-Path $PSScriptRoot 'web'
$serverSource = Join-Path $PSScriptRoot 'web-server.cs'
$diagnosticLog = Join-Path $env:TEMP 'world-workshop-startup.log'
$server = $null
$exitCode = 0

function Add-StartupDiagnostic {
    param([string]$Text)
    try {
        $line = "[$([DateTime]::Now.ToString('s'))] $Text`r`n"
        [System.IO.File]::AppendAllText($script:diagnosticLog, $line, [System.Text.Encoding]::Unicode)
    } catch { }
}

try {
    [System.IO.File]::WriteAllText($diagnosticLog, '', [System.Text.Encoding]::Unicode)
} catch { }

try {
    Add-StartupDiagnostic '检查启动文件'
    if (-not (Test-Path -LiteralPath (Join-Path $webRoot 'index.html'))) {
        throw '找不到网页资源。请先完整解压压缩包。'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $webRoot 'local-lifecycle.js'))) {
        throw '找不到页面关闭监测文件。请先完整解压压缩包。'
    }
    if (-not (Test-Path -LiteralPath $serverSource)) {
        throw '找不到本机网页服务文件。请先完整解压压缩包。'
    }

    Add-StartupDiagnostic '编译本机网页服务'
    Add-Type -Path $serverSource
    Add-StartupDiagnostic '绑定本机端口'
    $server = [WorldWorkshopWebServer]::new($webRoot, 8765)
    $server.Start()
    Add-StartupDiagnostic "本机网页服务已在端口 $($server.Port) 启动"

    if ($env:WORLDWORKSHOP_NO_BROWSER -ne '1') {
        $url = "http://127.0.0.1:$($server.Port)/"
        Start-Process -FilePath $url -ErrorAction Stop
        Add-StartupDiagnostic '已请求打开默认浏览器'
    }

    while (-not $server.ShouldStop) {
        Start-Sleep -Milliseconds 500
    }

    if ($server.StartupTimedOut) {
        throw '浏览器页面在 90 秒内没有连接本机服务。请重试；如果问题仍然存在，请检查默认浏览器设置。'
    }
} catch {
    $exitCode = 1
    Add-StartupDiagnostic ("ERROR: " + $_.Exception.ToString())
    $message = "启动失败：$($_.Exception.Message)"
    $message += "`r`n`r`n诊断日志：$diagnosticLog"
    if (-not [string]::IsNullOrWhiteSpace($_.ScriptStackTrace)) {
        $message += "`r`n`r`n$($_.ScriptStackTrace)"
    }

    $shown = $false
    try {
        $popup = New-Object -ComObject WScript.Shell
        [void]$popup.Popup($message, 0, '世界工坊启动失败', 16)
        $shown = $true
    } catch { }

    if (-not $shown) {
        try {
            Add-Type -AssemblyName System.Windows.Forms
            [void][System.Windows.Forms.MessageBox]::Show(
                $message,
                '世界工坊启动失败',
                [System.Windows.Forms.MessageBoxButtons]::OK,
                [System.Windows.Forms.MessageBoxIcon]::Error
            )
            $shown = $true
        } catch { }
    }

    if (-not $shown) {
        try {
            $errorPath = Join-Path $env:TEMP 'world-workshop-startup-error.txt'
            [System.IO.File]::WriteAllText($errorPath, $message, [System.Text.Encoding]::Unicode)
            Start-Process -FilePath notepad.exe -ArgumentList "`"$errorPath`"" -ErrorAction Stop
        } catch { }
    }
} finally {
    if ($null -ne $server) {
        $server.Stop()
    }
}

exit $exitCode
