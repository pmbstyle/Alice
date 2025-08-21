# PyInstaller spec file for Alice AI Backend

import os
import sys
from pathlib import Path

# Define paths
current_dir = os.path.dirname(os.path.abspath(SPEC))

# Add current directory to Python path
sys.path.insert(0, current_dir)
main_py = os.path.join(current_dir, 'main.py')

# Analysis configuration
a = Analysis(
    [main_py],
    pathex=[current_dir],
    binaries=[],
    datas=[
        # Include configuration files
        ('config.py', '.'),
        # Include all service modules
        ('services/*.py', 'services'),
        ('api/*.py', 'api'),
        ('utils/*.py', 'utils'),
    ],
    hiddenimports=[
        # Core dependencies
        'uvicorn',
        'fastapi',
        'pydantic',
        'pydantic_settings',
        'multipart',
        'aiofiles',
        
        # AI/ML libraries
        'faster_whisper',
        'sentence_transformers',
        'kokoro',
        'torch',
        'transformers',
        'numpy',
        
        # Audio processing
        'soundfile',
        'librosa',
        
        # Additional imports that might be missed
        'uvicorn.workers',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.websockets',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'uvicorn.main',
        
        # FastAPI internal modules
        'fastapi.responses',
        'fastapi.routing',
        'fastapi.middleware',
        'fastapi.middleware.cors',
        
        # Torch extensions
        'torch._C',
        'torch.distributed',
        
        # Sentence transformers modules
        'sentence_transformers.models',
        'sentence_transformers.evaluation',
        'sentence_transformers.readers',
        'sentence_transformers.losses',
        
        # Audio library internals
        'soundfile._soundfile_data',
        'librosa.core',
        'librosa.feature',
        'librosa.effects',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Exclude unnecessary modules to reduce size
        'matplotlib',
        'scipy.spatial.distance',
        'scipy.linalg',
        'PIL',
        'tkinter',
        'pytest',
        'ipython',
        'jupyter',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=None,
    noarchive=False,
)

# Remove duplicate binaries and data files
pyz = PYZ(a.pure, a.zipped_data, cipher=None)

# Executable configuration
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='alice-ai-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,  # Keep console for debugging, can be set to False for production
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)

# Collect all files into a single directory
coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='alice-ai-backend',
)