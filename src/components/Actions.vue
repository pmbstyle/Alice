<template>
  <div
    class="absolute bottom-0 py-2 z-20 flex flex-col w-full bg-black bg-opacity-60"
  >
    <div class="pb-2 rounded-lg flex items-center justify-center gap-8">
      <img
        :src="isRecordingRequested ? micIconActive : micIcon"
        class="indicator"
        :class="{ mini: isMinimized }"
        @click="toggleRecording"
      />
      <!-- <img
        :src="chatIcon"
        class="indicator"
        :class="{ hidden: isMinimized }"
        @click="toggleChat()"
      /> -->
    </div>
    <div class="text-center dragable" :class="{ 'text-xs': isMinimized }">
      {{ statusMessage }}
    </div>
  </div>
  <div
    class="absolute w-full px-2 flex justify-between z-80"
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
        :src="takingScreenShot ? uploadIcon : cameraIcon"
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
    class="absolute w-full flex justify-center z-80 top-2"
    v-if="props.isElectron"
  >
    <button
      class="btn btn-circle bg-disabled border-0 p-2 btn-indicator-side close tooltip tooltip-bottom"
      data-tip="Close the App"
      :class="{ 'btn-sm': isMinimized }"
      @click="closeWindow()"
    >
      <img :src="closeIcon" class="indicator indicator-side" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { nextTick, defineEmits, defineProps } from 'vue'
import { useGeneralStore } from '../stores/generalStore.ts'
import { storeToRefs } from 'pinia'
import {
  micIcon,
  micIconActive,
  chatIcon,
  miniIcon,
  maxiIcon,
  cameraIcon,
  uploadIcon,
  closeIcon,
} from '../utils/assetsImport.ts'

const generalStore = useGeneralStore()

const props = defineProps({
  isElectron: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['takeScreenShot', 'toggleRecording'])
const {
  isMinimized,
  takingScreenShot,
  isRecordingRequested,
  statusMessage,
  openChat,
} = storeToRefs(generalStore)

const closeWindow = () => {
  ;(window as any).electron.closeApp()
}

const toggleChat = async () => {
  openChat.value = !openChat.value
  await nextTick()
  if (props.isElectron) {
    if (openChat.value) {
      ;(window as any).electron.resize({ width: 1200, height: 500 })
    } else {
      ;(window as any).electron.resize({ width: 500, height: 500 })
    }
  }
}

const toggleMinimize = async () => {
  isMinimized.value = !isMinimized.value
  await nextTick()
   if (props.isElectron) {
    if (isMinimized.value) {
      if (openChat.value) {
        await toggleChat()
        setTimeout(() => {
          ;(window as any).electron.mini({ minimize: true })
        }, 300) // Adjust delay if needed
      } else {
        ;(window as any).electron.mini({ minimize: true })
      }
    } else {
      ;(window as any).electron.mini({ minimize: false })
    }
  }
}

const takeScreenShot = async () => {
  await emit('takeScreenShot')
}

const toggleRecording = async () => {
  await emit('toggleRecording')
}
</script>

<style scoped lang="postcss">
.indicator {
  cursor: pointer;
  transition: all 0.3s ease-in-out;
  @apply p-2 rounded-full touch-auto w-14;
  &:hover {
    @apply bg-primary bg-opacity-10;
  }
  &.mini {
    @apply w-4 h-4 p-0;
  }
  &.indicator-side {
    @apply rounded-none p-0;
    &:hover {
      @apply bg-opacity-0;
    }
  }
}

.btn-indicator-side {
  transition: all 0.3s ease-in-out;
  @apply bg-opacity-30;
  &:hover {
    @apply bg-opacity-80;
    &.close {
      @apply bg-red-500;
    }
  }
}

.dragable {
  -webkit-user-select: none;
  -webkit-app-region: drag;
  cursor: move;
}
</style>