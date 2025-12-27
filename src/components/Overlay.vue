<template>
  <div id="overlay">
    <canvas ref="canvasRef" class="overlay-canvas"></canvas>
  </div>
</template>

<script setup>
import { nextTick, onMounted, onBeforeUnmount, ref } from 'vue'

let startX, startY
let currentX, currentY
let isSelecting = false
const canvasRef = ref(null)
let ctx = null
let animationFrameId = null

function startAnimationLoop() {
  if (animationFrameId !== null) return
  const loop = () => {
    draw()
    if (isSelecting) {
      animationFrameId = requestAnimationFrame(loop)
    } else {
      animationFrameId = null
    }
  }
  animationFrameId = requestAnimationFrame(loop)
}

function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  const dpr = window.devicePixelRatio || 1
  const width = window.innerWidth
  const height = window.innerHeight
  if (width === 0 || height === 0) {
    return
  }
  canvas.width = Math.floor(width * dpr)
  canvas.height = Math.floor(height * dpr)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  draw()
}

function draw() {
  if (!ctx) return
  const width = window.innerWidth
  const height = window.innerHeight
  ctx.clearRect(0, 0, width, height)

  if (!isSelecting) return
  const x = Math.min(startX, currentX)
  const y = Math.min(startY, currentY)
  const w = Math.abs(currentX - startX)
  const h = Math.abs(currentY - startY)

  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  ctx.strokeRect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2))
}

function onMouseDown(e) {
  console.log('Mouse down detected', e.clientX, e.clientY)
  resizeCanvas()
  startX = e.clientX
  startY = e.clientY
  currentX = startX
  currentY = startY
  isSelecting = true
  draw()
  startAnimationLoop()
}

function onMouseMove(e) {
  if (!isSelecting) return
  currentX = e.clientX
  currentY = e.clientY
  draw()
}

async function onMouseUp(e) {
  if (!isSelecting) return
  console.log('Mouse up detected')
  const rect = {
    x: Math.min(startX, currentX),
    y: Math.min(startY, currentY),
    width: Math.abs(currentX - startX),
    height: Math.abs(currentY - startY),
  }

  if (rect.width < 10 || rect.height < 10) {
    isSelecting = false
    draw()
    return
  }

  isSelecting = false
  draw()
  animationFrameId = null

  try {
    await window.ipcRenderer.invoke('set-overlay-opacity', 0)
    await new Promise(resolve => setTimeout(resolve, 50))
    const source = (await window.ipcRenderer.invoke('capture-screen'))[0]
    const image = await navigator.mediaDevices.getUserMedia({
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: source.id,
          minWidth: screen.width,
          maxWidth: screen.width,
          minHeight: screen.height,
          maxHeight: screen.height,
        },
      },
    })

    const track = image.getVideoTracks()[0]
    const capture = new ImageCapture(track)
    const bitmap = await capture.grabFrame()
    track.stop()

    const canvas = document.createElement('canvas')
    canvas.width = rect.width
    canvas.height = rect.height
    const context = canvas.getContext('2d')
    context.drawImage(
      bitmap,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      rect.width,
      rect.height
    )
    const dataURL = canvas.toDataURL('image/jpeg', 0.8)
    window.ipcRenderer.invoke('save-screenshot', dataURL)
    window.ipcRenderer.invoke('hide-overlay')
  } catch (error) {
    console.error('Error taking screenshot:', error)
    window.ipcRenderer.invoke('hide-overlay')
  }
}

function onKeyDown(e) {
  if (e.key === 'Escape') {
    isSelecting = false
    draw()
    animationFrameId = null
    window.ipcRenderer.invoke('hide-overlay')
  }
}

onMounted(() => {
  console.log('Overlay component mounted')
  nextTick(() => {
    resizeCanvas()
  })
  window.addEventListener('resize', resizeCanvas)
  window.addEventListener('focus', resizeCanvas)
  if (window.ipcRenderer) {
    window.ipcRenderer.on('overlay-shown', () => {
      resizeCanvas()
    })
  }
  document.addEventListener('mousedown', onMouseDown)
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
  document.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  if (window.ipcRenderer) {
    window.ipcRenderer.removeAllListeners('overlay-shown')
  }
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
  window.removeEventListener('resize', resizeCanvas)
  window.removeEventListener('focus', resizeCanvas)
  document.removeEventListener('mousedown', onMouseDown)
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
  document.removeEventListener('keydown', onKeyDown)
  isSelecting = false
})
</script>

<style>
body,
html {
  margin: 0;
  padding: 0;
  overflow: hidden;
  background: transparent;
}
#overlay {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  cursor: crosshair;
  z-index: 9999;
  background-color: transparent;
}
.overlay-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
</style>
