<template>
  <div id="overlay"></div>
</template>

<script setup>
  import { onMounted, onBeforeUnmount } from 'vue'

  let startX, startY, selectionBox

  function onMouseDown(e) {
    startX = e.clientX
    startY = e.clientY
    selectionBox = document.createElement('div')
    selectionBox.classList.add('selection-box')
    selectionBox.style.left = `${startX}px`
    selectionBox.style.top = `${startY}px`
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
    const rect = selectionBox.getBoundingClientRect()
    document.body.removeChild(selectionBox)

    const source = (await window.ipcRenderer.invoke('capture-screen'))[0]
    const image = await navigator.mediaDevices.getUserMedia({
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: source.id,
          minWidth: screen.width,
          maxWidth: screen.width,
          minHeight: screen.height,
          maxHeight: screen.height
        }
      }
    })

    const track = image.getVideoTracks()[0]
    const capture = new ImageCapture(track)
    const bitmap = await capture.grabFrame()
    track.stop()

    const canvas = document.createElement('canvas')
    canvas.width = rect.width
    canvas.height = rect.height
    const context = canvas.getContext('2d')
    context.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height)
    const dataURL = await canvas.toDataURL()
    window.ipcRenderer.invoke('save-screenshot', dataURL)
    window.ipcRenderer.invoke('hide-overlay')
  }

  onMounted(() => {
    const overlay = document.getElementById('overlay')
    overlay.addEventListener('mousedown', onMouseDown)
    overlay.addEventListener('mousemove', onMouseMove)
    overlay.addEventListener('mouseup', onMouseUp)
  })

  onBeforeUnmount(() => {
    const overlay = document.getElementById('overlay')
    overlay.removeEventListener('mousedown', onMouseDown)
    overlay.removeEventListener('mousemove', onMouseMove)
    overlay.removeEventListener('mouseup', onMouseUp)
  })
</script>

<style>
body, html {
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
}
.selection-box {
  border: 2px dashed #fff;
  position: absolute;
  pointer-events: none;
}
</style>
