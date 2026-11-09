@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
set "dsh_result=%errorlevel%"
echo.
if not "%dsh_result%"=="0" echo Installation failed. Read the error above.
pause
exit /b %dsh_result%
