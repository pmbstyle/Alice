export async function* convertLocalLLMStreamToResponsesFormat(
  stream: any,
  provider: 'ollama' | 'lm-studio'
) {
  let responseId = `${provider}-${Date.now()}`
  let messageItemId = `message-${Date.now()}`
  let toolCallsBuffer = new Map()

  yield {
    type: 'response.created',
    response: {
      id: responseId,
      object: 'realtime.response',
      status: 'in_progress',
      output: [],
    },
  }

  yield {
    type: 'response.output_item.added',
    response_id: responseId,
    item_id: messageItemId,
    item: {
      id: messageItemId,
      type: 'message',
      role: 'assistant',
      content: [],
    },
  }

  try {
    for await (const chunk of stream) {
      if (chunk.choices && chunk.choices[0]) {
        const choice = chunk.choices[0]

        if (choice.delta && choice.delta.content) {
          yield {
            type: 'response.output_text.delta',
            response_id: responseId,
            item_id: messageItemId,
            output_index: 0,
            content_index: 0,
            delta: choice.delta.content,
          }
        }

        if (choice.delta && choice.delta.tool_calls) {
          for (const toolCall of choice.delta.tool_calls) {
            if (toolCall.function || toolCall.id) {
              const toolCallIndex = toolCall.index || 0
              const toolCallId = `tool-${toolCallIndex}`

              if (!toolCallsBuffer.has(toolCallId)) {
                toolCallsBuffer.set(toolCallId, {
                  id: toolCall.id || toolCallId,
                  name: toolCall.function?.name || '',
                  arguments: '',
                })
              }

              const bufferedCall = toolCallsBuffer.get(toolCallId)
              if (bufferedCall) {
                if (toolCall.id && !bufferedCall.id.startsWith('tool-')) {
                  bufferedCall.id = toolCall.id
                }

                if (toolCall.function?.name && !bufferedCall.name) {
                  bufferedCall.name = toolCall.function.name
                  console.log(
                    `[${provider}] Updated name for ${toolCallId}:`,
                    bufferedCall.name
                  )

                  yield {
                    type: 'response.output_item.added',
                    response_id: responseId,
                    item_id: toolCallId,
                    item: {
                      id: toolCallId,
                      type: 'function_call',
                      name: toolCall.function.name,
                      arguments: '',
                    },
                  }
                }

                if (toolCall.function?.arguments) {
                  bufferedCall.arguments += toolCall.function.arguments
                  console.log(
                    `[${provider}] Accumulated arguments for ${toolCallId}:`,
                    bufferedCall.arguments
                  )

                  yield {
                    type: 'response.function_call_arguments.delta',
                    response_id: responseId,
                    item_id: toolCallId,
                    delta: toolCall.function.arguments,
                  }
                }
              }
            }
          }
        }

        if (
          choice.finish_reason === 'stop' ||
          choice.finish_reason === 'tool_calls'
        ) {
          console.log(
            `[${provider}] Finishing stream, toolCallsBuffer size:`,
            toolCallsBuffer.size
          )

          for (const [toolCallId, toolData] of toolCallsBuffer) {
            if (!toolData.name) {
              console.log(
                `[${provider}] Skipping tool call ${toolCallId} - no function name`
              )
              continue
            }

            console.log(
              `[${provider}] Completing tool call ${toolCallId}:`,
              toolData
            )

            let parsedArguments = toolData.arguments
            if (
              typeof toolData.arguments === 'string' &&
              toolData.arguments.trim()
            ) {
              try {
                parsedArguments = JSON.parse(toolData.arguments)
              } catch (e) {
                console.error(
                  `[${provider}] Failed to parse tool arguments:`,
                  toolData.arguments,
                  e
                )
                parsedArguments = {}
              }
            } else if (!toolData.arguments || toolData.arguments === '') {
              console.error(
                `[${provider}] Empty arguments for tool call ${toolCallId}`
              )
              parsedArguments = {}
            }

            yield {
              type: 'response.output_item.done',
              response_id: responseId,
              item_id: toolCallId,
              item: {
                id: toolCallId,
                call_id: toolData.id,
                type: 'function_call',
                name: toolData.name,
                arguments: parsedArguments,
              },
            }
          }

          yield {
            type: 'response.output_item.done',
            response_id: responseId,
            item_id: messageItemId,
            item: {
              id: messageItemId,
              type: 'message',
              role: 'assistant',
              content: [],
            },
          }

          yield {
            type: 'response.done',
            response: {
              id: responseId,
              object: 'realtime.response',
              status: 'completed',
              output: [],
            },
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error in ${provider} stream conversion:`, error)

    yield {
      type: 'error',
      error: {
        type: 'server_error',
        message: error.message || 'Unknown error',
      },
    }
  }
}

export async function* convertOpenRouterStreamToResponsesFormat(stream: any) {
  let responseId = `openrouter-${Date.now()}`
  let messageItemId = `message-${Date.now()}`
  let toolCallsBuffer = new Map()

  yield {
    type: 'response.created',
    response: {
      id: responseId,
      object: 'realtime.response',
      status: 'in_progress',
      output: [],
    },
  }

  yield {
    type: 'response.output_item.added',
    response_id: responseId,
    item_id: messageItemId,
    item: {
      id: messageItemId,
      type: 'message',
      role: 'assistant',
      content: [],
    },
  }

  try {
    for await (const chunk of stream) {
      if (chunk.choices && chunk.choices[0]) {
        const choice = chunk.choices[0]

        if (choice.delta && choice.delta.content) {
          yield {
            type: 'response.output_text.delta',
            response_id: responseId,
            item_id: messageItemId,
            output_index: 0,
            content_index: 0,
            delta: choice.delta.content,
          }
        }

        if (choice.delta && choice.delta.tool_calls) {
          for (const toolCall of choice.delta.tool_calls) {
            if (toolCall.function || toolCall.id) {
              const toolCallIndex = toolCall.index || 0
              const toolCallId = `tool-${toolCallIndex}`

              if (!toolCallsBuffer.has(toolCallId)) {
                toolCallsBuffer.set(toolCallId, {
                  id: toolCall.id || toolCallId,
                  name: toolCall.function?.name || '',
                  arguments: '',
                })
              }

              const bufferedCall = toolCallsBuffer.get(toolCallId)
              if (bufferedCall) {
                if (toolCall.id && !bufferedCall.id.startsWith('tool-')) {
                  bufferedCall.id = toolCall.id
                }

                if (toolCall.function?.name && !bufferedCall.name) {
                  bufferedCall.name = toolCall.function.name
                  console.log(
                    `[OpenRouter] Updated name for ${toolCallId}:`,
                    bufferedCall.name
                  )

                  yield {
                    type: 'response.output_item.added',
                    response_id: responseId,
                    item_id: toolCallId,
                    item: {
                      id: toolCallId,
                      type: 'function_call',
                      name: toolCall.function.name,
                      arguments: '',
                    },
                  }
                }

                if (toolCall.function?.arguments) {
                  bufferedCall.arguments += toolCall.function.arguments
                  console.log(
                    `[OpenRouter] Accumulated arguments for ${toolCallId}:`,
                    bufferedCall.arguments
                  )

                  yield {
                    type: 'response.function_call_arguments.delta',
                    response_id: responseId,
                    item_id: toolCallId,
                    delta: toolCall.function.arguments,
                  }
                }
              }
            }
          }
        }

        if (
          choice.finish_reason === 'stop' ||
          choice.finish_reason === 'tool_calls'
        ) {
          console.log(
            `[OpenRouter] Finishing stream, toolCallsBuffer size:`,
            toolCallsBuffer.size
          )
          console.log(
            `[OpenRouter] toolCallsBuffer contents:`,
            Array.from(toolCallsBuffer.entries())
          )

          for (const [toolCallId, toolData] of toolCallsBuffer) {
            if (!toolData.name) {
              console.log(
                `[OpenRouter] Skipping tool call ${toolCallId} - no function name`
              )
              continue
            }

            console.log(
              `[OpenRouter] Completing tool call ${toolCallId}:`,
              toolData
            )
            console.log(
              `[OpenRouter] Raw arguments string:`,
              toolData.arguments
            )

            let parsedArguments = toolData.arguments
            if (
              typeof toolData.arguments === 'string' &&
              toolData.arguments.trim()
            ) {
              try {
                parsedArguments = JSON.parse(toolData.arguments)
              } catch (e) {
                console.error(
                  `[OpenRouter] Failed to parse tool arguments:`,
                  toolData.arguments,
                  e
                )
                parsedArguments = {}
              }
            } else if (!toolData.arguments || toolData.arguments === '') {
              console.error(
                `[OpenRouter] Empty arguments for tool call ${toolCallId}`
              )
              parsedArguments = {}
            }

            yield {
              type: 'response.output_item.done',
              response_id: responseId,
              item_id: toolCallId,
              item: {
                id: toolCallId,
                call_id: toolData.id,
                type: 'function_call',
                name: toolData.name,
                arguments: parsedArguments,
              },
            }
          }

          yield {
            type: 'response.output_item.done',
            response_id: responseId,
            item_id: messageItemId,
            item: {
              id: messageItemId,
              type: 'message',
              role: 'assistant',
              content: [],
            },
          }

          yield {
            type: 'response.done',
            response: {
              id: responseId,
              object: 'realtime.response',
              status: 'completed',
              output: [],
            },
          }
        }
      }
    }
  } catch (error) {
    console.error('Error in OpenRouter stream conversion:', error)

    yield {
      type: 'error',
      error: {
        type: 'server_error',
        message: error.message || 'Unknown error',
      },
    }
  }
}
