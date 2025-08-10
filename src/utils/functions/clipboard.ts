interface FunctionResult {
  success: boolean
  data?: any
  error?: string
}

interface ManageClipboardArgs {
  action: 'read' | 'write'
  content?: string
}

export async function manage_clipboard(
  args: ManageClipboardArgs
): Promise<FunctionResult> {
  console.log(`Invoking clipboard action: ${args.action}`)

  try {
    if (typeof window === 'undefined' || !window.ipcRenderer?.invoke) {
      return {
        success: false,
        error:
          'Electron IPC bridge not available. This function only works in the desktop app.',
      }
    }

    if (args.action !== 'read' && args.action !== 'write') {
      return {
        success: false,
        error: 'Invalid clipboard action. Must be "read" or "write".',
      }
    }

    if (
      args.action === 'write' &&
      (args.content === undefined || args.content === null)
    ) {
      return {
        success: false,
        error: 'Content is required for clipboard write operations.',
      }
    }

    const result = await window.ipcRenderer.invoke(
      'electron:manage-clipboard',
      args
    )
    console.log('Main process response for clipboard operation:', result)

    if (result.success) {
      if (args.action === 'read' && result.data !== undefined) {
        return {
          success: true,
          data: result.data,
        }
      }

      return {
        success: true,
        data: { message: result.message },
      }
    } else {
      return {
        success: false,
        error: result.message,
      }
    }
  } catch (error) {
    console.error('Error during clipboard operation:', error)
    return {
      success: false,
      error: `Failed to perform clipboard operation: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}
