@echo off
REM ========================================
REM Alice AI - Frontend Build Script
REM ========================================
REM This script rebuilds only the frontend (Vue.js)
REM Use this for quick CSS/UI changes
REM ========================================

echo.
echo ========================================
echo Alice AI - Frontend Build
echo ========================================
echo.

REM Build the frontend
echo [1/3] Building Vue.js frontend...
call npm run build:web
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Frontend build failed!
    pause
    exit /b 1
)

echo.
echo [2/3] Packaging with Electron Builder...
echo NOTE: This requires Administrator privileges for symbolic links
echo.

REM Package with electron-builder (needs admin for symbolic links)
powershell -Command "Start-Process powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -Command \"cd ''%~dp0''; $env:CSC_IDENTITY_AUTO_DISCOVERY=''false''; npx electron-builder --win --x64\"' -Verb RunAs -Wait"

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Electron packaging failed!
    pause
    exit /b 1
)

echo.
echo [3/3] Build complete!
echo.
echo ========================================
echo Output Location:
echo ========================================
echo Installer: release\1.3.0\Alice-AI-App-Windows-1.3.0-Setup.exe
echo Unpacked:  release\1.3.0\win-unpacked\
echo ========================================
echo.

pause
