#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import https from 'https';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execAsync = promisify(exec);

// Configuration
const ONNX_RUNTIME_VERSION = '1.21.0';
const MODEL_NAME = 'sentence-transformers/all-MiniLM-L6-v2';
const BACKEND_DIR = path.join(__dirname, '..', 'backend');
const MODELS_DIR = path.join(BACKEND_DIR, 'models');
const LIB_DIR = path.join(BACKEND_DIR, 'lib');

// Platform-specific library configurations
const PLATFORMS = {
  'win32-x64': {
    url: `https://github.com/microsoft/onnxruntime/releases/download/v${ONNX_RUNTIME_VERSION}/onnxruntime-win-x64-${ONNX_RUNTIME_VERSION}.zip`,
    libFile: 'onnxruntime.dll',
    extractPath: `onnxruntime-win-x64-${ONNX_RUNTIME_VERSION}/lib/onnxruntime.dll`
  },
  'linux-x64': {
    url: `https://github.com/microsoft/onnxruntime/releases/download/v${ONNX_RUNTIME_VERSION}/onnxruntime-linux-x64-${ONNX_RUNTIME_VERSION}.tgz`,
    libFile: 'libonnxruntime.so',
    extractPath: `onnxruntime-linux-x64-${ONNX_RUNTIME_VERSION}/lib/libonnxruntime.so`
  },
  'darwin-arm64': {
    url: `https://github.com/microsoft/onnxruntime/releases/download/v${ONNX_RUNTIME_VERSION}/onnxruntime-osx-arm64-${ONNX_RUNTIME_VERSION}.tgz`,
    libFile: 'libonnxruntime.dylib',
    extractPath: `onnxruntime-osx-arm64-${ONNX_RUNTIME_VERSION}/lib/libonnxruntime.dylib`
  },
  'darwin-x64': {
    url: `https://github.com/microsoft/onnxruntime/releases/download/v${ONNX_RUNTIME_VERSION}/onnxruntime-osx-x64-${ONNX_RUNTIME_VERSION}.tgz`,
    libFile: 'libonnxruntime.dylib',
    extractPath: `onnxruntime-osx-x64-${ONNX_RUNTIME_VERSION}/lib/libonnxruntime.dylib`
  }
};

// Utility functions
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url}...`);
    const file = fs.createWriteStream(dest);

    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Download failed with status: ${response.statusCode}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log(`Downloaded: ${dest}`);
        resolve();
      });

      file.on('error', (err) => {
        fs.unlink(dest, () => {}); // Delete the file on error
        reject(err);
      });
    }).on('error', reject);
  });
}

async function extractArchive(archivePath, extractDir) {
  const ext = path.extname(archivePath);

  try {
    if (ext === '.zip') {
      // Use PowerShell on Windows, unzip on Unix
      if (process.platform === 'win32') {
        await execAsync(`powershell -command "Expand-Archive -Path '${archivePath}' -DestinationPath '${extractDir}' -Force"`);
      } else {
        await execAsync(`unzip -o "${archivePath}" -d "${extractDir}"`);
      }
    } else if (ext === '.tgz' || archivePath.endsWith('.tar.gz')) {
      await execAsync(`tar -xzf "${archivePath}" -C "${extractDir}"`);
    } else {
      throw new Error(`Unsupported archive format: ${ext}`);
    }

    console.log(`Extracted: ${archivePath}`);
  } catch (error) {
    throw new Error(`Failed to extract ${archivePath}: ${error.message}`);
  }
}

async function downloadOnnxRuntime() {
  console.log('Setting up ONNX Runtime libraries...');

  ensureDir(LIB_DIR);
  const tempDir = path.join(LIB_DIR, 'temp');
  ensureDir(tempDir);

  for (const [platform, config] of Object.entries(PLATFORMS)) {
    console.log(`\nDownloading ONNX Runtime for ${platform}...`);

    const platformDir = path.join(LIB_DIR, platform);
    ensureDir(platformDir);

    const archiveName = path.basename(config.url);
    const archivePath = path.join(tempDir, archiveName);
    const extractDir = path.join(tempDir, platform);
    ensureDir(extractDir);

    try {
      // Download
      await downloadFile(config.url, archivePath);

      // Extract
      await extractArchive(archivePath, extractDir);

      // Copy library file
      const sourceLib = path.join(extractDir, config.extractPath);
      const destLib = path.join(platformDir, config.libFile);

      if (fs.existsSync(sourceLib)) {
        fs.copyFileSync(sourceLib, destLib);
        console.log(`Copied library: ${destLib}`);
      } else {
        console.warn(`Library file not found: ${sourceLib}`);
      }

    } catch (error) {
      console.error(`Failed to setup ${platform}: ${error.message}`);
    }
  }

  // Clean up temp directory
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log('Cleaned up temporary files');
  } catch (error) {
    console.warn(`Failed to clean up temp directory: ${error.message}`);
  }
}

async function downloadModel() {
  console.log('\\nSetting up MiniLM model...');

  ensureDir(MODELS_DIR);
  const modelDir = path.join(MODELS_DIR, 'all-MiniLM-L6-v2');
  ensureDir(modelDir);

  try {
    // Check if Python is available
    await execAsync('python --version');

    console.log('Downloading model using Python...');

    const pythonScript = `
import os
import sys
try:
    from huggingface_hub import snapshot_download
    from transformers import AutoTokenizer
    import torch
    import onnx
    from optimum.onnxruntime import ORTModelForFeatureExtraction
except ImportError as e:
    print(f"Missing required package: {e}")
    print("Please install: pip install transformers torch onnx optimum[onnxruntime] huggingface_hub")
    sys.exit(1)

model_name = "${MODEL_NAME}"
output_dir = "${modelDir.replace(/\\/g, '/')}"

print(f"Downloading {model_name} to {output_dir}")

try:
    # Download tokenizer
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    tokenizer.save_pretrained(output_dir)
    print("Tokenizer downloaded")

    # Download and convert model to ONNX
    model = ORTModelForFeatureExtraction.from_pretrained(
        model_name,
        export=True,
        cache_dir=output_dir
    )
    model.save_pretrained(output_dir)
    print("ONNX model downloaded and converted")

    print("Model setup completed successfully!")

except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
`;

    // Write and execute Python script
    const scriptPath = path.join(modelDir, 'download_model.py');
    fs.writeFileSync(scriptPath, pythonScript);

    await execAsync(`python "${scriptPath}"`, { cwd: modelDir });

    // Clean up script
    fs.unlinkSync(scriptPath);

  } catch (error) {
    console.error('Failed to download model with Python. Please install the required packages:');
    console.error('pip install transformers torch onnx optimum[onnxruntime] huggingface_hub');
    console.error('\\nOr manually download the model files:');
    console.error(`- Download tokenizer.json from https://huggingface.co/${MODEL_NAME}/resolve/main/tokenizer.json`);
    console.error(`- Download model.onnx (you'll need to convert from PyTorch)`);
    console.error(`- Place them in: ${modelDir}`);
  }
}

async function main() {
  console.log('Setting up embeddings dependencies...');

  try {
    await downloadOnnxRuntime();
    await downloadModel();

    console.log('\\n✅ Embeddings setup completed!');
    console.log('\\nNext steps:');
    console.log('1. Update your Go code to use the new ONNX implementation');
    console.log('2. Update electron-builder.json5 to include the libraries');
    console.log('3. Test the embeddings service');

  } catch (error) {
    console.error('\\n❌ Setup failed:', error.message);
    process.exit(1);
  }
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}