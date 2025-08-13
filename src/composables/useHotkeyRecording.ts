import { ref, onUnmounted } from 'vue'
import type { AliceSettings } from '../stores/settingsStore'

export function useHotkeyRecording() {
  const isRecordingHotkeyFor = ref<keyof AliceSettings | null>(null)
  const activeRecordingKeys = ref<Set<string>>(new Set())

  const modifierKeys = [
    'Control',
    'Alt',
    'Shift',
    'Meta',
    'Command',
    'Cmd',
    'Option',
    'Super',
  ]

  const keyToAcceleratorMap: Record<string, string> = {
    Control: 'Control',
    Alt: 'Alt',
    Shift: 'Shift',
    Meta: 'Super',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Escape: 'Esc',
    Enter: 'Return',
    Delete: 'Delete',
    Backspace: 'Backspace',
    Tab: 'Tab',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Home: 'Home',
    End: 'End',
    Insert: 'Insert',
    Space: 'Space',
    '+': 'Plus',
  }

  function electronAcceleratorForKey(key: string): string {
    if (key.length === 1 && key.match(/[a-z0-9]/i)) {
      return key.toUpperCase()
    }
    return keyToAcceleratorMap[key] || key
  }

  const handleHotkeyKeyDown = (event: KeyboardEvent, currentSettings: any) => {
    if (!isRecordingHotkeyFor.value) return

    event.preventDefault()
    event.stopPropagation()

    const key = event.key
    if (key === 'Escape') {
      stopRecordingHotkey()
      return
    }

    if (
      modifierKeys.includes(key) ||
      modifierKeys.map(m => m.toLowerCase()).includes(key.toLowerCase())
    ) {
      activeRecordingKeys.value.add(
        electronAcceleratorForKey(
          key === 'Meta' && navigator.platform.toUpperCase().indexOf('MAC') >= 0
            ? 'Command'
            : key === 'Meta'
              ? 'Super'
              : key
        )
      )
    } else {
      const mainKey = electronAcceleratorForKey(key)
      activeRecordingKeys.value.add(mainKey)
      const acceleratorParts = Array.from(activeRecordingKeys.value)

      const order = ['Control', 'Alt', 'Shift', 'Super', 'Command']
      acceleratorParts.sort((a, b) => {
        const aIsModifier = order.includes(a)
        const bIsModifier = order.includes(b)
        if (aIsModifier && !bIsModifier) return -1
        if (!aIsModifier && bIsModifier) return 1
        if (aIsModifier && bIsModifier) return order.indexOf(a) - order.indexOf(b)
        return a.localeCompare(b)
      })

      const newHotkey = acceleratorParts.join('+')
      if (isRecordingHotkeyFor.value) {
        currentSettings[isRecordingHotkeyFor.value as keyof AliceSettings] = newHotkey
      }
      stopRecordingHotkey()
    }
  }

  let currentKeyHandler: ((event: KeyboardEvent) => void) | null = null

  const startRecordingHotkey = (settingKey: keyof AliceSettings, currentSettings: any) => {
    isRecordingHotkeyFor.value = settingKey
    activeRecordingKeys.value.clear()
    
    if (currentKeyHandler) {
      window.removeEventListener('keydown', currentKeyHandler, true)
    }
    
    currentKeyHandler = (event: KeyboardEvent) => handleHotkeyKeyDown(event, currentSettings)
    window.addEventListener('keydown', currentKeyHandler, true)
  }

  const stopRecordingHotkey = () => {
    if (currentKeyHandler) {
      window.removeEventListener('keydown', currentKeyHandler, true)
      currentKeyHandler = null
    }
    isRecordingHotkeyFor.value = null
    activeRecordingKeys.value.clear()
  }

  const clearHotkey = (settingKey: keyof AliceSettings, currentSettings: any) => {
    if (isRecordingHotkeyFor.value === settingKey) {
      stopRecordingHotkey()
    }
    currentSettings[settingKey] = ''
  }

  onUnmounted(() => {
    if (isRecordingHotkeyFor.value) {
      stopRecordingHotkey()
    }
  })

  return {
    isRecordingHotkeyFor,
    startRecordingHotkey,
    stopRecordingHotkey,
    clearHotkey,
  }
}