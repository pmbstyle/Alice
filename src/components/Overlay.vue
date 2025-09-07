<template>
  <div id="overlay"></div>
</template>

<script setup>
import { onMounted, onBeforeUnmount } from 'vue'

let startX, startY, selectionBox

function onMouseDown(e) {
  console.log('Mouse down detected', e.clientX, e.clientY)
  startX = e.clientX
  startY = e.clientY
  selectionBox = document.createElement('div')
  selectionBox.classList.add('selection-box')
  selectionBox.style.left = `${startX}px`
  selectionBox.style.top = `${startY}px`
  selectionBox.style.width = '0px'
  selectionBox.style.height = '0px'
  document.body.appendChild(selectionBox)
}

function onMouseMove(e) {
  if (!selectionBox) return
  const currentX = e.clientX
  const currentY = e.clientY
  selectionBox.style.width = `${Math.abs(currentX - startX)}px`
  selectionBox.style.height = `${Math.abs(currentY - startY)}px`
  selectionBox.style.left = `${Math.min(startX, currentX)}px`
  selectionBox.style.top = `${Math.min(startY, currentY)}px`
}

async function onMouseUp(e) {
  if (!selectionBox) return
  console.log('Mouse up detected')
  const rect = selectionBox.getBoundingClientRect()

  if (rect.width < 10 || rect.height < 10) {
    document.body.removeChild(selectionBox)
    selectionBox = null
    return
  }

  document.body.removeChild(selectionBox)
  selectionBox = null

  try {
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
    if (selectionBox) {
      document.body.removeChild(selectionBox)
      selectionBox = null
    }
    window.ipcRenderer.invoke('hide-overlay')
  }
}

onMounted(() => {
  console.log('Overlay component mounted')
  document.addEventListener('mousedown', onMouseDown)
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
  document.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onMouseDown)
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
  document.removeEventListener('keydown', onKeyDown)

  if (selectionBox) {
    document.body.removeChild(selectionBox)
  }
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
  position: absolute;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  cursor: crosshair;
  z-index: 9999;
}
.selection-box {
  border: 2px dashed #fff;
  background-color: rgba(255, 255, 255, 0.1);
  position: absolute;
  pointer-events: none;
  z-index: 10000;
}
</style>
