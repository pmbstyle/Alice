import type { OpenAI } from 'openai'
import rawFunctionSchemasFromFile from '../../docs/functions.json'

export interface ApiRequestBodyFunctionTool {
  type: 'function'
  name: string
  strict: boolean
  description?: string
  parameters: OpenAI.FunctionTool.Parameters
}

export const PREDEFINED_OPENAI_TOOLS: ApiRequestBodyFunctionTool[] = (
  rawFunctionSchemasFromFile as any[]
).map(schema => {
  if (
    schema.parameters &&
    schema.parameters.type === 'object' &&
    schema.parameters.additionalProperties === undefined
  ) {
    schema.parameters.additionalProperties = false
  }
  return {
    type: 'function',
    name: schema.name,
    description: schema.description,
    parameters: schema.parameters,
  }
})
