@echo off
REM Build script for Alice AI Backend on Windows

echo Building Alice AI Backend...

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo Python is required but not found
    exit /b 1
)

REM Install build dependencies (minimal)
echo Installing build dependencies...
python -m pip install --upgrade pip
python -m pip install pyinstaller
python -m pip install -r requirements-build.txt
echo Note: AI models will be downloaded at runtime

REM Clean previous builds
echo Cleaning previous builds...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
if exist __pycache__ rmdir /s /q __pycache__
for /r %%i in (*.pyc) do del "%%i"
for /f "delims=" %%i in ('dir /ad /b /s __pycache__ 2^>nul') do rmdir /s /q "%%i"

REM Build with PyInstaller
echo Building executable...
pyinstaller --clean --noconfirm alice-ai-backend.spec

REM Create resources directory
if not exist "..\resources\python" mkdir "..\resources\python"

REM Copy executable
echo Copying executable...
xcopy /s /e /y "dist\alice-ai-backend\*" "..\resources\python\"

echo.
echo Build completed successfully
echo Executable created in ..\resources\python\