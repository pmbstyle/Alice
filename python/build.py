#!/usr/bin/env python3
"""
Build script for Alice AI Backend using PyInstaller
Supports Windows, macOS, and Linux
"""

import os
import sys
import platform
import subprocess
import shutil
from pathlib import Path

def get_platform_info():
    """Get current platform information"""
    system = platform.system().lower()
    arch = platform.machine().lower()
    
    # Normalize architecture names
    if arch in ['x86_64', 'amd64']:
        arch = 'x64'
    elif arch in ['aarch64', 'arm64']:
        arch = 'arm64'
    elif arch in ['i386', 'i686', 'x86']:
        arch = 'ia32'
    
    return system, arch

def install_dependencies():
    """Install required dependencies (minimal build-time only)"""
    print("Installing build dependencies...")
    subprocess.run([sys.executable, '-m', 'pip', 'install', '--upgrade', 'pip'], check=True)
    subprocess.run([sys.executable, '-m', 'pip', 'install', 'pyinstaller'], check=True)
    
    # Use minimal requirements for build to avoid bundling large AI models
    subprocess.run([sys.executable, '-m', 'pip', 'install', '-r', 'requirements-build.txt'], check=True)
    print("Build dependencies installed successfully")
    print("Note: AI models will be downloaded at runtime")

def clean_build():
    """Clean previous build artifacts"""
    print("Cleaning previous build artifacts...")
    
    dirs_to_clean = ['build', 'dist', '__pycache__']
    files_to_clean = ['*.pyc']
    
    for dir_name in dirs_to_clean:
        if os.path.exists(dir_name):
            shutil.rmtree(dir_name)
            print(f"Removed {dir_name}/")
    
    # Clean pyc files recursively
    for root, dirs, files in os.walk('.'):
        for file in files:
            if file.endswith('.pyc'):
                os.remove(os.path.join(root, file))
        if '__pycache__' in dirs:
            shutil.rmtree(os.path.join(root, '__pycache__'))

def build_executable():
    """Build the executable using PyInstaller"""
    print("Building executable with PyInstaller...")
    
    cmd = [
        'pyinstaller',
        '--clean',
        '--noconfirm',
        'alice-ai-backend.spec'
    ]
    
    # Run PyInstaller
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"PyInstaller failed with return code {result.returncode}")
        print("STDOUT:", result.stdout)
        print("STDERR:", result.stderr)
        return False
    
    print("Build completed successfully")
    return True

def copy_to_electron_resources():
    """Copy built executable to Electron resources directory"""
    system, arch = get_platform_info()
    
    # Determine executable name and extension
    exe_name = 'alice-ai-backend'
    if system == 'windows':
        exe_name += '.exe'
    
    # Source path (PyInstaller output)
    src_dir = Path('dist/alice-ai-backend')
    src_exe = src_dir / exe_name
    
    if not src_exe.exists():
        print(f"Error: Built executable not found at {src_exe}")
        return False
    
    # Destination path (Electron resources)
    dest_dir = Path('../resources/python')
    dest_dir.mkdir(parents=True, exist_ok=True)
    
    # Copy the entire dist directory contents
    print(f"Copying executable to {dest_dir}...")
    
    # Remove existing files
    if dest_dir.exists():
        shutil.rmtree(dest_dir)
    
    # Copy the entire distribution
    shutil.copytree(src_dir, dest_dir)
    
    # Make executable on Unix-like systems
    if system in ['darwin', 'linux']:
        dest_exe = dest_dir / exe_name
        os.chmod(dest_exe, 0o755)
    
    print(f"Executable copied to {dest_dir / exe_name}")
    return True

def verify_build():
    """Verify that the built executable works"""
    system, arch = get_platform_info()
    
    exe_name = 'alice-ai-backend'
    if system == 'windows':
        exe_name += '.exe'
    
    exe_path = Path('../resources/python') / exe_name
    
    if not exe_path.exists():
        print(f"Error: Executable not found at {exe_path}")
        return False
    
    print("Verifying executable...")
    
    # Test that the executable can be run (just check that it imports properly)
    try:
        # Start the process and terminate it quickly to verify it can initialize
        process = subprocess.Popen([str(exe_path)], 
                                 stdout=subprocess.PIPE, 
                                 stderr=subprocess.PIPE)
        
        # Wait a short time to see if it crashes immediately
        try:
            stdout, stderr = process.communicate(timeout=3)
            # If it exits within 3 seconds, check why
            if process.returncode != 0:
                print(f"Executable verification failed with return code {process.returncode}")
                if stderr:
                    print("STDERR:", stderr.decode())
                return False
        except subprocess.TimeoutExpired:
            # Process is still running after 3 seconds, that's good
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
            print("Executable verification successful - process started correctly")
            return True
        
        print("Executable verification successful")
        return True
    
    except Exception as e:
        print(f"Executable verification failed: {e}")
        return False

def main():
    """Main build process"""
    system, arch = get_platform_info()
    print(f"Building Alice AI Backend for {system}-{arch}")
    
    try:
        # Step 1: Install build dependencies (minimal)
        install_dependencies()
        
        # Step 2: Clean previous builds
        clean_build()
        
        # Step 3: Build executable
        if not build_executable():
            print("Build failed")
            sys.exit(1)
        
        # Step 4: Copy to Electron resources
        if not copy_to_electron_resources():
            print("Failed to copy executable")
            sys.exit(1)
        
        # Step 5: Verify build
        if not verify_build():
            print("WARNING: Build verification failed, but executable was created")
        
        print("Build process completed successfully")
        print(f"Executable created for {system}-{arch}")
        
    except KeyboardInterrupt:
        print("\nBuild process interrupted")
        sys.exit(1)
    except Exception as e:
        print(f"Build failed with error: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()