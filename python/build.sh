#!/bin/bash
# Build script for Alice AI Backend

set -e

echo "Building Alice AI Backend..."

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "Python 3 is required but not found"
    exit 1
fi

# Install dependencies
echo "Installing dependencies..."
pip3 install --upgrade pip
pip3 install pyinstaller
pip3 install -r requirements.txt

# Clean previous builds
echo "Cleaning previous builds..."
rm -rf build/ dist/ __pycache__/
find . -name "*.pyc" -delete
find . -name "__pycache__" -type d -exec rm -rf {} +

# Build with PyInstaller
echo "Building executable..."
pyinstaller --clean --noconfirm alice-ai-backend.spec

# Create resources directory
mkdir -p ../resources/python

# Copy executable
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    # Windows
    cp -r dist/alice-ai-backend/* ../resources/python/
else
    # macOS/Linux
    cp -r dist/alice-ai-backend/* ../resources/python/
    chmod +x ../resources/python/alice-ai-backend
fi

echo "Build completed successfully"
echo "Executable created in ../resources/python/"