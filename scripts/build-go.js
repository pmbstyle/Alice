#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function setupFFmpegForUser() {
  const platform = os.platform();
  const homeDir = os.homedir();
  
  // Create user's local bin directory if it doesn't exist
  const localBinDir = path.join(homeDir, '.local', 'bin');
  if (!fs.existsSync(localBinDir)) {
    fs.mkdirSync(localBinDir, { recursive: true });
    console.log(`Created directory: ${localBinDir}`);
  }
  
  // Copy bundled ffmpeg to user's PATH
  const sourceFfmpeg = path.join(process.cwd(), 'resources', 'backend', 'bin', 'ffmpeg');
  const targetFfmpeg = path.join(localBinDir, 'ffmpeg');
  
  if (fs.existsSync(sourceFfmpeg)) {
    try {
      fs.copyFileSync(sourceFfmpeg, targetFfmpeg);
      fs.chmodSync(targetFfmpeg, '755'); // Make executable
      console.log(`✅ Installed ffmpeg to user PATH: ${targetFfmpeg}`);
    } catch (error) {
      console.warn(`⚠️  Could not install ffmpeg to user PATH: ${error.message}`);
      console.log('Note: Whisper transcription may require manual ffmpeg installation');
    }
  } else {
    console.warn(`⚠️  Bundled ffmpeg not found at: ${sourceFfmpeg}`);
  }
}

function buildGoBackend() {
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
      setupFFmpegForUser();
    } else {
      throw new Error(`Binary not found at expected path: ${finalPath}`);
    }
  } catch (error) {
    console.error('Failed to build Go backend:', error.message);
    process.exit(1);
  }
}

buildGoBackend();