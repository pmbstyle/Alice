<template>
  <div class="space-y-6">
    <h3 class="text-xl font-semibold mb-4 text-yellow-400">Global Hotkeys</h3>
    <fieldset
      class="fieldset bg-gray-900/90 border-yellow-500/50 rounded-box w-full border p-4"
    >
      <legend class="fieldset-legend">Keyboard Shortcuts</legend>
      <div class="p-2 space-y-4">
        <div>
          <label for="mic-toggle-hotkey" class="block mb-1 text-sm"
            >Microphone Toggle Hotkey</label
          >
          <div class="flex items-center justify-between">
            <kbd class="kbd kbd-xl">{{
              formatAccelerator(currentSettings.microphoneToggleHotkey)
            }}</kbd>
            <div class="flex items-center gap-2">
              <button
                type="button"
                @click="
                  $emit('start-recording-hotkey', 'microphoneToggleHotkey')
                "
                class="btn btn-secondary btn-active btn-sm"
                :disabled="isRecordingHotkeyFor === 'microphoneToggleHotkey'"
              >
                {{
                  isRecordingHotkeyFor === 'microphoneToggleHotkey'
                    ? 'Recording...'
                    : 'Record'
                }}
              </button>
              <button
                type="button"
                @click="$emit('clear-hotkey', 'microphoneToggleHotkey')"
                class="btn btn-warning btn-outline btn-sm"
                :disabled="!currentSettings.microphoneToggleHotkey"
              >
                Clear
              </button>
            </div>
          </div>
          <p
            v-if="isRecordingHotkeyFor === 'microphoneToggleHotkey'"
            class="text-xs text-yellow-400 mt-1"
          >
            Press the desired key combination. Press Esc to cancel.
          </p>
        </div>

        <div>
          <label for="mute-playback-hotkey" class="block mb-1 text-sm"
            >Mute Playback Hotkey</label
          >
          <div class="flex items-center justify-between">
            <kbd class="kbd kbd-xl">{{
              formatAccelerator(currentSettings.mutePlaybackHotkey)
            }}</kbd>
            <div class="flex items-center gap-2">
              <button
                type="button"
                @click="$emit('start-recording-hotkey', 'mutePlaybackHotkey')"
                class="btn btn-secondary btn-active btn-sm"
                :disabled="isRecordingHotkeyFor === 'mutePlaybackHotkey'"
              >
                {{
                  isRecordingHotkeyFor === 'mutePlaybackHotkey'
                    ? 'Recording...'
                    : 'Record'
                }}
              </button>
              <button
                type="button"
                @click="$emit('clear-hotkey', 'mutePlaybackHotkey')"
                class="btn btn-warning btn-outline btn-sm"
                :disabled="!currentSettings.mutePlaybackHotkey"
              >
                Clear
              </button>
            </div>
          </div>
          <p
            v-if="isRecordingHotkeyFor === 'mutePlaybackHotkey'"
            class="text-xs text-yellow-400 mt-1"
          >
            Press the desired key combination. Press Esc to cancel.
          </p>
        </div>

        <div>
          <label for="take-screenshot-hotkey" class="block mb-1 text-sm"
            >Take Screenshot Hotkey</label
          >
          <div class="flex items-center justify-between">
            <kbd class="kbd kbd-xl">{{
              formatAccelerator(currentSettings.takeScreenshotHotkey)
            }}</kbd>
            <div class="flex items-center gap-2">
              <button
                type="button"
                @click="$emit('start-recording-hotkey', 'takeScreenshotHotkey')"
                class="btn btn-secondary btn-active btn-sm"
                :disabled="isRecordingHotkeyFor === 'takeScreenshotHotkey'"
              >
                {{
                  isRecordingHotkeyFor === 'takeScreenshotHotkey'
                    ? 'Recording...'
                    : 'Record'
                }}
              </button>
              <button
                type="button"
                @click="$emit('clear-hotkey', 'takeScreenshotHotkey')"
                class="btn btn-warning btn-outline btn-sm"
                :disabled="!currentSettings.takeScreenshotHotkey"
              >
                Clear
              </button>
            </div>
          </div>
          <p
            v-if="isRecordingHotkeyFor === 'takeScreenshotHotkey'"
            class="text-xs text-yellow-400 mt-1"
          >
            Press the desired key combination. Press Esc to cancel.
          </p>
        </div>
      </div>
    </fieldset>
  </div>
</template>

<script setup lang="ts">
import type { AliceSettings } from '../../stores/settingsStore'

defineProps<{
  currentSettings: AliceSettings
  isRecordingHotkeyFor: keyof AliceSettings | null
}>()

defineEmits<{
  'start-recording-hotkey': [settingKey: keyof AliceSettings]
  'clear-hotkey': [settingKey: keyof AliceSettings]
}>()

function formatAccelerator(accelerator: string | undefined): string {
  if (!accelerator) return ''
  return accelerator.replace(/\+/g, ' + ')
}
</script>
