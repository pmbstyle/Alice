<template>
  <div
    class="absolute bottom-0 py-2 z-20 flex flex-col w-full bg-black bg-black/60"
  >
    <div class="pb-2 rounded-lg flex items-center justify-center gap-8">
      <img
        :src="isRecordingRequested ? micIconActive : micIcon"
        class="indicator"
        :class="{ mini: isMinimized }"
        @click="toggleRecording"
      />
      <img
        :src="!isPlaying ? speakerIconInactive : speakerIcon"
        class="indicator"
        :class="{ mini: isMinimized }"
        @click="togglePlaying"
      />
      <img
        :src="chatIcon"
        class="indicator"
        :class="{ hidden: isMinimized }"
        @click="toggleChat()"
      />
    </div>
    <div class="text-center dragable" :class="{ 'text-xs': isMinimized }">
      {{ statusMessage }}
    </div>
  </div>
  <div
    class="absolute w-full px-2 flex justify-between z-80 inside-actions"
    :class="{ 'top-[80px]': isMinimized, 'top-[220px]': !isMinimized }"
    v-if="props.isElectron"
  >
    <button
      class="btn btn-circle bg-disabled border-0 p-2 btn-indicator-side tooltip tooltip-right"
      data-tip="Screenshot"
      :class="{ 'btn-sm': isMinimized }"
      @click="takeScreenShot"
    >
      <img
        :src="cameraIcon"
        class="indicator indicator-side"
        :class="{ mini: isMinimized }"
      />
    </button>
    <button
      class="btn btn-circle bg-default border-0 p-2 btn-indicator-side tooltip tooltip-left"
      :data-tip="isMinimized ? 'Maximize' : 'Minimize'"
      :class="{ 'btn-sm': isMinimized }"
      @click="toggleMinimize"
    >
      <img
        :src="isMinimized ? maxiIcon : miniIcon"
        class="indicator indicator-side"
        :class="{ mini: isMinimized }"
      />
    </button>
  </div>
  <div
    class="absolute w-full flex justify-center z-80 top-2 inside-actions"
    v-if="props.isElectron"
  >
    <div class="dropdown dropdown-hover dropdown-center">
      <div
        tabindex="0"
        role="button"
        class="btn btn-circle bg-disabled border-0 p-2 btn-indicator-side close tooltip tooltip-bottom mb-2"
        :class="{ 'btn-sm': isMinimized }"
      >
        <img :src="hamburgerIcon" class="indicator indicator-side" />
      </div>
      <ul
        tabindex="0"
        class="dropdown-content menu bg-black/60 rounded-box z-1 w-36 p-2 shadow-sm"
      >
        <!-- <li>
          <a>Settings</a>
        </li> -->
        <li>
          <a @click="closeWindow()">
            Close app
          </a>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, defineEmits, defineProps } from 'vue'
import { useGeneralStore } from '../stores/generalStore'
import { storeToRefs } from 'pinia'
import {
  micIcon,
  micIconActive,
  speakerIcon,
  speakerIconInactive,
  chatIcon,
  miniIcon,
  maxiIcon,
  cameraIcon,
  hamburgerIcon,
} from '../utils/assetsImport.ts'

const generalStore = useGeneralStore()

const props = defineProps({
  isElectron: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['takeScreenShot', 'togglePlaying', 'toggleRecording'])
const {
  isMinimized,
  isRecordingRequested,
  isPlaying,
  statusMessage,
  openSidebar,
} = storeToRefs(generalStore)

const closeWindow = () => {
  ;(window as any).electron.closeApp()
}

const toggleChat = async () => {
  openSidebar.value = !openSidebar.value
  await nextTick()
  if (openSidebar.value) {
    ;(window as any).electron.resize({ width: 1200, height: 500 })
  } else {
    ;(window as any).electron.resize({ width: 500, height: 500 })
  }
}

const toggleMinimize = async () => {
  isMinimized.value = !isMinimized.value
  await nextTick()
  if (isMinimized.value) {
    if (openSidebar.value) {
      toggleChat()
      setTimeout(() => {
        ;(window as any).electron.mini({ minimize: true })
      }, 1000)
    } else {
      ;(window as any).electron.mini({ minimize: true })
    }
  } else {
    ;(window as any).electron.mini({ minimize: false })
  }
}

const takeScreenShot = async () => {
  await emit('takeScreenShot')
}

const togglePlaying = async () => {
  await emit('togglePlaying')
}

const toggleRecording = async () => {
  await emit('toggleRecording')
}
</script>
