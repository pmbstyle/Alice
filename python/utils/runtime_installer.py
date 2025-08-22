"""
Runtime dependency installer for AI models and packages.
Downloads and installs packages when first needed to avoid bundling.
"""

import asyncio
import logging
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Dict, List, Optional

from utils.logger import get_logger

logger = get_logger(__name__)


class RuntimeInstaller:
    """Manages runtime installation of AI dependencies."""
    
    def __init__(self):
        self.installed_packages: Dict[str, bool] = {}
        self.install_lock = asyncio.Lock()
        self.requirements_file = Path(__file__).parent.parent / "requirements-runtime.txt"
    
    async def ensure_package_installed(self, package_name: str, import_test: callable = None) -> bool:
        """
        Ensure a package is installed, installing it if necessary.
        
        Args:
            package_name: Name of the package to check/install
            import_test: Optional callable to test if package is working
        
        Returns:
            True if package is available, False otherwise
        """
        # Check if already confirmed installed
        if self.installed_packages.get(package_name, False):
            return True
        
        async with self.install_lock:
            # Double-check after acquiring lock
            if self.installed_packages.get(package_name, False):
                return True
            
            try:
                # First try to import
                if import_test:
                    try:
                        import_test()
                        self.installed_packages[package_name] = True
                        logger.info(f"Package {package_name} is already available")
                        return True
                    except ImportError:
                        pass
                
                # Package not available, install it
                logger.info(f"Installing {package_name} at runtime...")
                success = await self._install_package(package_name)
                
                if success and import_test:
                    # Test import after installation
                    try:
                        import_test()
                        self.installed_packages[package_name] = True
                        logger.info(f"Package {package_name} installed and verified successfully")
                        return True
                    except ImportError as e:
                        logger.error(f"Package {package_name} installed but import failed: {e}")
                        return False
                elif success:
                    self.installed_packages[package_name] = True
                    logger.info(f"Package {package_name} installed successfully")
                    return True
                else:
                    logger.error(f"Failed to install package {package_name}")
                    return False
                    
            except Exception as e:
                logger.error(f"Error ensuring package {package_name}: {e}")
                return False
    
    async def _install_package(self, package_name: str) -> bool:
        """Install a specific package using pip."""
        try:
            # Get package requirements from runtime requirements file
            package_specs = await self._get_package_specs()
            package_spec = package_specs.get(package_name)
            
            if not package_spec:
                # Fallback to basic package name
                package_spec = package_name
                logger.warning(f"No version spec found for {package_name}, using basic name")
            
            # Run pip install in a subprocess
            cmd = [sys.executable, "-m", "pip", "install", package_spec]
            
            logger.info(f"Running: {' '.join(cmd)}")
            
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await process.communicate()
            
            if process.returncode == 0:
                logger.info(f"Successfully installed {package_name}")
                if stdout:
                    logger.debug(f"Install output: {stdout.decode()}")
                return True
            else:
                logger.error(f"Failed to install {package_name}. Return code: {process.returncode}")
                if stderr:
                    logger.error(f"Install error: {stderr.decode()}")
                return False
                
        except Exception as e:
            logger.error(f"Exception during package installation: {e}")
            return False
    
    async def _get_package_specs(self) -> Dict[str, str]:
        """Parse runtime requirements file to get package specifications."""
        specs = {}
        
        try:
            if self.requirements_file.exists():
                with open(self.requirements_file, 'r') as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith('#'):
                            # Parse package name and version spec
                            if '>=' in line:
                                name, version = line.split('>=', 1)
                                specs[name.strip()] = f"{name.strip()}>={version.strip()}"
                            elif '==' in line:
                                name, version = line.split('==', 1)
                                specs[name.strip()] = f"{name.strip()}=={version.strip()}"
                            else:
                                specs[line.strip()] = line.strip()
            else:
                logger.warning(f"Runtime requirements file not found: {self.requirements_file}")
                
        except Exception as e:
            logger.error(f"Error parsing requirements file: {e}")
        
        return specs
    
    async def install_ai_dependencies(self) -> bool:
        """Install all AI dependencies at once."""
        logger.info("Installing AI dependencies at runtime...")
        
        try:
            # Install from runtime requirements file
            cmd = [sys.executable, "-m", "pip", "install", "-r", str(self.requirements_file)]
            
            logger.info(f"Running: {' '.join(cmd)}")
            
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await process.communicate()
            
            if process.returncode == 0:
                logger.info("Successfully installed all AI dependencies")
                if stdout:
                    logger.debug(f"Install output: {stdout.decode()}")
                
                # Mark all packages as installed
                self.installed_packages.update({
                    'faster-whisper': True,
                    'sentence-transformers': True,
                    'kokoro': True,
                    'torch': True,
                    'soundfile': True,
                    'librosa': True,
                    'transformers': True
                })
                
                return True
            else:
                logger.error(f"Failed to install AI dependencies. Return code: {process.returncode}")
                if stderr:
                    logger.error(f"Install error: {stderr.decode()}")
                return False
                
        except Exception as e:
            logger.error(f"Exception during AI dependencies installation: {e}")
            return False
    
    def is_package_installed(self, package_name: str) -> bool:
        """Check if a package is marked as installed."""
        return self.installed_packages.get(package_name, False)


# Global runtime installer instance
runtime_installer = RuntimeInstaller()