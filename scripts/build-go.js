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
  'darwin': 'https://evermeet.cx/ffmpeg/getrelease/zip',
  'linux': 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz'
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
        return downloadFile(response.headers.location, outputPath)
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