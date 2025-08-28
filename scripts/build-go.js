#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    } else {
      throw new Error(`Binary not found at expected path: ${finalPath}`);
    }
  } catch (error) {
    console.error('Failed to build Go backend:', error.message);
    process.exit(1);
  }
}

buildGoBackend();