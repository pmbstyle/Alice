@echo off
REM ========================================
REM Alice AI - Full Build Script
REM ========================================
REM This script rebuilds everything:
REM - Go Backend
REM - Vue.js Frontend
REM - Electron Installer
REM ========================================

echo.
echo ========================================
echo Alice AI - Full Build
echo ========================================
echo.

REM Check if Go is installed
go version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Go compiler not found!
    echo Please install Go from: https://go.dev/dl/
    pause
    exit /b 1
)

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found!
    echo Please install Node.js from: https://nodejs.org/
    pause
    exit /b 1
)

echo [1/4] Building Go backend...
call npm run build:go
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Go backend build failed!
    pause
    exit /b 1
)

echo.
echo [2/4] Building Vue.js frontend...
call npm run build:web
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Frontend build failed!
    pause
    exit /b 1
)

echo.
echo [3/4] Packaging with Electron Builder...
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
echo [4/4] Build complete!
echo.
echo ========================================
echo Build Summary:
echo ========================================
echo Backend:   resources\backend\alice-backend.exe
echo Frontend:  dist\
echo Installer: release\1.3.0\Alice-AI-App-Windows-1.3.0-Setup.exe
echo Unpacked:  release\1.3.0\win-unpacked\
echo ========================================
echo.
echo You can now run the installer or test from win-unpacked folder
echo.

pause
