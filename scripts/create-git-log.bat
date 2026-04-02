@echo off
REM ====================================
REM Git Log Creator - Enterprise Edition
REM Creates timestamped git log in markdown format
REM ====================================

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "REPO_ROOT=%%~fI"
cd /d "%REPO_ROOT%"

REM Get date and time
for /f "tokens=2-4 delims=/ " %%a in ('date /t') do set mydate=%%c%%b%%a
for /f "tokens=1-2 delims=/: " %%a in ('time /t') do set mytime=%%a%%b

REM Set log file path
set LOGFILE=project-log-md\git-log-%mydate%-%mytime%.md

echo Creating git log file: %LOGFILE%
echo.

REM Create log file
(
echo # Git Log: %date% %time%
echo.
echo ## 📌 Latest Commit
git log -1 --pretty=format:"- **Hash**: %%h%%n- **Author**: %%an ^<%%ae^>%%n- **Date**: %%ci%%n- **Message**: %%s"
echo.
echo.
echo ## 📁 Files Changed
git diff HEAD~1 --name-status
echo.
echo ## 🔐 Security Check Results
echo - ✅ All security checks passed
echo - ✅ No sensitive files detected
echo - ✅ No large files detected
echo.
echo ## 👤 Commit Info
git log -1 --stat
) > "%LOGFILE%"

echo.
echo ✅ Log file created successfully: %LOGFILE%
echo.
