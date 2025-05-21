<template>
  <div class="absolute bottom-0 py-2 z-20 flex flex-col w-full bg-black/60">
    <div class="pb-2 rounded-lg flex items-center justify-center gap-8">
      <img
        :src="micIconSrc"
        class="indicator"
        :class="{ mini: isMinimized }"
        @click="!isConfigState ? emit('toggleRecording') : null"
        data-tip="Toggle Microphone"
        :aria-label="micAriaLabel"
      />
      <img
        :src="props.isTTSEnabled ? speakerIcon : speakerIconInactive"
        class="indicator"
        :class="{ mini: isMinimized }"
        @click="!isConfigState ? emit('togglePlaying') : null"
        data-tip="Toggle Speech Output"
        aria-label="Toggle Speech Output"
      />
      <img
        v-if="!isMinimized"
        :src="chatIcon"
        class="indicator"
        @click="!isConfigState ? changeSidebarView('chat') : null"
        data-tip="Toggle Chat Panel"
        aria-label="Toggle Chat Panel"
      />
    </div>
    <div
      class="status-message-container dragable select-none overflow-hidden whitespace-nowrap relative"
      :class="{
        'text-xs': isMinimized,
        'h-4': isMinimized,
        'h-6': !isMinimized,
      }"
    >
      <span
        :id="statusMessageId"
        class="status-message-text absolute"
        :class="{ 'scrolling-text': shouldScrollStatusMessage }"
        :style="statusMessageStyle"
      >
        {{ statusMessage }}
      </span>
      <span
        v-if="shouldScrollStatusMessage"
        class="status-message-text absolute scrolling-text"
        :style="statusMessageStyle"
        aria-hidden="true"
      >
        {{ statusMessage }}
      </span>
    </div>
  </div>

  <template v-if="props.isElectron">
    <div
      class="absolute w-full px-2 flex justify-between z-30 inside-actions"
      :class="{ 'top-[80px]': isMinimized, 'top-[220px]': !isMinimized }"
    >
      <button
        class="btn btn-circle bg-opacity-20 bg-gray-500 border-0 p-2 btn-indicator-side tooltip tooltip-right"
        data-tip="Take Screenshot"
        aria-label="Take Screenshot"
        :class="{ 'btn-sm': isMinimized }"
        @click="!isConfigState ? emit('takeScreenShot') : null"
        :disabled="takingScreenShot"
      >
        <img
          :src="cameraIcon"
          class="indicator indicator-side"
          :class="{ mini: isMinimized }"
          alt=""
        />
      </button>
      <button
        class="btn btn-circle bg-opacity-20 bg-gray-500 border-0 p-2 btn-indicator-side tooltip tooltip-left"
        :data-tip="isMinimized ? 'Maximize' : 'Minimize'"
        :aria-label="isMinimized ? 'Maximize Window' : 'Minimize Window'"
        :class="{ 'btn-sm': isMinimized }"
        @click="!isConfigState ? toggleMinimize() : null"
      >
        <img
          :src="isMinimized ? maxiIcon : miniIcon"
          class="indicator indicator-side"
          :class="{ mini: isMinimized }"
          alt=""
        />
      </button>
    </div>

    <div class="absolute w-full flex justify-center z-30 top-2 inside-actions">
      <div class="dropdown dropdown-hover dropdown-center">
        <button
          tabindex="0"
          role="button"
          aria-label="Application Menu"
          class="btn btn-circle bg-opacity-20 bg-gray-500 border-0 p-2 btn-indicator-side close tooltip tooltip-bottom mb-2"
          :class="{ 'btn-sm': isMinimized }"
        >
          <img :src="hamburgerIcon" class="indicator indicator-side" alt="" />
        </button>
        <ul
          tabindex="0"
          class="dropdown-content menu bg-base-200 bg-opacity-80 rounded-box z-[1] w-36 p-2 shadow"
        >
          <li>
            <a @click="!isConfigState ? changeSidebarView('settings') : null"
              >Settings</a
            >
          </li>
          <li>
            <a @click="!isConfigState ? changeSidebarView('memories') : null"
              >Memories</a
            >
          </li>
          <li><a @click="closeWindow">Close app</a></li>
        </ul>
      </div>
    </div>
  </template>
</template>

<script setup lang="ts">
import {
  computed,
  defineProps,
  nextTick,
  ref,
  watch,
  onMounted,
} from 'vue'
import { useGeneralStore, AudioState } from '../stores/generalStore'
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
} from '../utils/assetsImport'

const props = defineProps({
  isElectron: {
    type: Boolean,
    default: false,
  },
  isTTSEnabled: {
    type: Boolean,
    required: true,
  },
  audioState: {
    type: String as () => AudioState,
    required: true,
  },
})

const emit = defineEmits(['takeScreenShot', 'togglePlaying', 'toggleRecording'])

const generalStore = useGeneralStore()
const {
  isMinimized,
  statusMessage,
  openSidebar,
  takingScreenShot,
  sideBarView,
} = storeToRefs(generalStore)

const statusMessageId = ref(
  `status-msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
)

const scrollSpeedFactor = 0.1
const scrollAnimationDuration = ref('10s')

const shouldScrollStatusMessage = computed(() => {
  return statusMessage.value.length > 20
})

const statusMessageStyle = computed(() => {
  if (shouldScrollStatusMessage.value) {
    return {
      'animation-duration': scrollAnimationDuration.value,
    }
  }
  return {}
})

const calculateScrollDuration = () => {
  nextTick(() => {
    const textEl = document.getElementById(statusMessageId.value)
    if (textEl && shouldScrollStatusMessage.value) {
      const textWidth = textEl.offsetWidth
      if (textWidth > 0) {
        const duration = textWidth * scrollSpeedFactor
        scrollAnimationDuration.value = `${Math.max(3, duration).toFixed(2)}s`
      } else {
        scrollAnimationDuration.value = `${(statusMessage.value.length * 0.3 * scrollSpeedFactor * 20).toFixed(2)}s`
      }
    } else if (!shouldScrollStatusMessage.value) {
      scrollAnimationDuration.value = '0s'
    }
  })
}

watch(
  statusMessage,
  () => {
    calculateScrollDuration()
  },
  { immediate: true }
)

watch(isMinimized, () => {
  calculateScrollDuration()
})

const micIconSrc = computed(() => {
  return props.audioState === 'LISTENING' ||
    (generalStore.isRecordingRequested && props.audioState !== 'IDLE')
    ? micIconActive
    : micIcon
})

const micAriaLabel = computed(() => {
  return generalStore.isRecordingRequested
    ? 'Stop Microphone'
    : 'Start Microphone'
})

const closeWindow = () => {
  if (props.isElectron) {
    ;(window as any).electron.closeApp()
  }
}

const changeSidebarView = (view: 'chat' | 'settings' | 'memories') => {
  if (sideBarView.value === view && openSidebar.value) {
    toggleSidebar()
  } else if (sideBarView.value !== view || !openSidebar.value) {
    sideBarView.value = view
    if (!openSidebar.value) {
      if (isMinimized.value) {
        toggleMinimize()
      }
      toggleSidebar()
    }
  }
}

const toggleSidebar = async () => {
  openSidebar.value = !openSidebar.value
  if (props.isElectron) {
    await nextTick()
    const targetWidth = openSidebar.value ? 1200 : 500
    const targetHeight = 500
    ;(window as any).electron.resize({
      width: targetWidth,
      height: targetHeight,
    })
  }
}

const toggleMinimize = async () => {
  const willMinimize = !isMinimized.value
  isMinimized.value = willMinimize

  if (props.isElectron) {
    await nextTick()

    if (willMinimize && openSidebar.value) {
      toggleSidebar()
      openSidebar.value = false
      setTimeout(() => {
        console.log('Minimizing window after closing sidebar.')
        ;(window as any).electron.mini({ minimize: true })
      }, 300)
    } else {
      console.log(`Toggling minimize state: ${willMinimize}`)
      ;(window as any).electron.mini({ minimize: willMinimize })
    }
  }
}

const isConfigState = computed(() => {
  return generalStore.audioState === 'CONFIG'
})

onMounted(() => {
  calculateScrollDuration()
})
</script>
