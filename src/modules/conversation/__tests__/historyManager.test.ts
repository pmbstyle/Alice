import { describe, expect, it, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import { createHistoryManager } from '../historyManager'
import type { ChatMessage } from '../../../types/chat'

function setup(initial: ChatMessage[] = []) {
  const chatHistory = ref<ChatMessage[]>(initial)
  const manager = createHistoryManager(chatHistory)
  return { chatHistory, manager }
}

describe('historyManager', () => {
  beforeEach(() => {
    // silence expected console warnings
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('adds messages with generated ids', () => {
    const { chatHistory, manager } = setup()
    const id = manager.addMessageToHistory({
      role: 'user',
      content: 'hello',
    })

    expect(chatHistory.value[0].local_id_temp).toBe(id)
    expect(chatHistory.value).toHaveLength(1)
  })

  it('updates message api id by temp id', () => {
    const { chatHistory, manager } = setup([
      { local_id_temp: 'tmp1', role: 'assistant', content: 'hi' },
    ])

    manager.updateMessageApiIdByTempId('tmp1', 'api-1')
    expect(chatHistory.value[0].api_message_id).toBe('api-1')
  })

  it('appends deltas and transforms to error when needed', () => {
    const { chatHistory, manager } = setup([
      { local_id_temp: 'tmp1', role: 'assistant', content: '' },
    ])

    manager.appendMessageDeltaByTempId('tmp1', 'Error: Something failed')
    const content = chatHistory.value[0].content
    expect(Array.isArray(content)).toBe(true)
    expect((content as any[])[0].type).toBe('app_error')
  })

  it('adds content parts to existing array', () => {
    const { chatHistory, manager } = setup([
      { local_id_temp: 'tmp1', role: 'assistant', content: 'text' },
    ])

    manager.addContentPartToMessageByTempId('tmp1', {
      type: 'app_text',
      text: 'extra',
    })

    const parts = chatHistory.value[0].content as any[]
    expect(parts).toHaveLength(2)
    expect(parts[1].text).toBe('extra')
  })

  it('updates image content by generation id', () => {
    const { chatHistory, manager } = setup([
      {
        local_id_temp: 'tmp1',
        role: 'assistant',
        content: [
          {
            type: 'app_generated_image_path',
            imageGenerationId: 'img1',
            path: '',
          },
        ],
      },
    ])

    manager.updateImageContentPartByGenerationId(
      'tmp1',
      'img1',
      '/new.png',
      '/abs/new.png',
      false
    )

    const part = (chatHistory.value[0].content as any[])[0]
    expect(part.path).toBe('/new.png')
    expect(part.absolutePathForOpening).toBe('/abs/new.png')
  })

  it('updates message content by temp id', () => {
    const { chatHistory, manager } = setup([
      { local_id_temp: 'tmp1', role: 'assistant', content: '' },
    ])

    manager.updateMessageContentByTempId('tmp1', 'new content')
    const parts = chatHistory.value[0].content as any[]
    expect(parts[0]).toMatchObject({ type: 'app_text', text: 'new content' })
  })

  it('adds tool calls to a message even when list empty', () => {
    const { chatHistory, manager } = setup([
      { local_id_temp: 'tmp1', role: 'assistant', content: '' },
    ])

    manager.addToolCallToMessageByTempId('tmp1', { id: 'call1' })
    manager.addToolCallToMessageByTempId('tmp1', { id: 'call1' })

    expect(chatHistory.value[0].tool_calls).toHaveLength(1)
  })
})
