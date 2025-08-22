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
        # Include any data files needed at runtime (not Python modules)
    ],
    hiddenimports=[
        # Local application modules
        'config',
        'main',
        'services',
        'services.stt',
        'services.tts', 
        'services.embeddings',
        'api',
        'api.stt',
        'api.tts',
        'api.embeddings',
        'utils',
        'utils.logger',
        'utils.runtime_installer',
        
        # Core dependencies only (AI libraries installed at runtime)
        'uvicorn',
        'fastapi',
        'pydantic',
        'pydantic_settings',
        'multipart',
        'aiofiles',
        'numpy',
        
        # FastAPI/Uvicorn internals
        'uvicorn.workers',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.websockets',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'uvicorn.main',
        'fastapi.responses',
        'fastapi.routing',
        'fastapi.middleware',
        'fastapi.middleware.cors',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Exclude AI libraries (will be installed at runtime)
        'torch',
        'torchvision',
        'torchaudio',
        'transformers',
        'sentence_transformers',
        'faster_whisper',
        'kokoro',
        'soundfile',
        'librosa',
        'sklearn',
        'scipy',
        'matplotlib',
        'PIL',
        'tkinter',
        'pytest',
        'ipython',
        'jupyter',
        'cv2',
        'tf',
        'tensorflow',
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