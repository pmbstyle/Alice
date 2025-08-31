#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import os from 'os'

/**
 * Setup required dependencies for out-of-box Alice AI experience
 * This ensures ffmpeg is available for Whisper transcription
 */
function setupFFmpegForUser() {
  const platform = os.platform()
  const homeDir = os.homedir()

  // Create user's local bin directory if it doesn't exist
  const localBinDir = path.join(homeDir, '.local', 'bin')
  if (!fs.existsSync(localBinDir)) {
    fs.mkdirSync(localBinDir, { recursive: true })
    console.log(`Created directory: ${localBinDir}`)
  }

  // Determine source path based on app structure
  let sourceFfmpeg

  // Check if we're in development or production
  if (process.env.NODE_ENV === 'development' || fs.existsSync('./resources')) {
    // Development or source build
    sourceFfmpeg = path.join(
      process.cwd(),
      'resources',
      'backend',
      'bin',
      'ffmpeg'
    )
  } else {
    // Production app bundle - ffmpeg should be in app.asar.unpacked
    sourceFfmpeg = path.join(process.resourcesPath, 'backend', 'bin', 'ffmpeg')
  }

  const targetFfmpeg = path.join(localBinDir, 'ffmpeg')

  // Skip if already installed
  if (fs.existsSync(targetFfmpeg)) {
    console.log(`✅ ffmpeg already available at: ${targetFfmpeg}`)
    return true
  }

  if (fs.existsSync(sourceFfmpeg)) {
    try {
      fs.copyFileSync(sourceFfmpeg, targetFfmpeg)
      fs.chmodSync(targetFfmpeg, '755') // Make executable
      console.log(`✅ Installed ffmpeg to user PATH: ${targetFfmpeg}`)
      return true
    } catch (error) {
      console.warn(
        `⚠️  Could not install ffmpeg to user PATH: ${error.message}`
      )
      console.log(
        'Note: Whisper transcription may require manual ffmpeg installation'
      )
      return false
    }
  } else {
    console.warn(`⚠️  Bundled ffmpeg not found at: ${sourceFfmpeg}`)
    return false
  }
}

/**
 * Setup all required dependencies
 */
function setupDependencies() {
  console.log('🔧 Setting up Alice AI dependencies...')

  const ffmpegSuccess = setupFFmpegForUser()

  if (ffmpegSuccess) {
    console.log('✅ All dependencies setup successfully!')
    console.log('🎤 Voice transcription is ready to use')
  } else {
    console.log('⚠️  Some dependencies could not be setup automatically')
    console.log(
      'Voice transcription may not work without manual ffmpeg installation'
    )
  }

  return ffmpegSuccess
}

// Export for use in Electron app
export { setupFFmpegForUser, setupDependencies }

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupDependencies()
}
