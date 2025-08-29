#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// FFmpeg download URLs for different platforms
const FFMPEG_URLS = {
  'win32': 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
  'darwin': 'https://evermeet.cx/ffmpeg/ffmpeg-8.0.zip',  // Use available release version
  'linux': 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz'
};

// Whisper.cpp download URLs for different platforms (using aliceai.ca hosting for reliability)
const WHISPER_URLS = {
  'win32': 'https://aliceai.ca/app_assets/whisper/whisper-windows.zip',
  'darwin': {
    'x64': 'https://aliceai.ca/app_assets/whisper/whisper-macos-x64.zip',
    'arm64': 'https://aliceai.ca/app_assets/whisper/whisper-macos-arm64.zip'
  },
  'linux': {
    'x64': 'https://aliceai.ca/app_assets/whisper/whisper-linux-x64.zip'
  }
};

// Piper TTS download URLs for different platforms (using aliceai.ca hosting for reliability)
const PIPER_URLS = {
  'win32': 'https://aliceai.ca/app_assets/piper/piper-windows.zip',
  'darwin': {
    'x64': 'https://aliceai.ca/app_assets/piper/piper-macos-x64.zip',
    'arm64': 'https://aliceai.ca/app_assets/piper/piper-macos-arm64.zip'
  },
  'linux': {
    'x64': 'https://aliceai.ca/app_assets/piper/piper-linux-x64.zip'
  }
};

/**
 * Download a file from URL
 */
function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading: ${url}`);
    const file = fs.createWriteStream(outputPath);
    
    https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 302 || response.statusCode === 301) {
        file.close();
        fs.unlinkSync(outputPath);
        
        let redirectUrl = response.headers.location;
        // Handle relative redirects
        if (redirectUrl.startsWith('/')) {
          const urlObj = new URL(url);
          redirectUrl = `${urlObj.protocol}//${urlObj.host}${redirectUrl}`;
        }
        
        console.log(`Redirecting to: ${redirectUrl}`);
        return downloadFile(redirectUrl, outputPath)
          .then(resolve)
          .catch(reject);
      }
      
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(outputPath);
        return reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      file.close();
      fs.unlinkSync(outputPath);
      reject(err);
    });
  });
}

/**
 * Extract ffmpeg binary from downloaded archive
 */
function extractFFmpeg(archivePath, outputDir) {
  const platform = os.platform();
  
  try {
    if (platform === 'win32') {
      // Create a temporary extraction directory
      const tempDir = path.join(outputDir, 'temp_extract');
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      fs.mkdirSync(tempDir, { recursive: true });
      
      // Extract ZIP file using PowerShell on Windows with proper path escaping
      const normalizedArchivePath = archivePath.replace(/\//g, '\\');
      const normalizedTempDir = tempDir.replace(/\//g, '\\');
      const extractCmd = `powershell -command "Expand-Archive -Path '${normalizedArchivePath}' -DestinationPath '${normalizedTempDir}' -Force"`;
      
      console.log(`Running extraction command: ${extractCmd}`);
      execSync(extractCmd, { stdio: 'pipe' });
      
      // Find ffmpeg.exe in the extracted folder - look recursively
      function findFFmpegRecursive(dir) {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const item of items) {
          const fullPath = path.join(dir, item.name);
          
          if (item.isDirectory()) {
            const result = findFFmpegRecursive(fullPath);
            if (result) return result;
          } else if (item.name === 'ffmpeg.exe') {
            return fullPath;
          }
        }
        return null;
      }
      
      const ffmpegExePath = findFFmpegRecursive(tempDir);
      console.log(`Found ffmpeg at: ${ffmpegExePath}`);
      
      if (ffmpegExePath && fs.existsSync(ffmpegExePath)) {
        const targetPath = path.join(outputDir, 'ffmpeg.exe');
        fs.copyFileSync(ffmpegExePath, targetPath);
        console.log(`Copied ffmpeg to: ${targetPath}`);
        
        // Clean up temp directory
        fs.rmSync(tempDir, { recursive: true, force: true });
        return fs.existsSync(targetPath);
      } else {
        console.error('ffmpeg.exe not found in extracted files');
        // List extracted files for debugging
        console.log('Extracted contents:');
        function listDir(dir, indent = '') {
          const items = fs.readdirSync(dir, { withFileTypes: true });
          items.forEach(item => {
            console.log(`${indent}${item.isDirectory() ? '[DIR]' : '[FILE]'} ${item.name}`);
            if (item.isDirectory() && indent.length < 20) {
              listDir(path.join(dir, item.name), indent + '  ');
            }
          });
        }
        listDir(tempDir);
        
        // Clean up temp directory
        fs.rmSync(tempDir, { recursive: true, force: true });
        return false;
      }
    } else if (platform === 'darwin') {
      // Extract ZIP file on macOS
      execSync(`cd "${outputDir}" && unzip -o "${archivePath}"`, { stdio: 'inherit' });
      return fs.existsSync(path.join(outputDir, 'ffmpeg'));
    } else {
      // Extract tar.xz on Linux
      execSync(`cd "${outputDir}" && tar -xf "${archivePath}" --strip-components=1`, { stdio: 'inherit' });
      return fs.existsSync(path.join(outputDir, 'ffmpeg'));
    }
  } catch (error) {
    console.error('Extraction failed:', error.message);
    console.error('Full error:', error);
    return false;
  }
  
  return false;
}

/**
 * Extract whisper binary from downloaded archive
 */
function extractWhisper(archivePath, outputDir) {
  const platform = os.platform();
  
  try {
    if (platform === 'win32' || platform === 'darwin' || platform === 'linux') {
      // Create a temporary extraction directory
      const tempDir = path.join(outputDir, 'temp_extract_whisper');
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      fs.mkdirSync(tempDir, { recursive: true });
      
      let extractCmd;
      if (platform === 'win32') {
        // Extract ZIP file using PowerShell on Windows
        const normalizedArchivePath = archivePath.replace(/\//g, '\\');
        const normalizedTempDir = tempDir.replace(/\//g, '\\');
        extractCmd = `powershell -command "Expand-Archive -Path '${normalizedArchivePath}' -DestinationPath '${normalizedTempDir}' -Force"`;
      } else {
        // Extract ZIP file on macOS/Linux
        extractCmd = `cd "${tempDir}" && unzip -o "${archivePath}"`;
      }
      
      console.log(`Running whisper extraction command: ${extractCmd}`);
      execSync(extractCmd, { stdio: 'pipe' });
      
      // Find whisper binary in the extracted folder - look for whisper executables
      function findWhisperRecursive(dir) {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        
        // Priority order for whisper executables (based on new naming convention)
        const whisperExecutables = [
          'whisper-cli.exe', 'whisper-cli',
          'whisper-main.exe', 'whisper-main', 
          'main.exe', 'main',
          'whisper.exe', 'whisper',
          'whisper-macos-arm64', 'whisper-macos-x64',  // macOS specific names
          'whisper-linux-x64', 'whisper-linux-arm64'   // Linux specific names
        ];
        
        for (const item of items) {
          const fullPath = path.join(dir, item.name);
          
          if (item.isDirectory()) {
            const result = findWhisperRecursive(fullPath);
            if (result) return result;
          } else if (whisperExecutables.includes(item.name)) {
            return fullPath;
          }
        }
        return null;
      }
      
      const whisperExePath = findWhisperRecursive(tempDir);
      console.log(`Found whisper binary at: ${whisperExePath}`);
      
      if (whisperExePath && fs.existsSync(whisperExePath)) {
        const targetName = platform === 'win32' ? 'main.exe' : 'main';
        const targetPath = path.join(outputDir, targetName);
        fs.copyFileSync(whisperExePath, targetPath);
        console.log(`Copied whisper to: ${targetPath}`);
        
        // Copy all DLL dependencies for Windows
        if (platform === 'win32') {
          const requiredDlls = ['SDL2.dll', 'ggml-base.dll', 'ggml-cpu.dll', 'ggml.dll', 'whisper.dll'];
          
          function findAndCopyDlls(dir) {
            const items = fs.readdirSync(dir, { withFileTypes: true });
            
            for (const item of items) {
              const fullPath = path.join(dir, item.name);
              
              if (item.isDirectory()) {
                findAndCopyDlls(fullPath);
              } else if (requiredDlls.includes(item.name)) {
                const targetDllPath = path.join(outputDir, item.name);
                fs.copyFileSync(fullPath, targetDllPath);
                console.log(`Copied DLL: ${item.name}`);
              }
            }
          }
          
          findAndCopyDlls(tempDir);
        } else {
          // Make executable on Unix systems
          fs.chmodSync(targetPath, '755');
        }
        
        // Clean up temp directory
        fs.rmSync(tempDir, { recursive: true, force: true });
        return fs.existsSync(targetPath);
      } else {
        console.error('Whisper binary (main) not found in extracted files');
        
        // List extracted files for debugging
        console.log('Extracted contents:');
        function listDir(dir, indent = '') {
          if (!fs.existsSync(dir)) return;
          const items = fs.readdirSync(dir, { withFileTypes: true });
          items.forEach(item => {
            console.log(`${indent}${item.isDirectory() ? '[DIR]' : '[FILE]'} ${item.name}`);
            if (item.isDirectory() && indent.length < 20) {
              listDir(path.join(dir, item.name), indent + '  ');
            }
          });
        }
        listDir(tempDir);
        
        // Clean up temp directory
        fs.rmSync(tempDir, { recursive: true, force: true });
        return false;
      }
    }
  } catch (error) {
    console.error('Whisper extraction failed:', error.message);
    console.error('Full error:', error);
    return false;
  }
  
  return false;
}

/**
 * Extract piper binary from downloaded archive
 */
function extractPiper(archivePath, outputDir) {
  const platform = os.platform();
  
  try {
    if (platform === 'win32' || platform === 'darwin' || platform === 'linux') {
      // Create a temporary extraction directory
      const tempDir = path.join(outputDir, 'temp_extract_piper');
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      fs.mkdirSync(tempDir, { recursive: true });
      
      let extractCmd;
      if (platform === 'win32') {
        // Extract ZIP file using PowerShell on Windows
        const normalizedArchivePath = archivePath.replace(/\//g, '\\');
        const normalizedTempDir = tempDir.replace(/\//g, '\\');
        extractCmd = `powershell -command "Expand-Archive -Path '${normalizedArchivePath}' -DestinationPath '${normalizedTempDir}' -Force"`;
      } else {
        // Extract ZIP file on macOS/Linux
        extractCmd = `cd "${tempDir}" && unzip -o "${archivePath}"`;
      }
      
      console.log(`Running piper extraction command: ${extractCmd}`);
      try {
        execSync(extractCmd, { stdio: 'pipe' });
      } catch (error) {
        console.error('PowerShell extraction failed, trying alternative method...');
        console.error('Error:', error.message);
        
        // Alternative: Try using tar (Windows 10+ has built-in tar support)
        if (platform === 'win32') {
          try {
            const tarCmd = `tar -xf "${archivePath}" -C "${tempDir}"`;
            console.log(`Trying tar extraction: ${tarCmd}`);
            execSync(tarCmd, { stdio: 'pipe' });
          } catch (tarError) {
            console.error('Tar extraction also failed:', tarError.message);
            throw new Error('All extraction methods failed - Windows Defender may be blocking files');
          }
        }
      }
      
      // Find piper binary in the extracted folder
      function findPiperRecursive(dir) {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        
        const piperExecutables = ['piper.exe', 'piper'];
        
        for (const item of items) {
          const fullPath = path.join(dir, item.name);
          
          if (item.isDirectory()) {
            const result = findPiperRecursive(fullPath);
            if (result) return result;
          } else if (piperExecutables.includes(item.name)) {
            return fullPath;
          }
        }
        return null;
      }
      
      const piperExePath = findPiperRecursive(tempDir);
      console.log(`Found piper binary at: ${piperExePath}`);
      
      if (piperExePath && fs.existsSync(piperExePath)) {
        const targetName = platform === 'win32' ? 'piper.exe' : 'piper';
        const targetPath = path.join(outputDir, targetName);
        fs.copyFileSync(piperExePath, targetPath);
        console.log(`Copied piper to: ${targetPath}`);
        
        // Copy all DLL dependencies for Windows
        if (platform === 'win32') {
          const requiredDlls = ['espeak-ng.dll', 'onnxruntime.dll', 'onnxruntime_providers_shared.dll', 'piper_phonemize.dll'];
          
          function findAndCopyDlls(dir) {
            const items = fs.readdirSync(dir, { withFileTypes: true });
            
            for (const item of items) {
              const fullPath = path.join(dir, item.name);
              
              if (item.isDirectory()) {
                findAndCopyDlls(fullPath);
              } else if (requiredDlls.includes(item.name)) {
                const targetDllPath = path.join(outputDir, item.name);
                fs.copyFileSync(fullPath, targetDllPath);
                console.log(`Copied Piper DLL: ${item.name}`);
              }
            }
          }
          
          findAndCopyDlls(tempDir);
        } else {
          // Make executable on Unix systems
          fs.chmodSync(targetPath, '755');
        }
        
        // Clean up temp directory
        fs.rmSync(tempDir, { recursive: true, force: true });
        return fs.existsSync(targetPath);
      } else {
        console.error('Piper binary not found in extracted files');
        
        // List extracted files for debugging
        console.log('Extracted contents:');
        function listDir(dir, indent = '') {
          if (!fs.existsSync(dir)) return;
          const items = fs.readdirSync(dir, { withFileTypes: true });
          items.forEach(item => {
            console.log(`${indent}${item.isDirectory() ? '[DIR]' : '[FILE]'} ${item.name}`);
            if (item.isDirectory() && indent.length < 20) {
              listDir(path.join(dir, item.name), indent + '  ');
            }
          });
        }
        listDir(tempDir);
        
        // Clean up temp directory
        fs.rmSync(tempDir, { recursive: true, force: true });
        return false;
      }
    }
  } catch (error) {
    console.error('Piper extraction failed:', error.message);
    console.error('Full error:', error);
    return false;
  }
  
  return false;
}

/**
 * Download and setup piper binary if missing
 */
async function ensurePiper() {
  const platform = os.platform();
  const arch = os.arch();
  const backendBinDir = path.join(process.cwd(), 'resources', 'backend', 'bin');
  const piperPath = path.join(backendBinDir, platform === 'win32' ? 'piper.exe' : 'piper');
  
  // Check if piper already exists
  if (fs.existsSync(piperPath)) {
    console.log(`✅ Piper already available: ${piperPath}`);
    return true;
  }
  
  // Ensure bin directory exists
  if (!fs.existsSync(backendBinDir)) {
    fs.mkdirSync(backendBinDir, { recursive: true });
  }
  
  // Get download URL for platform
  let downloadUrl = PIPER_URLS[platform];
  
  // Handle architecture selection for macOS and Linux
  if (typeof downloadUrl === 'object') {
    if (platform === 'darwin') {
      downloadUrl = arch === 'arm64' ? downloadUrl.arm64 : downloadUrl.x64;
    } else if (platform === 'linux') {
      downloadUrl = downloadUrl.x64; // Default to x64 for Linux
    }
  }
  
  if (!downloadUrl) {
    console.warn(`⚠️  No piper download URL configured for platform: ${platform}/${arch}`);
    return false;
  }
  
  try {
    console.log(`📥 Downloading piper for ${platform}/${arch}...`);
    
    const archivePath = path.join(backendBinDir, 'piper-download.zip');
    
    // Download the archive
    await downloadFile(downloadUrl, archivePath);
    console.log('✅ Piper download completed');
    
    // Extract piper binary
    console.log('📦 Extracting piper binary...');
    const extractSuccess = extractPiper(archivePath, backendBinDir);
    
    // Clean up archive
    fs.unlinkSync(archivePath);
    
    if (extractSuccess && fs.existsSync(piperPath)) {
      console.log(`✅ Piper setup completed: ${piperPath}`);
      return true;
    } else {
      console.error('❌ Failed to extract piper binary');
      return false;
    }
  } catch (error) {
    console.error('❌ Failed to download piper:', error.message);
    return false;
  }
}

/**
 * Download and setup whisper binary if missing
 */
async function ensureWhisper() {
  const platform = os.platform();
  const arch = os.arch();
  const backendBinDir = path.join(process.cwd(), 'resources', 'backend', 'bin');
  const whisperPath = path.join(backendBinDir, platform === 'win32' ? 'main.exe' : 'main');
  
  // Check if whisper already exists
  if (fs.existsSync(whisperPath)) {
    console.log(`✅ Whisper already available: ${whisperPath}`);
    return true;
  }
  
  // Ensure bin directory exists
  if (!fs.existsSync(backendBinDir)) {
    fs.mkdirSync(backendBinDir, { recursive: true });
  }
  
  // Get download URL for platform
  let downloadUrl = WHISPER_URLS[platform];
  
  // Handle architecture selection for macOS and Linux
  if (typeof downloadUrl === 'object') {
    if (platform === 'darwin') {
      downloadUrl = arch === 'arm64' ? downloadUrl.arm64 : downloadUrl.x64;
    } else if (platform === 'linux') {
      downloadUrl = downloadUrl.x64; // Default to x64 for Linux
    }
  }
  
  if (!downloadUrl) {
    console.warn(`⚠️  No whisper download URL configured for platform: ${platform}/${arch}`);
    return false;
  }
  
  try {
    console.log(`📥 Downloading whisper for ${platform}/${arch}...`);
    
    const archivePath = path.join(backendBinDir, 'whisper-download.zip');
    
    // Download the archive
    await downloadFile(downloadUrl, archivePath);
    console.log('✅ Whisper download completed');
    
    // Extract whisper binary
    console.log('📦 Extracting whisper binary...');
    const extractSuccess = extractWhisper(archivePath, backendBinDir);
    
    // Clean up archive
    fs.unlinkSync(archivePath);
    
    if (extractSuccess && fs.existsSync(whisperPath)) {
      console.log(`✅ Whisper setup completed: ${whisperPath}`);
      return true;
    } else {
      console.error('❌ Failed to extract whisper binary');
      return false;
    }
  } catch (error) {
    console.error('❌ Failed to download whisper:', error.message);
    return false;
  }
}

/**
 * Download whisper base model if missing
 */
async function ensureWhisperModel() {
  const backendModelsDir = path.join(process.cwd(), 'resources', 'backend', 'models');
  const modelPath = path.join(backendModelsDir, 'whisper-base.bin');
  
  // Check if model already exists
  if (fs.existsSync(modelPath)) {
    console.log(`✅ Whisper model already available: ${modelPath}`);
    return true;
  }
  
  // Ensure models directory exists
  if (!fs.existsSync(backendModelsDir)) {
    fs.mkdirSync(backendModelsDir, { recursive: true });
  }
  
  try {
    console.log('📥 Downloading whisper base model...');
    const modelUrl = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin';
    
    await downloadFile(modelUrl, modelPath);
    console.log(`✅ Whisper model downloaded: ${modelPath}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to download whisper model:', error.message);
    console.log('Note: Whisper will try to download the model at runtime');
    return false;
  }
}

/**
 * Download and setup ffmpeg binary if missing
 */
async function ensureFFmpeg() {
  const platform = os.platform();
  const backendBinDir = path.join(process.cwd(), 'resources', 'backend', 'bin');
  const ffmpegPath = path.join(backendBinDir, platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  
  // Check if ffmpeg already exists
  if (fs.existsSync(ffmpegPath)) {
    console.log(`✅ FFmpeg already available: ${ffmpegPath}`);
    return true;
  }
  
  // Ensure bin directory exists
  if (!fs.existsSync(backendBinDir)) {
    fs.mkdirSync(backendBinDir, { recursive: true });
  }
  
  // Get download URL for platform
  const downloadUrl = FFMPEG_URLS[platform];
  if (!downloadUrl) {
    console.warn(`⚠️  No ffmpeg download URL configured for platform: ${platform}`);
    return false;
  }
  
  try {
    console.log(`📥 Downloading ffmpeg for ${platform}...`);
    
    // Determine archive filename based on URL
    const archiveExt = downloadUrl.includes('.zip') ? '.zip' : '.tar.xz';
    const archivePath = path.join(backendBinDir, `ffmpeg-download${archiveExt}`);
    
    // Download the archive
    await downloadFile(downloadUrl, archivePath);
    console.log('✅ Download completed');
    
    // Extract ffmpeg binary
    console.log('📦 Extracting ffmpeg binary...');
    const extractSuccess = extractFFmpeg(archivePath, backendBinDir);
    
    // Clean up archive
    fs.unlinkSync(archivePath);
    
    if (extractSuccess && fs.existsSync(ffmpegPath)) {
      // Make executable on Unix-like systems
      if (platform !== 'win32') {
        fs.chmodSync(ffmpegPath, '755');
      }
      console.log(`✅ FFmpeg setup completed: ${ffmpegPath}`);
      return true;
    } else {
      console.error('❌ Failed to extract ffmpeg binary');
      return false;
    }
  } catch (error) {
    console.error('❌ Failed to download ffmpeg:', error.message);
    return false;
  }
}

function setupFFmpegForUser() {
  const platform = os.platform();
  const homeDir = os.homedir();
  const isWindows = platform === 'win32';
  
  // Create user's local bin directory if it doesn't exist
  const localBinDir = path.join(homeDir, '.local', 'bin');
  if (!fs.existsSync(localBinDir)) {
    fs.mkdirSync(localBinDir, { recursive: true });
    console.log(`Created directory: ${localBinDir}`);
  }
  
  // Copy bundled ffmpeg to user's PATH (handle Windows .exe extension)
  const ffmpegName = isWindows ? 'ffmpeg.exe' : 'ffmpeg';
  const sourceFfmpeg = path.join(process.cwd(), 'resources', 'backend', 'bin', ffmpegName);
  const targetFfmpeg = path.join(localBinDir, ffmpegName);
  
  if (fs.existsSync(sourceFfmpeg)) {
    try {
      fs.copyFileSync(sourceFfmpeg, targetFfmpeg);
      // Make executable on Unix-like systems
      if (!isWindows) {
        fs.chmodSync(targetFfmpeg, '755');
      }
      console.log(`✅ Installed ffmpeg to user PATH: ${targetFfmpeg}`);
    } catch (error) {
      console.warn(`⚠️  Could not install ffmpeg to user PATH: ${error.message}`);
      console.log('Note: Whisper transcription may require manual ffmpeg installation');
    }
  } else {
    console.warn(`⚠️  Bundled ffmpeg not found at: ${sourceFfmpeg}`);
  }
}

async function buildGoBackend() {
  const platform = os.platform();
  const isWindows = platform === 'win32';
  
  // Ensure resources/backend directory exists
  const backendDir = path.join(process.cwd(), 'resources', 'backend');
  if (!fs.existsSync(backendDir)) {
    fs.mkdirSync(backendDir, { recursive: true });
  }
  
  // Determine output filename
  const outputName = isWindows ? 'alice-backend.exe' : 'alice-backend';
  const outputPath = path.join('..', 'resources', 'backend', outputName);
  
  // Build command
  const buildCmd = `cd backend && go build -ldflags="-s -w" -o "${outputPath}"`;
  
  console.log(`Building Go backend for ${platform}...`);
  console.log(`Command: ${buildCmd}`);
  
  try {
    execSync(buildCmd, { 
      stdio: 'inherit',
      shell: true 
    });
    
    // Verify the binary was created
    const finalPath = path.join(process.cwd(), 'resources', 'backend', outputName);
    if (fs.existsSync(finalPath)) {
      const stats = fs.statSync(finalPath);
      console.log(`Go backend built successfully: ${finalPath} (${Math.round(stats.size/1024/1024)}MB)`);
      
      // Setup ffmpeg for out-of-box experience
      console.log('\nSetting up ffmpeg for out-of-box transcription...');
      const ffmpegSuccess = await ensureFFmpeg();
      if (ffmpegSuccess) {
        setupFFmpegForUser();
      } else {
        console.warn('⚠️  FFmpeg download failed, transcription may not work properly');
        console.log('Note: You may need to install ffmpeg manually for voice transcription');
      }

      // Setup whisper for out-of-box transcription
      console.log('\nSetting up Whisper for out-of-box transcription...');
      const whisperSuccess = await ensureWhisper();
      if (!whisperSuccess) {
        console.warn('⚠️  Whisper download failed, will fallback to runtime download');
      }

      // Download Whisper model
      console.log('\nSetting up Whisper model...');
      const modelSuccess = await ensureWhisperModel();
      if (!modelSuccess) {
        console.warn('⚠️  Whisper model download failed, will fallback to runtime download');
      }

      // Note: Piper TTS will be downloaded at runtime to avoid Windows Defender issues
    } else {
      throw new Error(`Binary not found at expected path: ${finalPath}`);
    }
  } catch (error) {
    console.error('Failed to build Go backend:', error.message);
    process.exit(1);
  }
}

(async () => {
  try {
    await buildGoBackend();
  } catch (error) {
    console.error('Build failed:', error.message);
    process.exit(1);
  }
})();