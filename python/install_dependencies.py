#!/usr/bin/env python3
"""
Install AI dependencies for Alice Python Backend
"""

import subprocess
import sys
import os
from pathlib import Path

def install_requirements():
    """Install requirements from requirements.txt"""
    requirements_file = Path(__file__).parent / "requirements.txt"
    
    if not requirements_file.exists():
        print(f"Error: {requirements_file} not found")
        return False
    
    print(f"Installing Python dependencies from {requirements_file}...")
    print("This may take several minutes for AI libraries...")
    
    try:
        # Install requirements
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", "-r", str(requirements_file)],
            check=True,
            capture_output=True,
            text=True
        )
        
        print("Dependencies installed successfully!")
        print("You can now use the local Python backend for STT, TTS, and embeddings.")
        return True
        
    except subprocess.CalledProcessError as e:
        print(f"Failed to install dependencies: {e}")
        print(f"STDOUT: {e.stdout}")
        print(f"STDERR: {e.stderr}")
        return False
    except Exception as e:
        print(f"Unexpected error: {e}")
        return False

if __name__ == "__main__":
    print("Alice AI Backend - Dependency Installer")
    print("=" * 50)
    
    success = install_requirements()
    
    if success:
        print("\nInstallation complete! The Python backend should now work with AI features.")
        print("Restart the Alice application to use the local backend.")
    else:
        print("\nInstallation failed. Please check the error messages above.")
        print("You may need to install Python dependencies manually:")
        print("pip install -r requirements.txt")
    
    input("\nPress Enter to exit...")