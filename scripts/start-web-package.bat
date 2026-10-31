@echo off
setlocal
if not exist "%~dp0start-server.ps1" (
  echo Missing start-server.ps1. Extract the entire ZIP first.
  pause
  exit /b 1
)
if not exist "%~dp0web-server.cs" (
  echo Missing web-server.cs. Extract the entire ZIP first.
  pause
  exit /b 1
)
if not exist "%~dp0web\index.html" (
  echo Missing web\index.html. Extract the entire ZIP first.
  pause
  exit /b 1
)
if not exist "%~dp0web\local-lifecycle.js" (
  echo Missing web\local-lifecycle.js. Extract the entire ZIP first.
  pause
  exit /b 1
)

if not exist "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" (
  echo Windows PowerShell could not be found.
  pause
  exit /b 1
)

start "" "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -WindowStyle Hidden -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-server.ps1"
exit /b 0
