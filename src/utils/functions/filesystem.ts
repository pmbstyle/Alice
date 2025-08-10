import { useSettingsStore } from '../../stores/settingsStore'

interface FunctionResult {
  success: boolean
  data?: any
  error?: string
}

export interface OpenPathArgs {
  target: string
}

export interface ListDirectoryArgs {
  path: string
}

export interface ExecuteCommandArgs {
  command: string
}

export async function open_path(args: OpenPathArgs): Promise<FunctionResult> {
  console.log(`Invoking open_path with target: ${args.target}`)

  try {
    if (typeof window === 'undefined' || !window.ipcRenderer?.invoke) {
      return {
        success: false,
        error:
          'Electron IPC bridge not available. This function only works in the desktop app.',
      }
    }

    const result = await window.ipcRenderer.invoke('electron:open-path', args)
    console.log('Main process response for open_path:', result)

    if (result.success) {
      return { success: true, data: { message: result.message } }
    } else {
      return { success: false, error: result.message }
    }
  } catch (error) {
    console.error('Error invoking electron:open-path:', error)
    return {
      success: false,
      error: `Failed to execute open_path: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

export async function list_directory(
  args: ListDirectoryArgs
): Promise<FunctionResult> {
  try {
    const result = await window.ipcRenderer.invoke(
      'desktop:listDirectory',
      args.path
    )
    if (result.success) {
      return { success: true, data: result.files }
    } else {
      return { success: false, error: result.error }
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function execute_command(
  args: ExecuteCommandArgs
): Promise<FunctionResult> {
  try {
    const settingsStore = useSettingsStore()
    const commandName = args.command.split(' ')[0]

    if (!settingsStore.isCommandApproved(args.command)) {
      const approvalResult = await (window as any).requestCommandApproval(
        args.command
      )

      if (!approvalResult.approved) {
        return { success: false, error: 'Command execution denied by user' }
      }
    }

    const result = await window.ipcRenderer.invoke(
      'desktop:executeCommand',
      args.command
    )
    if (result.success) {
      return { success: true, data: result.output }
    } else {
      return { success: false, error: result.error }
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
