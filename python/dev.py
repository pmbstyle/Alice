#!/usr/bin/env python3
"""
Development server for Alice AI Backend
Runs the backend with development-friendly settings
"""

import os
import sys
from pathlib import Path

# Add current directory to Python path
current_dir = Path(__file__).parent
sys.path.insert(0, str(current_dir))

# Set development environment variables
os.environ.setdefault('ALICE_HOST', '127.0.0.1')
os.environ.setdefault('ALICE_PORT', '8765')
os.environ.setdefault('ALICE_LOG_LEVEL', 'DEBUG')

# Import and run the main application
from main import app
import uvicorn

if __name__ == '__main__':
    print("Starting Alice AI Backend in development mode...")
    print(f"Server will be available at http://127.0.0.1:8765")
    print(f"Log level: DEBUG")
    print(f"Auto-reload enabled")
    print()
    
    # Run with development settings
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8765,
        reload=True,  # Auto-reload on file changes
        log_level="debug",
        access_log=True,
        reload_dirs=[str(current_dir)],  # Watch current directory for changes
        reload_includes=["*.py"],  # Only reload on Python file changes
    )